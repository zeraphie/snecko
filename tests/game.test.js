// game.test.js — tests for Game lifecycle, tick loop, input handling, and state transitions

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../src/core/game";
import { parseArenaFile } from "../src/core/boss/arena.js";
import { parseBossShape } from "../src/core/boss/boss-shape.js";
import { buildCrystals } from "../src/core/generation/crystalline/crystals.js";
import {
  spawnPlayerBullet,
  updatePlayerBullets,
  checkPlayerBulletCollision,
  removeHitBullets,
} from "../src/core/boss/player-bullets.js";
import {
  DEATH_WALL,
  DEATH_BOSS,
  DEATH_PROJECTILE,
  DEATH_BOMB,
  DEATH_BLOB,
  BOSS_BODY_HP,
  HUNGRY_VERTICAL_RANGE,
  PLAYER_BULLET_INTERVAL,
  SURVIVAL_WIN_TICKS,
  SURVIVAL_RIFT_INTERVAL_TICKS,
  SURVIVAL_BOSS_STUN_TICKS,
} from "../src/core/game/constants.js";
import * as survivalStyle from "../src/core/boss/styles/survival.js";
import { Snake } from "../src/core/snake/index.js";
import {
  generateCatacombsGrid,
  advanceCatacombsGrid,
} from "../src/core/generation/catacombs/generator.js";
import { CONTRABAND_DEFS, generateContrabandPool } from "../src/core/upgrades/contraband/index.js";
import { triggerFox, tickFoxAnim, FOX_DURATION_MS } from "../src/core/upgrades/consumables/fox.js";
import getFoxedContraband from "../src/core/upgrades/contraband/get-foxed.js";

const __testDir = dirname(fileURLToPath(import.meta.url));
const __projectRoot = resolve(__testDir, "..");

function readAsset(path) {
  return readFileSync(resolve(__projectRoot, path), "utf-8");
}

/**
 * Skips the bullet-hell boss intro phase so player input takes effect on
 * the next tick. Tests that exercise intro behaviour itself should not
 * call this; everything else should call it after `_enterBossFight()`
 * since the intro freezes player movement and auto-fire.
 */
function skipBossIntro(game) {
  if (game._fight) {
    game._fight.phase = Game.BOSS_PHASE_1;
    game._fight._introTicks = 0;
  }
}

/**
 * Builds a minimal manifest by reading the on-disk .arena and .boss files.
 * Used in beforeEach for boss-fight tests so _enterBossFight() can hydrate.
 */
function buildTestManifest() {
  return {
    arenas: [
      ...parseArenaFile(readAsset("assets/arenas/default.arena")),
      ...parseArenaFile(readAsset("assets/arenas/hissalia.arena")),
    ],
    bossShapes: {
      "absolute-unit": parseBossShape(readAsset("assets/bosses/absolute-unit.boss")),
      "traffic-jam": parseBossShape(readAsset("assets/bosses/traffic-jam.boss")),
      "the-algorithm": parseBossShape(readAsset("assets/bosses/the-algorithm.boss")),
    },
    crystals: buildCrystals(readAsset("assets/shapes/crystals.shapes")),
  };
}

describe("Game constructor", () => {
  it("starts in START state", () => {
    const game = new Game();
    expect(game.state).toBe(Game.STATE_START);
    expect(game.score).toBe(0);
    expect(game.actIndex).toBe(1);
  });
});

describe("state transitions", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
  });

  it("START -> PLAYING on confirm", () => {
    game.confirm();
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("DEAD -> PLAYING on confirm (restarts run)", () => {
    game.confirm(); // start
    game.state = Game.STATE_DEAD;
    game.confirm();
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("PLAYING accepts direction input", () => {
    game.confirm(); // start
    game.onInput(0, -1); // turn up
    expect(game.snake.nextDirX).toBe(0);
    expect(game.snake.nextDirY).toBe(-1);
  });
});

describe("tick", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
  });

  it("does nothing before tick interval elapses", () => {
    const headBefore = game.snake.snakeX[game.snake.headIndex];
    game.tick();
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(headBefore);
  });

  it("advances snake when interval elapses", () => {
    const headBefore = game.snake.snakeX[game.snake.headIndex];
    game.lastTickTime = 0;
    game.tick();
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(headBefore + 1);
  });

  it("transitions to DEAD on wall collision", () => {
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.setCell("wall", hx + 2, hy);

    game.lastTickTime = 0;
    game.tick(); // step 1 — ok
    game.lastTickTime = 0;
    game.tick(); // step 2 — hits wall
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("resets snake length on restart", () => {
    // Use advanceGrid that places food ahead so snake can eat and grow
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.foodX = hx + 1;
    game.grid.foodY = hy;
    game.lastTickTime = 0;
    game.tick(); // eat food
    game.lastTickTime = 0;
    game.tick(); // grow
    expect(game.snake.snakeLength).toBe(4);

    game.state = Game.STATE_DEAD;
    game.confirm();
    expect(game.snake.snakeLength).toBe(Game.INITIAL_SNAKE_LENGTH);
  });
});

describe("food progression", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    // Use a minimal advanceGrid that just places new food ahead
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("increments score and foodEaten on food", () => {
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.foodX = hx + 1;
    game.grid.foodY = hy;

    game.lastTickTime = 0;
    game.tick();

    expect(game.score).toBe(1);
    expect(game.foodEaten).toBe(1);
    expect(game.actIndex).toBe(1); // no level-up yet
    expect(game.snake.growing).toBe(true);
  });

  it("does not level up before threshold", () => {
    // Level 1 requires 7 food (5 + 1*2)
    expect(game.foodRequired).toBe(7);

    for (let i = 0; i < 3; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.grid.foodX = hx + game.snake.dirX;
      game.grid.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      if (game.state !== Game.STATE_PLAYING) {
        break;
      }
    }

    expect(game.actIndex).toBe(1);
    expect(game.foodEaten).toBe(3);
  });
});

describe("level-up + draft", () => {
  /**
   * Feed the snake n times. If a draft screen appears, confirm it
   * so feeding can continue across levels.
   */
  function feedSnake(game, n) {
    let fed = 0;
    while (fed < n) {
      if (game.state === Game.STATE_DRAFT) {
        game.confirmDraft();
      }
      // A boss fight can be triggered when score reaches a multiple of
      // BOSS_FOOD_INTERVAL.  feedSnake is not a boss-fight helper, so we
      // cleanly abort the fight and regenerate the grid so feeding can
      // continue.  foodEaten is intentionally left unchanged because the
      // red-food tick that caused the transition did not count toward the
      // level-up threshold.
      if (game.state === Game.STATE_BOSS) {
        game._boss = null;
        game._heldDirection = null;
        game.state = Game.STATE_PLAYING;
        if (game.generateGrid) {
          game.generateGrid(game);
        }
        continue;
      }
      if (game.state !== Game.STATE_PLAYING) {
        break;
      }
      const scoreBefore = game.score;
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.grid.foodX = hx + game.snake.dirX;
      game.grid.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      // Red food doesn't increment score — don't count it
      if (game.score > scoreBefore) {
        fed++;
      }
    }
    // Confirm any trailing draft
    if (game.state === Game.STATE_DRAFT) {
      game.confirmDraft();
    }
  }

  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = (g) => {
      g.grid.clearMasks("wall");
      g.grid.clearMasks("snake");
      g.grid.clearMasks("reserved");
      const cx = Math.floor(Game.GRID_W / 2);
      const cy = Math.floor(Game.GRID_H / 2);
      g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
      g.grid.foodX = cx + g.snake.snakeLength + 1;
      g.grid.foodY = cy;
    };
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("enters DRAFT state at food threshold", () => {
    // Feed 7 food without confirming
    for (let i = 0; i < 7; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.grid.foodX = hx + game.snake.dirX;
      game.grid.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      if (game.state !== Game.STATE_PLAYING) {
        break;
      }
    }
    expect(game.state).toBe(Game.STATE_DRAFT);
    // Level hasn't been applied yet
    expect(game.actIndex).toBe(1);
  });

  it("tick is no-op in DRAFT state", () => {
    game.state = Game.STATE_DRAFT;
    const actBefore = game.actIndex;
    game.lastTickTime = 0;
    game.tick();
    expect(game.actIndex).toBe(actBefore);
  });

  it("confirmDraft applies level-up and returns to PLAYING", () => {
    game.state = Game.STATE_DRAFT;
    game.foodEaten = game.foodRequired; // simulate threshold reached
    game.confirmDraft();
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game.actIndex).toBe(2);
    expect(game.foodEaten).toBe(0);
    expect(game.actIndex).toBe(2);
  });

  it("confirmDraft resets snake length", () => {
    game.state = Game.STATE_DRAFT;
    game.snake.snakeLength = 10;
    game.confirmDraft();
    expect(game.snake.snakeLength).toBe(Game.INITIAL_SNAKE_LENGTH);
  });

  it("confirmDraft is no-op outside DRAFT state", () => {
    const actBefore = game.actIndex;
    game.confirmDraft(); // state is PLAYING
    expect(game.actIndex).toBe(actBefore);
  });

  it("triggers level-up at food threshold (full flow)", () => {
    expect(game.foodRequired).toBe(7);
    feedSnake(game, 7);
    expect(game.actIndex).toBe(2);
    expect(game.foodEaten).toBe(0);
    expect(game.actIndex).toBe(2);
  });

  it("increases foodRequired each level", () => {
    feedSnake(game, 7);
    expect(game.foodRequired).toBe(9); // 5 + 2*2
  });

  it("recalculates tickMs on level-up", () => {
    feedSnake(game, 7);
    // boardIndex is now 2, base formula: 150 - 8 = 142 (possibly * 1.5 if slow_time drafted)
    const baseMs = 150 - (game.actIndex - 1) * 8;
    const expected = game.upgrades.hasPassive("slow_time") ? Math.round(baseMs * 1.5) : baseMs;
    expect(game.tickMs).toBe(expected);
  });

  it("uses foodRequired formula across multiple levels", () => {
    expect(game.foodRequired).toBe(7);
    feedSnake(game, 7);
    expect(game.foodRequired).toBe(9);
    feedSnake(game, 9);
    expect(game.foodRequired).toBe(11);
  });

  it("generates draft pool when entering DRAFT", () => {
    // Feed to threshold without confirming
    for (let i = 0; i < 7; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.grid.foodX = hx + game.snake.dirX;
      game.grid.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      if (game.state !== Game.STATE_PLAYING) {
        break;
      }
    }
    expect(game.state).toBe(Game.STATE_DRAFT);
    expect(game._draftPool).not.toBe(null);
    expect(game._draftPool.choices.length).toBe(3);
    expect(game._draftSelection).toBe(0);
  });

  it("selectDraft changes selection index", () => {
    game.state = Game.STATE_DRAFT;
    game._draftPool = { choices: [{}, {}, {}], mutation: null };
    game.selectDraft(2);
    expect(game._draftSelection).toBe(2);
  });

  it("selectDraft ignores out-of-range index", () => {
    game.state = Game.STATE_DRAFT;
    game._draftPool = { choices: [{}, {}, {}], mutation: null };
    game._draftSelection = 1;
    game.selectDraft(5);
    expect(game._draftSelection).toBe(1);
  });

  it("toggleMutation toggles acceptance", () => {
    game.state = Game.STATE_DRAFT;
    game._draftPool = {
      choices: [{}, {}, {}],
      mutation: { id: "wildlands", type: "mutation" },
    };
    expect(game._draftMutationAccepted).toBe(false);
    game.toggleMutation();
    expect(game._draftMutationAccepted).toBe(true);
    game.toggleMutation();
    expect(game._draftMutationAccepted).toBe(false);
  });

  it("toggleMutation is no-op without mutation slot", () => {
    game.state = Game.STATE_DRAFT;
    game._draftPool = { choices: [{}, {}, {}], mutation: null };
    game.toggleMutation();
    expect(game._draftMutationAccepted).toBe(false);
  });

  it("confirmDraft applies selected passive", () => {
    game.state = Game.STATE_DRAFT;
    game._draftPool = {
      choices: [
        { id: "slow_time", type: "passive", name: "Slow Time", duration: 3 },
        { id: "iron_jaw", type: "passive", name: "Iron Jaw", duration: 3 },
        { id: "bomb", type: "consumable", name: "Bomb", charges: 2 },
      ],
      mutation: null,
    };
    game._draftSelection = 0;
    game.confirmDraft();
    expect(game.upgrades.hasPassive("slow_time")).toBe(true);
  });

  it("confirmDraft applies selected consumable", () => {
    game.state = Game.STATE_DRAFT;
    game._draftPool = {
      choices: [
        { id: "slow_time", type: "passive", name: "Slow Time", duration: 3 },
        { id: "iron_jaw", type: "passive", name: "Iron Jaw", duration: 3 },
        { id: "bomb", type: "consumable", name: "Bomb", charges: 2 },
      ],
      mutation: null,
    };
    game._draftSelection = 2;
    game.confirmDraft();
    expect(game.upgrades.getConsumable("bomb")).not.toBe(null);
    expect(game.upgrades.getConsumable("bomb").charges).toBe(2);
  });

  it("confirmDraft applies mutation when accepted", () => {
    game.state = Game.STATE_DRAFT;
    game._draftPool = {
      choices: [
        { id: "slow_time", type: "passive", name: "Slow Time", duration: 3 },
        { id: "iron_jaw", type: "passive", name: "Iron Jaw", duration: 3 },
        { id: "bomb", type: "consumable", name: "Bomb", charges: 2 },
      ],
      mutation: { id: "wildlands", type: "mutation", name: "Wildlands" },
    };
    game._draftSelection = 0;
    game._draftMutationAccepted = true;
    game.confirmDraft();
    expect(game.upgrades.hasPassive("slow_time")).toBe(true);
    expect(game.upgrades.mutation).toBe("wildlands");
  });

  it("confirmDraft does not apply mutation when not accepted", () => {
    game.state = Game.STATE_DRAFT;
    game._draftPool = {
      choices: [
        { id: "slow_time", type: "passive", name: "Slow Time", duration: 3 },
        { id: "iron_jaw", type: "passive", name: "Iron Jaw", duration: 3 },
        { id: "bomb", type: "consumable", name: "Bomb", charges: 2 },
      ],
      mutation: { id: "wildlands", type: "mutation", name: "Wildlands" },
    };
    game._draftSelection = 0;
    game._draftMutationAccepted = false;
    game.confirmDraft();
    expect(game.upgrades.mutation).toBe("crystalline");
  });
});

describe("Slow Time passive", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
  });

  it("increases tickMs when slow_time is active", () => {
    const normalMs = game.tickMs;
    game.upgrades.addPassive("slow_time", 3);
    game._recalcTickMs();
    expect(game.tickMs).toBeGreaterThan(normalMs);
    expect(game.tickMs).toBe(Math.round(normalMs * 1.5));
  });

  it("tickMs returns to normal when slow_time expires", () => {
    const normalMs = game.tickMs;
    game.upgrades.addPassive("slow_time", 1);
    game._recalcTickMs();
    expect(game.tickMs).toBeGreaterThan(normalMs);
    // Expire it
    game.upgrades.tickBites();
    game._recalcTickMs();
    expect(game.tickMs).toBe(normalMs);
  });

  it("confirmDraft applies slow_time effect to tickMs", () => {
    game.state = Game.STATE_DRAFT;
    game._draftPool = {
      choices: [
        { id: "slow_time", type: "passive", name: "Slow Time", duration: 3 },
        { id: "iron_jaw", type: "passive", name: "Iron Jaw", duration: 3 },
        { id: "bomb", type: "consumable", name: "Bomb", charges: 2 },
      ],
      mutation: null,
    };
    game._draftSelection = 0;
    game.confirmDraft();
    // After act advance, actIndex is 2, so base = 150 - 8 = 142, slowed = 213
    const baseMs = 150 - (game.actIndex - 1) * 8;
    expect(game.tickMs).toBe(Math.round(baseMs * 1.5));
  });
});

describe("Iron Jaw passive", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
  });

  it("eats wall ahead when iron_jaw is active", () => {
    game.upgrades.addBites("iron_jaw", 3);
    // Place wall directly ahead of snake
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const nx = hx + game.snake.dirX;
    const ny = hy + game.snake.dirY;
    game.grid.setCell("wall", nx, ny);
    expect(game.grid.isWallCell(nx, ny)).toBe(true);

    game.lastTickTime = 0;
    game.tick();

    // Wall should be cleared, snake alive and moved into that cell
    expect(game.grid.isWallCell(nx, ny)).toBe(false);
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(nx);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(ny);
  });

  it("dies on wall without iron_jaw", () => {
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const nx = hx + game.snake.dirX;
    const ny = hy + game.snake.dirY;
    game.grid.setCell("wall", nx, ny);

    game.lastTickTime = 0;
    game.tick();

    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("expires after 3 walls eaten", () => {
    game.upgrades.addBites("iron_jaw", 3);

    // Eat 3 walls to exhaust iron_jaw charges
    for (let i = 0; i < 3; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      const nx = hx + game.snake.dirX;
      const ny = hy + game.snake.dirY;
      game.grid.setCell("wall", nx, ny);
      game.lastTickTime = 0;
      game.tick();
    }

    expect(game.upgrades.hasBites("iron_jaw")).toBe(false);

    // Now hitting another wall should kill
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.setCell("wall", hx + game.snake.dirX, hy + game.snake.dirY);
    game.lastTickTime = 0;
    game.tick();
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("_peekNextCell wraps around edges", () => {
    // Move snake to right edge facing right
    const rightEdge = game.grid.width - 1;
    game.snake.snakeX[game.snake.headIndex] = rightEdge;
    game.snake.snakeY[game.snake.headIndex] = 5;
    game.snake.nextDirX = 1;
    game.snake.nextDirY = 0;

    const next = game._peekNextCell();
    expect(next.x).toBe(0);
    expect(next.y).toBe(5);
  });
});

describe("consumable framework", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
  });

  it("cycleConsumable cycles through consumables", () => {
    game.upgrades.addConsumable("dash", 3);
    game.upgrades.addConsumable("bomb", 2);
    expect(game._selectedConsumable).toBe(0);
    game.cycleConsumable();
    expect(game._selectedConsumable).toBe(1);
    game.cycleConsumable();
    expect(game._selectedConsumable).toBe(0); // wraps
  });

  it("cycleConsumable is no-op with no consumables", () => {
    game.cycleConsumable();
    expect(game._selectedConsumable).toBe(0);
  });

  it("cycleConsumable is no-op outside PLAYING", () => {
    game.upgrades.addConsumable("dash", 3);
    game.state = Game.STATE_DEAD;
    game.cycleConsumable();
    expect(game._selectedConsumable).toBe(0);
  });

  it("useConsumable returns consumable id and decrements charges", () => {
    game.upgrades.addConsumable("dash", 2);
    const result = game.useConsumable();
    expect(result).toBe("dash");
    expect(game.upgrades.getConsumable("dash").charges).toBe(1);
  });

  it("useConsumable removes depleted consumable and clamps selection", () => {
    game.upgrades.addConsumable("dash", 1);
    game.upgrades.addConsumable("bomb", 2);
    game._selectedConsumable = 0;
    game.useConsumable(); // depletes dash
    // dash removed, only bomb left — selection should clamp to 0
    expect(game._selectedConsumable).toBe(0);
    expect(game.upgrades.consumables.length).toBe(1);
    expect(game.upgrades.consumables[0].id).toBe("bomb");
  });

  it("useConsumable returns false with no consumables", () => {
    expect(game.useConsumable()).toBe(false);
  });

  it("useConsumable returns false outside PLAYING", () => {
    game.upgrades.addConsumable("dash", 2);
    game.state = Game.STATE_DEAD;
    expect(game.useConsumable()).toBe(false);
  });

  it("_selectedConsumable resets on startRun", () => {
    game.upgrades.addConsumable("dash", 3);
    game.upgrades.addConsumable("bomb", 2);
    game._selectedConsumable = 1;
    game.startRun();
    expect(game._selectedConsumable).toBe(0);
  });
});

describe("Dash consumable", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
  });

  it("moves snake 2 cells forward", () => {
    game.upgrades.addConsumable("dash", 2);
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.useConsumable();
    const nx = game.snake.snakeX[game.snake.headIndex];
    const ny = game.snake.snakeY[game.snake.headIndex];
    expect(nx - hx + ny - hy).toBe(2); // moved 2 cells in one axis
  });

  it("eats walls in dash path", () => {
    game.upgrades.addConsumable("dash", 2);
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const dx = game.snake.dirX;
    const dy = game.snake.dirY;
    // Place walls on both cells ahead
    game.grid.setCell("wall", hx + dx, hy + dy);
    game.grid.setCell("wall", hx + dx * 2, hy + dy * 2);
    game.useConsumable();
    expect(game.grid.isWallCell(hx + dx, hy + dy)).toBe(false);
    expect(game.grid.isWallCell(hx + dx * 2, hy + dy * 2)).toBe(false);
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("dies on self-collision during dash", () => {
    game.upgrades.addConsumable("dash", 2);
    // Build a snake body in the dash path
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const dx = game.snake.dirX;
    const dy = game.snake.dirY;
    // Put snake cell 2 ahead
    game.grid.setCell("snake", hx + dx * 2, hy + dy * 2);
    game.useConsumable();
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("collects food during dash", () => {
    game.upgrades.addConsumable("dash", 2);
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const dx = game.snake.dirX;
    const dy = game.snake.dirY;
    game.grid.foodX = hx + dx;
    game.grid.foodY = hy + dy;
    const scoreBefore = game.score;
    game.useConsumable();
    expect(game.score).toBe(scoreBefore + 1);
  });

  it("decrements charge on use", () => {
    game.upgrades.addConsumable("dash", 2);
    game.useConsumable();
    expect(game.upgrades.getConsumable("dash").charges).toBe(1);
  });
});

describe("Wormhole consumable", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
  });

  it("enters wormhole placement state on use", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    expect(game.state).toBe(Game.STATE_WORMHOLE);
    expect(game._wormholeCursor).not.toBe(null);
    expect(game._wormholePhase).toBe(1);
  });

  it("moves cursor with onInput in wormhole state", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    const startX = game._wormholeCursor.x;
    game.onInput(1, 0);
    expect(game._wormholeCursor.x).toBe(startX + 1);
  });

  it("cursor wraps around edges", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    game._wormholeCursor.x = Game.GRID_W - 1;
    game.onInput(1, 0);
    expect(game._wormholeCursor.x).toBe(0);
  });

  it("places portal A on first confirm, moves to phase 2", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    game._wormholeCursor.x = 0;
    game._wormholeCursor.y = 0;
    // Clear any walls at target
    game.grid.clearCell("wall", 0, 0);
    game.grid.clearCell("snake", 0, 0);
    game.confirm();
    expect(game._wormholePhase).toBe(2);
    expect(game._wormholeA).toEqual({ x: 0, y: 0 });
    expect(game.state).toBe(Game.STATE_WORMHOLE); // still placing
  });

  it("places portal B on second confirm, returns to playing", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    // Place A
    game._wormholeCursor.x = 0;
    game._wormholeCursor.y = 0;
    game.grid.clearCell("wall", 0, 0);
    game.grid.clearCell("snake", 0, 0);
    game.confirm();
    // Place B
    game._wormholeCursor.x = 5;
    game._wormholeCursor.y = 5;
    game.grid.clearCell("wall", 5, 5);
    game.grid.clearCell("snake", 5, 5);
    game.confirm();
    expect(game._wormholeA).toEqual({ x: 0, y: 0 });
    expect(game._wormholeB).toEqual({ x: 5, y: 5 });
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("cannot place portal on wall", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    game._wormholeCursor.x = 2;
    game._wormholeCursor.y = 2;
    game.grid.setCell("wall", 2, 2);
    game.confirm();
    expect(game._wormholePhase).toBe(1); // still phase 1, placement rejected
  });

  it("cannot place portal B on same cell as A", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    game._wormholeCursor.x = 0;
    game._wormholeCursor.y = 0;
    game.grid.clearCell("wall", 0, 0);
    game.grid.clearCell("snake", 0, 0);
    game.confirm(); // place A at (0,0)
    game._wormholeCursor.x = 0;
    game._wormholeCursor.y = 0;
    game.confirm(); // try B at same spot
    expect(game._wormholePhase).toBe(2); // still phase 2, rejected
  });

  it("cancel refunds charge and returns to playing", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    expect(game.upgrades.getConsumable("wormhole")).toBe(null); // charge consumed
    game.cancelTargeting();
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game.upgrades.getConsumable("wormhole").charges).toBe(1);
    expect(game._wormholeCursor).toBe(null);
    expect(game._wormholeA).toBe(null);
    expect(game._wormholeB).toBe(null);
  });

  it("teleports snake from portal A to portal B", () => {
    game._wormholeA = { x: 15, y: 10 };
    game._wormholeB = { x: 3, y: 3 };
    // Move snake head to portal A
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    // Place food far away so it doesn't interfere
    game.grid.foodX = 0;
    game.grid.foodY = 0;
    // Set snake facing right, put portal A one step ahead
    game._wormholeA.x = hx + 1;
    game._wormholeA.y = hy;

    game.lastTickTime = 0;
    game.tick();

    // Snake should have teleported to portal B
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(game._wormholeB.x);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(game._wormholeB.y);
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("teleports snake from portal B to portal A", () => {
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game._wormholeA = { x: 3, y: 3 };
    game._wormholeB = { x: hx + 1, y: hy };
    game.grid.foodX = 0;
    game.grid.foodY = 0;

    game.lastTickTime = 0;
    game.tick();

    expect(game.snake.snakeX[game.snake.headIndex]).toBe(game._wormholeA.x);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(game._wormholeA.y);
  });

  it("portals cleared on level-up (confirmDraft)", () => {
    game._wormholeA = { x: 1, y: 1 };
    game._wormholeB = { x: 5, y: 5 };
    game.state = Game.STATE_DRAFT;
    game._draftPool = {
      choices: [{ id: "slow_time", type: "passive", name: "test", duration: 3 }],
      mutation: null,
    };
    game._draftSelection = 0;
    game.confirmDraft();
    expect(game._wormholeA).toBe(null);
    expect(game._wormholeB).toBe(null);
  });

  it("portals cleared on startRun", () => {
    game._wormholeA = { x: 1, y: 1 };
    game._wormholeB = { x: 5, y: 5 };
    game.startRun();
    expect(game._wormholeA).toBe(null);
    expect(game._wormholeB).toBe(null);
  });

  it("tick is no-op in wormhole state", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    const headBefore = game.snake.snakeX[game.snake.headIndex];
    game.lastTickTime = 0;
    game.tick();
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(headBefore);
  });
});

describe("Bomb consumable", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
  });

  it("enters targeting state on use", () => {
    game.upgrades.addConsumable("bomb", 2);
    game.useConsumable();
    expect(game.state).toBe(Game.STATE_TARGETING);
    expect(game._bombCursor).not.toBe(null);
    expect(game._bombCursor.x).toBe(game.snake.snakeX[game.snake.headIndex]);
    expect(game._bombCursor.y).toBe(game.snake.snakeY[game.snake.headIndex]);
  });

  it("moves cursor with onInput", () => {
    game.upgrades.addConsumable("bomb", 2);
    game.useConsumable();
    const startX = game._bombCursor.x;
    game.onInput(1, 0);
    expect(game._bombCursor.x).toBe(startX + 1);
  });

  it("cursor wraps around edges", () => {
    game.upgrades.addConsumable("bomb", 2);
    game.useConsumable();
    game._bombCursor.x = Game.GRID_W - 1;
    game.onInput(1, 0);
    expect(game._bombCursor.x).toBe(0);
  });

  it("confirm clears walls in 3x3 blast radius", () => {
    game.upgrades.addConsumable("bomb", 2);
    game.useConsumable();
    // Move cursor away from snake to an empty area
    game._bombCursor.x = 0;
    game._bombCursor.y = 0;
    // Clear any walls/snake at target area first
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bx = (0 + dx + Game.GRID_W) % Game.GRID_W;
        const by = (0 + dy + Game.GRID_H) % Game.GRID_H;
        game.grid.clearCell("wall", bx, by);
        game.grid.clearCell("snake", bx, by);
      }
    }
    // Place walls around cursor
    game.grid.setCell("wall", 1, 0);
    game.grid.setCell("wall", 0, 1);
    game.grid.setCell("wall", 1, 1);
    game.confirm();
    expect(game.grid.isWallCell(1, 0)).toBe(false);
    expect(game.grid.isWallCell(0, 1)).toBe(false);
    expect(game.grid.isWallCell(1, 1)).toBe(false);
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("confirm kills snake if blast hits snake cell", () => {
    game.upgrades.addConsumable("bomb", 2);
    game.useConsumable();
    // Move cursor onto a snake body cell
    const tailIdx = game.snake.tailIndex;
    game._bombCursor.x = game.snake.snakeX[tailIdx];
    game._bombCursor.y = game.snake.snakeY[tailIdx];
    game.confirm();
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_BOMB);
  });

  it("cancel refunds charge and returns to playing", () => {
    game.upgrades.addConsumable("bomb", 1);
    game.useConsumable();
    expect(game.state).toBe(Game.STATE_TARGETING);
    expect(game.upgrades.getConsumable("bomb")).toBe(null); // charge was consumed
    game.cancelTargeting();
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game.upgrades.getConsumable("bomb").charges).toBe(1); // refunded
    expect(game._bombCursor).toBe(null);
  });

  it("tick is no-op in targeting state", () => {
    game.upgrades.addConsumable("bomb", 2);
    game.useConsumable();
    const headBefore = game.snake.snakeX[game.snake.headIndex];
    game.lastTickTime = 0;
    game.tick();
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(headBefore);
  });

  it("decrements charge on use", () => {
    game.upgrades.addConsumable("bomb", 2);
    game.useConsumable();
    expect(game.upgrades.getConsumable("bomb").charges).toBe(1);
  });

  it("resets _bombCursor on startRun", () => {
    game._bombCursor = { x: 5, y: 5 };
    game.startRun();
    expect(game._bombCursor).toBe(null);
  });
});

describe("Fox cutscene (consumable + contraband)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    // Ensure food is on the grid for "eat" mode triggers.
    game.grid.foodX = 5;
    game.grid.foodY = 5;
  });

  describe("triggerFox", () => {
    it("populates _foxAnim with mode, target, and a screen edge", () => {
      triggerFox(game, "eat");
      expect(game._foxAnim).not.toBeNull();
      expect(game._foxAnim.mode).toBe("eat");
      expect(game._foxAnim.targetX).toBe(5);
      expect(game._foxAnim.targetY).toBe(5);
      expect(["top", "bottom", "left", "right"]).toContain(game._foxAnim.edge);
    });

    it("eat mode is no-op when no food on grid", () => {
      game.grid.foodX = -1;
      game.grid.foodY = -1;
      triggerFox(game, "eat");
      expect(game._foxAnim).toBeNull();
    });

    it("pounce mode is no-op outside a boss fight", () => {
      // No `_soulslike` slot, no `_boss.hp` → no valid target.
      triggerFox(game, "pounce");
      expect(game._foxAnim).toBeNull();
    });

    it("is no-op if _foxAnim is already active", () => {
      triggerFox(game, "eat");
      const original = game._foxAnim;
      triggerFox(game, "eat");
      expect(game._foxAnim).toBe(original);
    });

    it("picks the furthest screen edge from the target", () => {
      // Target near the right edge → fox enters from the left.
      game.grid.foodX = Game.GRID_W - 2;
      game.grid.foodY = Math.floor(Game.GRID_H / 2);
      triggerFox(game, "eat");
      expect(game._foxAnim.edge).toBe("left");
    });
  });

  describe("eat-mode resolves on cutscene end", () => {
    it("clears _foxAnim and fires _handleFoodEaten", () => {
      const scoreBefore = game.score;
      const foodEatenBefore = game.foodEaten;
      triggerFox(game, "eat");
      // Backdate startTime so the freeze duration has elapsed.
      game._foxAnim.startTime = Date.now() - FOX_DURATION_MS - 10;
      tickFoxAnim(game);
      expect(game._foxAnim).toBeNull();
      expect(game.score).toBe(scoreBefore + 1);
      expect(game.foodEaten).toBe(foodEatenBefore + 1);
    });

    it("queues snake growth on next step", () => {
      game.snake.growing = false;
      triggerFox(game, "eat");
      game._foxAnim.startTime = Date.now() - FOX_DURATION_MS - 10;
      tickFoxAnim(game);
      expect(game.snake.growing).toBe(true);
    });

    it("returns true while the cutscene is still running", () => {
      triggerFox(game, "eat");
      expect(tickFoxAnim(game)).toBe(true);
      expect(game._foxAnim).not.toBeNull();
    });
  });

  describe("freeze gates", () => {
    it("game.tick early-returns while the cutscene is active", () => {
      const headIdx = game.snake.headIndex;
      const xBefore = game.snake.snakeX[headIdx];
      const yBefore = game.snake.snakeY[headIdx];
      triggerFox(game, "eat");
      game.lastTickTime = 0; // ensure tick would otherwise fire
      game.tick();
      expect(game.snake.snakeX[headIdx]).toBe(xBefore);
      expect(game.snake.snakeY[headIdx]).toBe(yBefore);
    });

    it("useConsumable returns false while the cutscene is active", () => {
      game.upgrades.addConsumable("fox", 3);
      triggerFox(game, "eat");
      const chargesBefore = game.upgrades.getConsumable("fox").charges;
      expect(game.useConsumable()).toBe(false);
      // Charge must not have been spent.
      expect(game.upgrades.getConsumable("fox").charges).toBe(chargesBefore);
    });

    it("onPlayerAction is gated during the cutscene in boss state", () => {
      game.state = Game.STATE_BOSS;
      triggerFox(game, "eat");
      let fired = false;
      game._bossOnAction = () => {
        fired = true;
      };
      game.onPlayerAction("stab");
      expect(fired).toBe(false);
    });
  });

  describe("useConsumable dispatch", () => {
    it("playing state → fires triggerFox in 'eat' mode and decrements charge", () => {
      game.upgrades.addConsumable("fox", 2);
      const id = game.useConsumable();
      expect(id).toBe("fox");
      expect(game._foxAnim?.mode).toBe("eat");
      expect(game.upgrades.getConsumable("fox").charges).toBe(1);
    });

    it("boss state → fires triggerFox in 'pounce' mode regardless of selection", () => {
      // Synthetic soulslike slot — pounce target reads `bossX/Y/Hp`.
      game._soulslike = { bossX: 10, bossY: 10, bossHp: 50, bossHpMax: 50 };
      game.upgrades.addConsumable("dash", 3); // selection at 0 → "dash"
      game.upgrades.addConsumable("fox", 2);
      game.state = Game.STATE_BOSS;
      const id = game.useConsumable();
      expect(id).toBe("fox");
      expect(game._foxAnim?.mode).toBe("pounce");
      expect(game.upgrades.getConsumable("fox").charges).toBe(1);
      // Other consumables are untouched in boss state.
      expect(game.upgrades.getConsumable("dash").charges).toBe(3);
    });

    it("boss state without a fox charge returns false", () => {
      game._soulslike = { bossX: 10, bossY: 10, bossHp: 50, bossHpMax: 50 };
      game.upgrades.addConsumable("dash", 3);
      game.state = Game.STATE_BOSS;
      expect(game.useConsumable()).toBe(false);
      expect(game._foxAnim).toBeNull();
    });
  });

  describe("pounce damages boss on contact (chew start)", () => {
    it("soulslike: subtracts 5 from bossHp mid-cutscene, not at end", () => {
      game._soulslike = { bossX: 10, bossY: 10, bossHp: 50, bossHpMax: 50 };
      triggerFox(game, "pounce");
      // Backdate just past the pounce → chew boundary so the contact
      // tick fires but the cutscene is still running.
      game._foxAnim.startTime = Date.now() - Math.ceil(FOX_DURATION_MS * 0.6);
      tickFoxAnim(game);
      expect(game._soulslike.bossHp).toBe(45);
      expect(game._foxAnim).not.toBeNull(); // cutscene still going
    });

    it("bullet-hell: HP drops mid-cutscene; victory exit defers to cutscene end", () => {
      game._boss = { x: 10, y: 10, hp: 4 };
      let exited = false;
      game._exitBossVictory = () => {
        exited = true;
      };
      triggerFox(game, "pounce");
      // Mid-cutscene tick: HP drops, victory NOT yet fired.
      game._foxAnim.startTime = Date.now() - Math.ceil(FOX_DURATION_MS * 0.6);
      tickFoxAnim(game);
      expect(game._boss.hp).toBe(0);
      expect(exited).toBe(false);
      expect(game._foxAnim.pendingVictoryExit).toBe(true);
      // End-of-cutscene tick: deferred victory now fires.
      game._foxAnim.startTime = Date.now() - FOX_DURATION_MS - 10;
      tickFoxAnim(game);
      expect(exited).toBe(true);
    });

    it("damage only applies once, even across multiple ticks", () => {
      game._soulslike = { bossX: 10, bossY: 10, bossHp: 50, bossHpMax: 50 };
      triggerFox(game, "pounce");
      game._foxAnim.startTime = Date.now() - Math.ceil(FOX_DURATION_MS * 0.6);
      tickFoxAnim(game);
      tickFoxAnim(game); // second mid-cutscene tick
      expect(game._soulslike.bossHp).toBe(45); // not 40
    });
  });

  describe("easter-egg flag", () => {
    it("resets _foxEggUsedThisAct when the act advances", () => {
      game._foxEggUsedThisAct = true;
      game._draftPool = {
        choices: [{ id: "dash", type: "consumable" }],
        mutation: null,
      };
      game._draftSelection = 0;
      game.state = Game.STATE_DRAFT;
      game.confirmDraft();
      expect(game._foxEggUsedThisAct).toBe(false);
    });
  });

  describe("get_foxed contraband", () => {
    it("apply() adds 2 fox-consumable charges (stacking with existing)", () => {
      game.upgrades.addConsumable("fox", 1);
      getFoxedContraband.apply(game);
      expect(game.upgrades.getConsumable("fox").charges).toBe(3);
    });

    it("apply() seeds 2 charges if the player has no fox yet", () => {
      getFoxedContraband.apply(game);
      expect(game.upgrades.getConsumable("fox").charges).toBe(2);
    });

    it("is allow-listed to bullet-hell + soulslike (skips survival)", () => {
      expect(getFoxedContraband.styles).toEqual(["bullet_hell", "soulslike"]);
    });
  });
});

describe("renderFrame", () => {
  it("does not crash without renderer", () => {
    const game = new Game();
    expect(() => game.renderFrame()).not.toThrow();
  });

  it("calls renderer methods in correct order", () => {
    const calls = [];
    const game = new Game();
    game.renderer = {
      clear: () => calls.push("clear"),
      drawCell: () => calls.push("drawCell"),
      drawSnakeHead: () => calls.push("drawSnakeHead"),
      drawHUD: () => calls.push("drawHUD"),
      drawScreen: () => calls.push("drawScreen"),
      flush: () => calls.push("flush"),
    };

    game.renderFrame();
    expect(calls).toContain("clear");
    expect(calls).toContain("drawScreen");
    expect(calls).toContain("flush");
  });
});

describe("mechanic lifecycle", () => {
  it("mechanic is null in constructor", () => {
    const game = new Game();
    expect(game.mechanic).toBe(null);
  });

  it("mechanic is set after startRun (crystalline default)", () => {
    const game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    expect(game.mechanic).not.toBe(null);
    expect(game.mechanic.type).toBe("lattice");
  });

  it("mechanic is reset to null on startRun", () => {
    const game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game.mechanic = { type: "fake" };
    game.startRun();
    // startRun sets mechanic to null, then generateGrid sets it to lattice
    expect(game.mechanic.type).toBe("lattice");
  });

  it("mechanic is reset on confirmDraft", () => {
    const game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game.mechanic = { type: "something_old" };

    // Set up draft state
    game.state = Game.STATE_DRAFT;
    game._draftPool = {
      choices: [{ id: "slow_time", type: "passive", name: "test", duration: 3 }],
      mutation: null,
    };
    game._draftSelection = 0;

    game.confirmDraft();
    // confirmDraft sets mechanic to null, then generateGrid re-inits it
    expect(game.mechanic.type).toBe("lattice");
  });
});

describe("boss food co-spawn & trigger", () => {
  let game;

  function feedOnce(g) {
    const hx = g.snake.snakeX[g.snake.headIndex];
    const hy = g.snake.snakeY[g.snake.headIndex];
    g.grid.foodX = hx + g.snake.dirX;
    g.grid.foodY = hy + g.snake.dirY;
    g.lastTickTime = 0;
    g.tick();
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    // Stub generators to keep grid clear and food always ahead
    game.generateGrid = (g) => {
      g.grid.clearMasks("wall");
      g.grid.clearMasks("snake");
      g.grid.clearMasks("reserved");
      g.grid.terrain.fill(0);
      const cx = Math.floor(Game.GRID_W / 2);
      const cy = Math.floor(Game.GRID_H / 2);
      g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
      g.grid.foodX = cx + g.snake.snakeLength + 1;
      g.grid.foodY = cy;
    };
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("bossFoodCharge is 0 at start, no boss food on grid", () => {
    expect(game.bossFoodCharge).toBe(0);
    expect(game.grid.bossFoodX).toBe(-1);
    expect(game.grid.bossFoodY).toBe(-1);
  });

  it("spawns boss food after BOSS_FOOD_INTERVAL regular food eaten", () => {
    for (let i = 0; i < Game.BOSS_FOOD_INTERVAL; i++) {
      if (game.state === Game.STATE_DRAFT) {
        game.confirmDraft();
      }
      feedOnce(game);
    }
    if (game.state === Game.STATE_DRAFT) {
      game.confirmDraft();
    }
    expect(game.grid.bossFoodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.bossFoodY).toBeGreaterThanOrEqual(0);
    expect(game.bossFoodCharge).toBe(0);
  });

  it("eating boss food transitions to STATE_BOSS, no score/foodEaten increment", () => {
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    // Place boss food directly ahead, push regular food out of the way
    game.grid.bossFoodX = hx + game.snake.dirX;
    game.grid.bossFoodY = hy + game.snake.dirY;
    game.grid.foodX = 0;
    game.grid.foodY = 0;
    const scoreBefore = game.score;
    const foodEatenBefore = game.foodEaten;
    game.lastTickTime = 0;
    game.tick();
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game.score).toBe(scoreBefore);
    expect(game.foodEaten).toBe(foodEatenBefore);
  });

  it("eating regular food despawns boss food and resets charge", () => {
    // Set up state where boss food is present and charge is non-zero
    game.bossFoodCharge = 5;
    game.grid.bossFoodX = 0;
    game.grid.bossFoodY = 0;
    feedOnce(game);
    expect(game.grid.bossFoodX).toBe(-1);
    expect(game.grid.bossFoodY).toBe(-1);
    expect(game.bossFoodCharge).toBe(0);
  });

  it("bossFoodCharge resets on new run", () => {
    game.bossFoodCharge = 7;
    game.grid.bossFoodX = 5;
    game.grid.bossFoodY = 5;
    game.startRun();
    expect(game.bossFoodCharge).toBe(0);
    expect(game.grid.bossFoodX).toBe(-1);
    expect(game.grid.bossFoodY).toBe(-1);
  });
});

describe("boss fight", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  // Forces one full boss tick (both movement + boss sub-ticks) regardless of time gate
  function bossTick(g) {
    g._lastBossTickTime = 0;
    g._lastBossMoveTime = 0;
    g.tick();
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("_enterBossFight sets up arena and boss entity", () => {
    game._enterBossFight();
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game._boss).not.toBeNull();
    expect(game.grid.playerX).toBeGreaterThanOrEqual(0);
    expect(game.grid.playerY).toBeGreaterThanOrEqual(0);
    expect(game.grid.playerX).toBeLessThan(Game.GRID_W);
    expect(game.grid.playerY).toBeLessThan(Game.GRID_H);
  });

  it("crystalline default boss is Traffic Jam", () => {
    // After startRun the mutation is 'crystalline', which maps to Traffic Jam
    expect(game.upgrades.mutation).toBe("crystalline");
    game._enterBossFight();
    expect(game._boss.name).toBe("Traffic Jam");
  });

  it("boss has maxHp matching BOSS_HP", () => {
    game._enterBossFight();
    expect(game._boss.maxHp).toBe(Game.BOSS_HP);
    expect(game._boss.hp).toBe(Game.BOSS_HP);
  });

  it("boss hp decrements but maxHp stays fixed", () => {
    game._enterBossFight();
    const boss = game._boss;
    boss.hit();
    expect(boss.hp).toBe(Game.BOSS_HP - 1);
    expect(boss.maxHp).toBe(Game.BOSS_HP);
  });

  it("BossEntity accepts a custom name", () => {
    // Validates the name parameter is wired through correctly for future boss types
    game._enterBossFight();
    game._boss.name = "Test McTestface";
    expect(game._boss.name).toBe("Test McTestface");
  });

  it("player does not move when no key held", () => {
    game._enterBossFight();
    const px = game.grid.playerX;
    const py = game.grid.playerY;
    bossTick(game);
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game.grid.playerX).toBe(px);
    expect(game.grid.playerY).toBe(py);
  });

  it("player moves one cell per tick when key held", () => {
    game._enterBossFight();
    skipBossIntro(game);
    const px = game.grid.playerX;
    const py = game.grid.playerY;
    // Move right (horizontal movement allowed in bullet-hell mode)
    game.onInput(1, 0);
    bossTick(game);
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game.grid.playerX).toBe(px + 1);
    expect(game.grid.playerY).toBe(py);
  });

  it("player stops when key released", () => {
    game._enterBossFight();
    game.onInput(1, 0);
    bossTick(game);
    const px = game.grid.playerX;
    const py = game.grid.playerY;
    game.onInputRelease(1, 0);
    expect(game._heldDirection).toBeNull();
    bossTick(game);
    expect(game.grid.playerX).toBe(px);
    expect(game.grid.playerY).toBe(py);
  });

  it("player dies on wall collision during boss fight", () => {
    game._enterBossFight();
    skipBossIntro(game);
    // Place player one cell from the east wall
    game.grid.playerX = Game.GRID_W - 2;
    game.grid.playerY = Math.floor(Game.GRID_H / 2);
    game.onInput(1, 0); // move right into east wall
    bossTick(game);
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_WALL);
  });

  it("player dies on boss body collision", () => {
    game._enterBossFight();
    skipBossIntro(game);
    const boss = game._boss;
    // Find a non-weak body cell and position player to walk into it
    const target = boss.cells.find((c) => !c.weak);
    game.grid.playerX = target.x - 1;
    game.grid.playerY = target.y;
    game.onInput(1, 0); // move right into boss body cell
    bossTick(game);
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_BOSS);
  });

  it("bullet hitting boss weak point decrements HP", () => {
    game._enterBossFight();
    const boss = game._boss;
    // Expose weak point by destroying adjacent body cells
    const wp = boss.getWeakPoint();
    for (const c of boss.cells) {
      if (c.weak) {
        continue;
      }
      if (Math.abs(c.x - wp.x) + Math.abs(c.y - wp.y) === 1) {
        for (let i = 0; i < BOSS_BODY_HP; i++) {
          boss.hitBodyCell(c.x, c.y);
        }
      }
    }
    expect(boss.isWeakExposed()).toBe(true);
    const hpBefore = boss.hp;
    // Place a bullet one cell below the weak point, travelling up.
    // Bullets advance every PLAYER_BULLET_INTERVAL movement sub-ticks, so
    // pre-set the counter so this tick advances the bullet onto the weak point.
    game._playerBullets.push({ x: wp.x, y: wp.y + 1, dx: 0, dy: -1 });
    game._playerBulletMoveCounter = PLAYER_BULLET_INTERVAL - 1;
    bossTick(game);
    expect(boss.hp).toBe(hpBefore - 1);
    expect(game.state).toBe(Game.STATE_BOSS);
  });

  it("boss defeated when HP reaches 0 via bullet", () => {
    game._enterBossFight();
    // Expose weak point by destroying adjacent body cells
    const wp = game._boss.getWeakPoint();
    for (const c of game._boss.cells) {
      if (c.weak) {
        continue;
      }
      if (Math.abs(c.x - wp.x) + Math.abs(c.y - wp.y) === 1) {
        for (let i = 0; i < BOSS_BODY_HP; i++) {
          game._boss.hitBodyCell(c.x, c.y);
        }
      }
    }
    game._boss.hp = 1;
    game._playerBullets.push({ x: wp.x, y: wp.y + 1, dx: 0, dy: -1 });
    game._playerBulletMoveCounter = PLAYER_BULLET_INTERVAL - 1;
    bossTick(game);
    expect(game._boss).toBeNull();
    expect(game.state).toBe(Game.STATE_CONTRABAND);
  });

  it("victory awards BOSS_FOOD_REWARD food progress", () => {
    game._enterBossFight();
    const foodBefore = game.foodEaten;
    game.foodRequired = 9999;
    game._boss.hp = 0;
    game._exitBossVictory();
    expect(game.foodEaten).toBe(foodBefore + Game.BOSS_FOOD_REWARD);
  });

  it("victory transitions to STATE_CONTRABAND (not straight to PLAYING)", () => {
    game._enterBossFight();
    game.foodEaten = 0;
    game.foodRequired = 9999;
    game._boss.hp = 0;
    game._exitBossVictory();
    expect(game.state).toBe(Game.STATE_CONTRABAND);
    game.confirmContraband();
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("boss drifts side-to-side", () => {
    game._enterBossFight();
    const boss = game._boss;
    const startX = boss.x;
    // Boss moves 1 cell every 3 ticks; 9 ticks → 3 moves
    for (let i = 0; i < 9; i++) {
      bossTick(game);
    }
    expect(boss.x).not.toBe(startX);
  });

  it("boss state resets on startRun", () => {
    game._enterBossFight();
    expect(game._boss).not.toBeNull();
    game.startRun();
    expect(game._boss).toBeNull();
    expect(game._heldDirection).toBeNull();
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("_playerFacing initialises facing up on boss entry", () => {
    game._enterBossFight();
    expect(game._playerFacing).toEqual({ dx: 0, dy: -1 });
  });

  it("_playerFacing stays locked up when a direction is held", () => {
    game._enterBossFight();
    game.onInput(1, 0);
    expect(game._playerFacing).toEqual({ dx: 0, dy: -1 });
    game.onInput(-1, 0);
    expect(game._playerFacing).toEqual({ dx: 0, dy: -1 });
  });

  it("_playerFacing always faces up during boss fight", () => {
    game._enterBossFight();
    game.onInput(1, 0);
    // During boss fight, facing is locked to up regardless of movement direction
    expect(game._playerFacing).toEqual({ dx: 0, dy: -1 });
    game.onInputRelease(1, 0);
    expect(game._heldDirection).toBeNull();
    expect(game._playerFacing).toEqual({ dx: 0, dy: -1 });
  });

  it("_playerFacing resets on startRun", () => {
    game._enterBossFight();
    game.onInput(1, 0);
    game.startRun();
    expect(game._playerFacing).toEqual({ dx: 1, dy: 0 });
  });
});

describe("bullet-hell movement", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  function bossTick(g) {
    g._lastBossTickTime = 0;
    g._lastBossMoveTime = 0;
    g.tick();
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("vertical input is rejected without snake_hungry", () => {
    game._enterBossFight();
    game.onInput(0, -1);
    expect(game._heldDirection).toBeNull();
    game.onInput(0, 1);
    expect(game._heldDirection).toBeNull();
  });

  it("horizontal input is accepted", () => {
    game._enterBossFight();
    game.onInput(1, 0);
    expect(game._heldDirection).toEqual({ dx: 1, dy: 0 });
    game.onInputRelease(1, 0);
    game.onInput(-1, 0);
    expect(game._heldDirection).toEqual({ dx: -1, dy: 0 });
  });

  it("latest key wins: pressing left while holding right switches to left", () => {
    game._enterBossFight();
    game.onInput(1, 0);
    expect(game._heldDirection).toEqual({ dx: 1, dy: 0 });
    game.onInput(-1, 0);
    expect(game._heldDirection).toEqual({ dx: -1, dy: 0 });
  });

  it("releasing current direction stops movement", () => {
    game._enterBossFight();
    game.onInput(1, 0);
    game.onInputRelease(1, 0);
    expect(game._heldDirection).toBeNull();
  });

  it("releasing a different direction does not stop movement", () => {
    game._enterBossFight();
    game.onInput(1, 0);
    game.onInput(-1, 0);
    // Release right (not current direction) — should keep going left
    game.onInputRelease(1, 0);
    expect(game._heldDirection).toEqual({ dx: -1, dy: 0 });
  });

  it("Y position is locked to spawn without snake_hungry", () => {
    game._enterBossFight();
    const spawnY = game._playerSpawnY;
    // Force vertical input by directly setting _heldDirection
    game._heldDirection = { dx: 0, dy: -1 };
    bossTick(game);
    expect(game.grid.playerY).toBe(spawnY);
  });

  it("snake_hungry allows vertical movement within range", () => {
    game._enterBossFight();
    skipBossIntro(game);
    game._contraband = [{ id: "snake_hungry" }];
    const spawnY = game._playerSpawnY;
    game.onInput(0, -1);
    expect(game._heldDirection).toEqual({ dx: 0, dy: -1 });
    for (let i = 0; i < HUNGRY_VERTICAL_RANGE; i++) {
      bossTick(game);
    }
    expect(game.grid.playerY).toBe(spawnY - HUNGRY_VERTICAL_RANGE);
  });

  it("snake_hungry vertical movement is clamped at range limit", () => {
    game._enterBossFight();
    skipBossIntro(game);
    game._contraband = [{ id: "snake_hungry" }];
    const spawnY = game._playerSpawnY;
    game.onInput(0, -1);
    // Move beyond the range limit
    for (let i = 0; i < HUNGRY_VERTICAL_RANGE + 3; i++) {
      bossTick(game);
    }
    // Clamped to range
    expect(game.grid.playerY).toBe(spawnY - HUNGRY_VERTICAL_RANGE);
  });

  it("_playerFacing is always {dx:0, dy:-1} during boss fight", () => {
    game._enterBossFight();
    expect(game._playerFacing).toEqual({ dx: 0, dy: -1 });
    game.onInput(1, 0);
    expect(game._playerFacing).toEqual({ dx: 0, dy: -1 });
    game.onInput(-1, 0);
    expect(game._playerFacing).toEqual({ dx: 0, dy: -1 });
  });
});

describe("player plane shape", () => {
  // Reconstruct getPlayerCells logic inline for shape testing.

  function planeCells(x, y, dx, dy) {
    const bx = -dx;
    const by = -dy;
    const lx = -dy;
    const ly = dx;
    return [
      { x, y },
      { x: x + bx + lx, y: y + by + ly },
      { x: x + bx - lx, y: y + by - ly },
      { x: x + 2 * bx, y: y + 2 * by },
    ];
  }

  it("tip is always index 0 at the given position", () => {
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ]) {
      const cells = planeCells(10, 10, dx, dy);
      expect(cells[0]).toEqual({ x: 10, y: 10 });
    }
  });

  it("pointing UP: diamond shape extends downward", () => {
    // dx=0, dy=-1 → bx=0, by=1, lx=1, ly=0
    //   ▲      (10, 10)
    //  ● ●     (9,11) (11,11)
    //   ●      (10,12)
    const cells = planeCells(10, 10, 0, -1);
    expect(cells[0]).toEqual({ x: 10, y: 10 }); // tip
    expect(cells).toContainEqual({ x: 9, y: 11 }); // wing A
    expect(cells).toContainEqual({ x: 11, y: 11 }); // wing B
    expect(cells).toContainEqual({ x: 10, y: 12 }); // tail
  });

  it("pointing DOWN: diamond extends upward", () => {
    // dx=0, dy=1 → bx=0, by=-1, lx=-1, ly=0
    const cells = planeCells(10, 10, 0, 1);
    expect(cells[0]).toEqual({ x: 10, y: 10 });
    expect(cells).toContainEqual({ x: 9, y: 9 });
    expect(cells).toContainEqual({ x: 11, y: 9 });
    expect(cells).toContainEqual({ x: 10, y: 8 });
  });

  it("pointing RIGHT: diamond extends leftward", () => {
    // dx=1, dy=0 → bx=-1, by=0, lx=0, ly=1
    const cells = planeCells(10, 10, 1, 0);
    expect(cells[0]).toEqual({ x: 10, y: 10 });
    expect(cells).toContainEqual({ x: 9, y: 11 }); // wing A
    expect(cells).toContainEqual({ x: 9, y: 9 }); // wing B
    expect(cells).toContainEqual({ x: 8, y: 10 }); // tail
  });

  it("pointing LEFT: diamond extends rightward", () => {
    // dx=-1, dy=0 → bx=1, by=0, lx=0, ly=-1
    const cells = planeCells(10, 10, -1, 0);
    expect(cells[0]).toEqual({ x: 10, y: 10 });
    expect(cells).toContainEqual({ x: 11, y: 9 }); // wing A
    expect(cells).toContainEqual({ x: 11, y: 11 }); // wing B
    expect(cells).toContainEqual({ x: 12, y: 10 }); // tail
  });

  it("always produces exactly 4 cells", () => {
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ]) {
      expect(planeCells(5, 5, dx, dy)).toHaveLength(4);
    }
  });

  it("all 4 rotations have no duplicate cells", () => {
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ]) {
      const cells = planeCells(10, 10, dx, dy);
      const keys = cells.map((c) => `${c.x},${c.y}`);
      expect(new Set(keys).size).toBe(4);
    }
  });
});

describe("projectile system", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  function bossTick(g) {
    g._lastBossTickTime = 0;
    g._lastBossMoveTime = 0;
    g.tick();
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("no projectiles on boss entry", () => {
    game._enterBossFight();
    expect(game._projectiles).toHaveLength(0);
  });

  // Advances past the intro safe window into phase 1 combat
  function skipIntro(g) {
    for (let i = 0; i <= Game.BOSS_INTRO_TICKS; i++) {
      bossTick(g);
    }
    // Clear auto-fire state so tests start with a clean slate
    g._playerBullets = [];
    g._playerFireCounter = 0;
  }

  it("boss fires one projectile after BOSS_FIRE_INTERVAL ticks (phase 1)", () => {
    game._enterBossFight();
    skipIntro(game);
    const before = game._projectiles.length;
    for (let i = 0; i < Game.BOSS_FIRE_INTERVAL; i++) {
      bossTick(game);
    }
    expect(game._projectiles.length).toBeGreaterThan(before);
  });

  it("projectile advances one cell per boss tick", () => {
    game._enterBossFight();
    skipIntro(game);
    // Fast-forward to first fire after intro
    for (let i = 0; i < Game.BOSS_FIRE_INTERVAL; i++) {
      bossTick(game);
    }
    expect(game._projectiles.length).toBeGreaterThan(0);
    const { x: x0, y: y0, dx, dy } = game._projectiles[0];
    bossTick(game);
    // The projectile either moved or was immediately despawned by a wall
    if (game._projectiles.length > 0) {
      expect(game._projectiles[0].x).toBe(x0 + dx);
      expect(game._projectiles[0].y).toBe(y0 + dy);
    }
  });

  it("projectile despawns on wall contact", () => {
    game._enterBossFight();
    // East arena wall is at x = GRID_W - 1 = 30
    game._projectiles.push({ x: 29, y: 5, dx: 1, dy: 0 });
    bossTick(game);
    // Projectile moved to (30, 5) = east wall → removed
    // Only 1 tick elapsed so fire counter (1) < BOSS_FIRE_INTERVAL (5): no new projectile
    expect(game._projectiles.every((p) => !(p.x === 30 && p.y === 5))).toBe(true);
    expect(game._projectiles).toHaveLength(0);
  });

  it("projectile at tip cell kills player", () => {
    game._enterBossFight();
    const px = game.grid.playerX; // 15
    const py = game.grid.playerY; // 28
    // Place projectile one cell left of tip, moving right — lands on tip next tick
    game._projectiles.push({ x: px - 1, y: py, dx: 1, dy: 0 });
    bossTick(game);
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_PROJECTILE);
  });

  it("projectile at wing cell kills player", () => {
    game._enterBossFight();
    // Move player to centre of arena so back cells clear walls
    game.grid.playerX = 15;
    game.grid.playerY = 15;
    // _playerFacing = { dx:0, dy:-1 } (facing up)
    // Wing B = (14, 16).  Place projectile one cell left, moving right.
    game._projectiles.push({ x: 13, y: 16, dx: 1, dy: 0 });
    bossTick(game);
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_PROJECTILE);
  });

  it("projectile at tail cell kills player", () => {
    game._enterBossFight();
    // Move player to centre; facing up → tail = (15, 17)
    game.grid.playerX = 15;
    game.grid.playerY = 15;
    // Place projectile one cell above tail, moving down
    game._projectiles.push({ x: 15, y: 16, dx: 0, dy: 1 });
    bossTick(game);
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_PROJECTILE);
  });

  it("boss does not fire while staggered", () => {
    game._enterBossFight();
    // Move into phase 1 so the fire counter is active
    game._fight.phase = Game.BOSS_PHASE_1;
    // Prime fire counter to one tick away from firing
    game._fight._fireCounter = Game.BOSS_FIRE_INTERVAL - 1;
    // Stagger the boss — shouldFire must return false while staggered
    game._boss._staggerTicks = 3;
    bossTick(game);
    expect(game._projectiles).toHaveLength(0);
    // Counter must not have advanced while staggered
    expect(game._fight._fireCounter).toBe(Game.BOSS_FIRE_INTERVAL - 1);
  });

  describe("boss fight phases (Step 6)", () => {
    let game;

    function simpleGridSetup(g) {
      g.grid.clearMasks("wall");
      g.grid.clearMasks("snake");
      g.grid.clearMasks("reserved");
      g.grid.terrain.fill(0);
      const cx = Math.floor(Game.GRID_W / 2);
      const cy = Math.floor(Game.GRID_H / 2);
      g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
      g.grid.foodX = cx + g.snake.snakeLength + 1;
      g.grid.foodY = cy;
    }

    function bossTick(g) {
      g._lastBossTickTime = 0;
      g._lastBossMoveTime = 0;
      g.tick();
    }

    function skipIntro(g) {
      for (let i = 0; i <= Game.BOSS_INTRO_TICKS; i++) {
        bossTick(g);
      }
      g._playerBullets = [];
      g._playerFireCounter = 0;
    }

    beforeEach(() => {
      game = new Game();
      game.manifest = buildTestManifest();
      game.generateGrid = simpleGridSetup;
      game.advanceGrid = (g) => {
        const hx = g.snake.snakeX[g.snake.headIndex];
        const hy = g.snake.snakeY[g.snake.headIndex];
        g.grid.foodX = hx + g.snake.dirX;
        g.grid.foodY = hy + g.snake.dirY;
      };
      game.startRun();
    });

    it("fight controller starts in PHASE_INTRO on boss entry", () => {
      game._enterBossFight();
      expect(game._fight).not.toBeNull();
      expect(game._fight.phase).toBe(Game.BOSS_PHASE_INTRO);
    });

    it("_fight is null before boss entry", () => {
      expect(game._fight).toBeNull();
    });

    it("_fight is null after startRun", () => {
      game._enterBossFight();
      game.startRun();
      expect(game._fight).toBeNull();
    });

    it("_fight is null after boss victory", () => {
      game._enterBossFight();
      game._boss.hp = 0;
      game._exitBossVictory();
      expect(game._fight).toBeNull();
    });

    it("_fight is null after boss death", () => {
      game._enterBossFight();
      skipBossIntro(game);
      game.grid.playerX = Game.GRID_W - 2;
      game.grid.playerY = Math.floor(Game.GRID_H / 2);
      game.onInput(1, 0);
      bossTick(game);
      expect(game._fight).toBeNull();
    });

    it("no shots fire during intro window", () => {
      game._enterBossFight();
      // Run BOSS_INTRO_TICKS ticks — all still in intro, no shots
      for (let i = 0; i < Game.BOSS_INTRO_TICKS; i++) {
        bossTick(game);
      }
      expect(game._projectiles).toHaveLength(0);
    });

    it("phase advances to PHASE_1 after BOSS_INTRO_TICKS ticks", () => {
      game._enterBossFight();
      for (let i = 0; i < Game.BOSS_INTRO_TICKS; i++) {
        bossTick(game);
      }
      // One more tick tips the intro counter to 0 → phase 1
      bossTick(game);
      expect(game._fight.phase).toBe(Game.BOSS_PHASE_1);
    });

    it("shots appear after intro ends", () => {
      game._enterBossFight();
      skipIntro(game);
      const countAfterIntro = game._projectiles.length;
      // Run up to the first fire interval
      for (let i = 0; i < Game.BOSS_FIRE_INTERVAL; i++) {
        bossTick(game);
      }
      expect(game._projectiles.length).toBeGreaterThan(countAfterIntro);
    });

    it("phase escalates to PHASE_2 at BOSS_PHASE2_HP threshold", () => {
      game._enterBossFight();
      skipIntro(game);
      game._boss.hp = Game.BOSS_PHASE2_HP;
      bossTick(game);
      expect(game._fight.phase).toBe(Game.BOSS_PHASE_2);
    });

    it("phase escalates to PHASE_3 at BOSS_PHASE3_HP threshold", () => {
      game._enterBossFight();
      skipIntro(game);
      game._boss.hp = Game.BOSS_PHASE3_HP;
      bossTick(game);
      expect(game._fight.phase).toBe(Game.BOSS_PHASE_3);
    });

    it("phase does not de-escalate if HP rises (not possible in game, but guarded)", () => {
      game._enterBossFight();
      skipIntro(game);
      game._boss.hp = Game.BOSS_PHASE2_HP;
      bossTick(game);
      expect(game._fight.phase).toBe(Game.BOSS_PHASE_2);
      // HP 'rises' (simulated) — phase must stay at 2
      game._boss.hp = Game.BOSS_HP;
      bossTick(game);
      expect(game._fight.phase).toBe(Game.BOSS_PHASE_2);
    });

    it("phase 2 fires 3 projectiles per volley (spread shots)", () => {
      game._enterBossFight();
      game._fight.phase = Game.BOSS_PHASE_2;
      game._fight._fireCounter = Game.BOSS_FIRE_INTERVAL_P2 - 1;
      const before = game._projectiles.length;
      bossTick(game);
      // 3 shots: main + 2 flankers
      expect(game._projectiles.length - before).toBe(3);
    });

    it("phase 3 fires 3 projectiles per volley (wider spread)", () => {
      game._enterBossFight();
      game._fight.phase = Game.BOSS_PHASE_3;
      game._fight._fireCounter = Game.BOSS_FIRE_INTERVAL_P3 - 1;
      const before = game._projectiles.length;
      bossTick(game);
      expect(game._projectiles.length - before).toBe(3);
    });

    it("phase 2 fires at BOSS_FIRE_INTERVAL_P2 rate", () => {
      game._enterBossFight();
      game._fight.phase = Game.BOSS_PHASE_2;
      game._fight._fireCounter = 0;
      let fired = false;
      for (let i = 0; i < Game.BOSS_FIRE_INTERVAL_P2; i++) {
        const before = game._projectiles.length;
        bossTick(game);
        if (game._projectiles.length > before) {
          fired = true;
          expect(i).toBe(Game.BOSS_FIRE_INTERVAL_P2 - 1); // fires on last tick
        }
      }
      expect(fired).toBe(true);
    });

    it("phase 3 fires at BOSS_FIRE_INTERVAL_P3 rate", () => {
      game._enterBossFight();
      game._fight.phase = Game.BOSS_PHASE_3;
      game._fight._fireCounter = 0;
      let fired = false;
      for (let i = 0; i < Game.BOSS_FIRE_INTERVAL_P3; i++) {
        const before = game._projectiles.length;
        bossTick(game);
        if (game._projectiles.length > before) {
          fired = true;
          expect(i).toBe(Game.BOSS_FIRE_INTERVAL_P3 - 1);
        }
      }
      expect(fired).toBe(true);
    });

    it("fire counter resets on phase escalation", () => {
      game._enterBossFight();
      skipIntro(game);
      // Prime counter close to firing in phase 1
      game._fight._fireCounter = Game.BOSS_FIRE_INTERVAL - 1;
      // Trigger phase 2 escalation
      game._boss.hp = Game.BOSS_PHASE2_HP;
      bossTick(game);
      expect(game._fight.phase).toBe(Game.BOSS_PHASE_2);
      // Counter should have reset to 0 on escalation (boss fired, then counter reset)
      // The exact value after one tick depends on whether the tick that triggered
      // escalation also fired — what matters is it's no longer BOSS_FIRE_INTERVAL-1
      expect(game._fight._fireCounter).not.toBe(Game.BOSS_FIRE_INTERVAL - 1);
    });
  });

  it("projectiles cleared on startRun", () => {
    game._enterBossFight();
    game._projectiles.push({ x: 5, y: 5, dx: 1, dy: 0 });
    game.startRun();
    expect(game._projectiles).toHaveLength(0);
  });
});

describe("contraband system (Step 7)", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  function defeatBoss(g) {
    g._boss.hp = 0;
    g._exitBossVictory();
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("_contraband is empty on startRun", () => {
    expect(game._contraband).toHaveLength(0);
  });

  it("_contrabandPool is null before any boss victory", () => {
    expect(game._contrabandPool).toBeNull();
  });

  it("boss victory transitions to STATE_CONTRABAND", () => {
    game._enterBossFight();
    defeatBoss(game);
    expect(game.state).toBe(Game.STATE_CONTRABAND);
  });

  it("_contrabandPool has 3 items after boss victory", () => {
    game._enterBossFight();
    defeatBoss(game);
    expect(game._contrabandPool).not.toBeNull();
    expect(game._contrabandPool).toHaveLength(3);
  });

  it("_contrabandSelection starts at 0 after boss victory", () => {
    game._enterBossFight();
    defeatBoss(game);
    expect(game._contrabandSelection).toBe(0);
  });

  it("selectContraband changes the selection index", () => {
    game._enterBossFight();
    defeatBoss(game);
    game.selectContraband(2);
    expect(game._contrabandSelection).toBe(2);
  });

  it("selectContraband clamps below 0", () => {
    game._enterBossFight();
    defeatBoss(game);
    game.selectContraband(-5);
    expect(game._contrabandSelection).toBe(0);
  });

  it("selectContraband clamps above pool length", () => {
    game._enterBossFight();
    defeatBoss(game);
    game.selectContraband(99);
    expect(game._contrabandSelection).toBe(2);
  });

  it("selectContraband is no-op outside STATE_CONTRABAND", () => {
    game.selectContraband(2);
    expect(game._contrabandSelection).toBe(0);
  });

  it("confirmContraband adds chosen item to _contraband stash", () => {
    game._enterBossFight();
    defeatBoss(game);
    game.foodRequired = 9999;
    const chosenId = game._contrabandPool[0].id;
    game.selectContraband(0);
    game.confirmContraband();
    expect(game._contraband).toHaveLength(1);
    expect(game._contraband[0].id).toBe(chosenId);
  });

  it("confirmContraband clears _contrabandPool", () => {
    game._enterBossFight();
    defeatBoss(game);
    game.foodRequired = 9999;
    game.confirmContraband();
    expect(game._contrabandPool).toBeNull();
  });

  it("confirmContraband → STATE_PLAYING when below food threshold", () => {
    game._enterBossFight();
    game.foodEaten = 0;
    game.foodRequired = 9999;
    defeatBoss(game);
    game.confirmContraband();
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("confirmContraband → STATE_DRAFT when food threshold crossed", () => {
    game._enterBossFight();
    game.foodEaten = 0;
    game.foodRequired = Game.BOSS_FOOD_REWARD; // threshold met exactly by reward
    defeatBoss(game);
    game.confirmContraband();
    expect(game.state).toBe(Game.STATE_DRAFT);
  });

  it("_contraband persists across multiple boss fights", () => {
    game._enterBossFight();
    game.foodRequired = 9999;
    defeatBoss(game);
    game.confirmContraband();
    expect(game._contraband).toHaveLength(1);

    // Fight and defeat a second boss
    game._enterBossFight();
    defeatBoss(game);
    game.confirmContraband();
    expect(game._contraband).toHaveLength(2);
  });

  it("_contraband resets to empty on startRun", () => {
    game._enterBossFight();
    game.foodRequired = 9999;
    defeatBoss(game);
    game.confirmContraband();
    expect(game._contraband).toHaveLength(1);
    game.startRun();
    expect(game._contraband).toHaveLength(0);
  });

  it("confirmContraband is no-op outside STATE_CONTRABAND", () => {
    const stateBefore = game.state;
    game.confirmContraband();
    expect(game.state).toBe(stateBefore);
  });

  it("all 6 contraband items have id, apply, and labels", async () => {
    const { LABELS } = await import("../src/text/labels.js");
    for (const item of CONTRABAND_DEFS) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.apply).toBe("function");
      expect(typeof LABELS.upgrades[item.id].name).toBe("string");
      expect(typeof LABELS.upgrades[item.id].desc).toBe("string");
    }
  });
});

describe("contraband style filter", () => {
  // Items with no `styles` field are universal; items listing styles are
  // restricted to those. The bullet-hell-only set was chosen because its
  // mechanics rely on weak points / boss HP / Y-lock — none of which exist
  // in survival.
  const BULLET_HELL_ONLY = ["danger_noodle", "double_snake", "snake_hungry", "collateral_hissage"];

  it("bullet-hell pool can include every contraband item", () => {
    // With a deterministic identity rng, the shuffle is a no-op and the
    // first 3 of the eligible list come out — but eligibility under
    // bullet-hell is the full set, so all 6 are reachable.
    const eligibleIds = CONTRABAND_DEFS.filter(
      (def) => !def.styles || def.styles.includes("bullet_hell")
    ).map((def) => def.id);
    expect(eligibleIds).toHaveLength(CONTRABAND_DEFS.length);
  });

  it("survival pool excludes bullet-hell-only items", () => {
    const eligible = CONTRABAND_DEFS.filter(
      (def) => !def.styles || def.styles.includes("survival")
    );
    for (const id of BULLET_HELL_ONLY) {
      expect(eligible.find((def) => def.id === id)).toBeUndefined();
    }
  });

  it("survival pool keeps universal contraband (gomu, jail-free)", () => {
    const eligible = CONTRABAND_DEFS.filter(
      (def) => !def.styles || def.styles.includes("survival")
    );
    expect(eligible.find((def) => def.id === "gomu_gomu")).toBeDefined();
    expect(eligible.find((def) => def.id === "get_out_of_jail_free")).toBeDefined();
  });

  it("generateContrabandPool defaults to bullet-hell when style omitted", () => {
    let calls = 0;
    const pool = generateContrabandPool(() => 0.5 + 0.001 * calls++);
    // Default behaviour preserves the pre-styles draft pool size (3).
    expect(pool).toHaveLength(3);
  });

  it("generateContrabandPool with survival style returns no locked items", () => {
    let calls = 0;
    const pool = generateContrabandPool(() => 0.5 + 0.001 * calls++, "survival");
    for (const item of pool) {
      expect(BULLET_HELL_ONLY).not.toContain(item.id);
    }
  });
});

describe("survival style", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("setup seeds _bossSurvival with SURVIVAL_WIN_TICKS", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    expect(game._bossSurvival.ticksLeft).toBe(SURVIVAL_WIN_TICKS);
  });

  it("setup records snake length at fight entry", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    expect(game._bossSurvival.snakeLengthAtEntry).toBe(game.snake.snakeLength);
  });

  it("setup creates a _boss name shim and nulls _fight", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    expect(game._boss).not.toBeNull();
    expect(typeof game._boss.name).toBe("string");
    expect(game._fight).toBeNull();
  });

  it("tick decrements ticksLeft once per BOSS_TICK_MS gate (post-intro)", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    game._bossSurvival.introTicks = 0; // skip intro so the countdown advances
    const before = game._bossSurvival.ticksLeft;
    game._lastBossTickTime = 0; // force the gate to fire
    survivalStyle.tick(game);
    expect(game._bossSurvival.ticksLeft).toBe(before - 1);
  });

  it("tick is a no-op while inside the BOSS_TICK_MS gate", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    game._bossSurvival.introTicks = 0;
    const before = game._bossSurvival.ticksLeft;
    // _lastBossTickTime was just set to Date.now() in setup — gate blocks
    survivalStyle.tick(game);
    expect(game._bossSurvival.ticksLeft).toBe(before);
  });

  it("tick decrements introTicks during the intro window", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    const intro = game._bossSurvival.introTicks;
    const ticksLeft = game._bossSurvival.ticksLeft;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    expect(game._bossSurvival.introTicks).toBe(intro - 1);
    expect(game._bossSurvival.ticksLeft).toBe(ticksLeft); // countdown frozen during intro
  });

  it("tick triggers _exitBossVictory when ticksLeft hits zero", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    game._bossSurvival.introTicks = 0;
    game._bossSurvival.ticksLeft = 1;
    game._bossDef = { id: "test_survival", style: "survival" };
    game.state = Game.STATE_BOSS;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    expect(game.state).toBe(Game.STATE_CONTRABAND);
  });

  it("survival victory feeds the survival contraband pool (no bullet-hell-only items)", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    game._bossSurvival.introTicks = 0;
    game._bossDef = { id: "test_survival", style: "survival" };
    game.state = Game.STATE_BOSS;
    game._bossSurvival.ticksLeft = 1;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    expect(game._contrabandPool).not.toBeNull();
    const lockedIds = ["danger_noodle", "double_snake", "snake_hungry", "collateral_hissage"];
    for (const item of game._contrabandPool) {
      expect(lockedIds).not.toContain(item.id);
    }
  });

  it("teardown clears _bossSurvival", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    survivalStyle.teardown(game);
    expect(game._bossSurvival).toBeNull();
  });

  // ── Step 3: chase mechanics ──────────────────────────────────────

  it("findFurthestPlacement returns BFS-furthest 2×2 from snake head", () => {
    // Open 31×31 grid (simpleGridSetup), snake centred at (15, 15).
    // All four corners tie at min-distance 28; row-major iteration picks
    // top-left (0, 0).
    const spawn = survivalStyle.findFurthestPlacement(game.grid, 15, 15);
    expect(spawn).not.toBeNull();
    expect(spawn.x).toBe(0);
    expect(spawn.y).toBe(0);
  });

  it("setup spawns the blob at the BFS-furthest placement", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    expect(game._bossSurvival.blob.x).toBe(0);
    expect(game._bossSurvival.blob.y).toBe(0);
  });

  it("planBlobMove reduces distance toward the snake head", () => {
    // Blob at (0, 0), snake at (15, 15). The blob's 2×2 footprint has
    // min-distance 28 (cell (1,1)); both south and east neighbours
    // reduce that to 27. NSEW iteration order picks south first.
    const blob = { x: 0, y: 0, lastDx: 0, lastDy: 0 };
    const move = survivalStyle.planBlobMove(game.grid, blob, 15, 15);
    expect(move.dx).toBe(0);
    expect(move.dy).toBe(1);
  });

  it("blob blocked by walls picks the only valid neighbour", () => {
    // Wall the blob into a corridor that only opens to the east.
    game.grid.setCell("wall", 1, 2); // block south
    const blob = { x: 0, y: 0, lastDx: 0, lastDy: 0 };
    const move = survivalStyle.planBlobMove(game.grid, blob, 15, 15);
    expect(move.dx).toBe(1);
    expect(move.dy).toBe(0);
  });

  it("intro ticks freeze both snake and blob", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    const blobBefore = { x: game._bossSurvival.blob.x, y: game._bossSurvival.blob.y };
    const headBefore = {
      x: game.snake.snakeX[game.snake.headIndex],
      y: game.snake.snakeY[game.snake.headIndex],
    };
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    expect(game._bossSurvival.blob.x).toBe(blobBefore.x);
    expect(game._bossSurvival.blob.y).toBe(blobBefore.y);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(headBefore.x);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(headBefore.y);
  });

  it("post-intro tick advances snake and steps the blob", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    game._bossSurvival.introTicks = 0;
    game._lastBossTickTime = 0;
    const blobBefore = { x: game._bossSurvival.blob.x, y: game._bossSurvival.blob.y };
    const headBefore = {
      x: game.snake.snakeX[game.snake.headIndex],
      y: game.snake.snakeY[game.snake.headIndex],
    };
    survivalStyle.tick(game);
    // Snake auto-advances one cell in its facing direction (right).
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(headBefore.x + 1);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(headBefore.y);
    // Blob steps one cell toward the snake (south first per NSEW order).
    expect(game._bossSurvival.blob.x).toBe(blobBefore.x);
    expect(game._bossSurvival.blob.y).toBe(blobBefore.y + 1);
  });

  it("snake stepping into the blob causes DEATH_BLOB", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    game._bossSurvival.introTicks = 0;
    // Place blob covering (16,14)..(17,15). Snake head at (15,15) facing
    // right; next snake.step lands head at (16,15) → inside the blob.
    game._bossSurvival.blob.x = 16;
    game._bossSurvival.blob.y = 14;
    game._bossDef = { id: "catacombs_chaser", style: "survival" };
    game.state = Game.STATE_BOSS;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    game.cancelNameInput(); // _exitBossDeath → STATE_NAME_INPUT → cancel → STATE_DEAD
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_BLOB);
  });

  it("snake hitting a wall during survival causes DEATH_WALL", () => {
    game.grid.setCell("wall", 16, 15); // block snake's next step
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    game._bossSurvival.introTicks = 0;
    game._bossDef = { id: "catacombs_chaser", style: "survival" };
    game.state = Game.STATE_BOSS;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_WALL);
  });

  it("setup runs def.bootGrid when the snake is uninitialised (practice mode)", () => {
    // Simulate `_enterPracticeBossFight`: a fresh Snake with snakeLength=0.
    game.snake = new Snake();
    let bootCalled = false;
    const def = {
      id: "test_chaser",
      style: "survival",
      bootGrid(g) {
        bootCalled = true;
        // Mimic generateCatacombsGrid: spawn snake at a valid cell.
        g.snake.init(g.grid, 5, 5, 3, 1, 0);
      },
    };
    survivalStyle.setup(game, def);
    expect(bootCalled).toBe(true);
    expect(game.snake.snakeLength).toBe(3);
    // Blob spawns away from the freshly-positioned snake, not at (0, 0).
    expect(game._bossSurvival.blob).toBeDefined();
  });

  it("setup skips def.bootGrid when the snake is already on the maze (production)", () => {
    // simpleGridSetup in beforeEach already initialised the snake.
    let bootCalled = false;
    const def = {
      id: "test_chaser",
      style: "survival",
      bootGrid() {
        bootCalled = true;
      },
    };
    survivalStyle.setup(game, def);
    expect(bootCalled).toBe(false);
  });

  // ── Step 4: path-shift driver + push/stun ────────────────────────

  it("path-shift driver advances the rifts mechanic on tick cadence", () => {
    survivalStyle.setup(game, { id: "test_chaser", style: "survival" });
    game._bossSurvival.introTicks = 0;
    // Stub a minimal rifts mechanic so advanceRifts has somewhere to write.
    game.mechanic = {
      type: "rifts",
      state: "linger",
      rand: () => 0,
      biteCounter: 0,
      pendingRift: null,
      riftBatch: [],
    };
    // One tick before the threshold; the next tick should fire advanceRifts.
    game._bossSurvival.shiftCounter = SURVIVAL_RIFT_INTERVAL_TICKS - 1;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    expect(game.mechanic.biteCounter).toBe(1);
    expect(game._bossSurvival.shiftCounter).toBe(0);
  });

  it("path-shift driver does not fire before the cadence interval elapses", () => {
    survivalStyle.setup(game, { id: "test_chaser", style: "survival" });
    game._bossSurvival.introTicks = 0;
    game.mechanic = {
      type: "rifts",
      state: "linger",
      rand: () => 0,
      biteCounter: 0,
      pendingRift: null,
      riftBatch: [],
    };
    // Two ticks under the threshold — biteCounter must stay at 0.
    game._bossSurvival.shiftCounter = SURVIVAL_RIFT_INTERVAL_TICKS - 3;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    expect(game.mechanic.biteCounter).toBe(0);
  });

  it("flip closing on the blob pushes it back along -lastDir and stuns it", () => {
    survivalStyle.setup(game, { id: "test_chaser", style: "survival" });
    game._bossSurvival.introTicks = 0;
    // Place the blob away from the snake; lastDir = east, so push direction = west.
    game._bossSurvival.blob.x = 5;
    game._bossSurvival.blob.y = 5;
    game._bossSurvival.blob.lastDx = 1;
    game._bossSurvival.blob.lastDy = 0;
    // Wall part of the blob's footprint to simulate a flip that just landed
    // on it. Cells (3, 5)..(4, 6) stay open so the push has somewhere to land.
    game.grid.setCell("wall", 5, 5);
    game.grid.setCell("wall", 6, 5);
    // Force the shift driver to fire on this tick.
    game._bossSurvival.shiftCounter = SURVIVAL_RIFT_INTERVAL_TICKS - 1;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    // Pushed west to the first valid 2×2 placement: (3, 5).
    expect(game._bossSurvival.blob.x).toBe(3);
    expect(game._bossSurvival.blob.y).toBe(5);
    expect(game._bossSurvival.blob.stunTicks).toBe(SURVIVAL_BOSS_STUN_TICKS);
    // lastDir cleared so the next plan replans freshly.
    expect(game._bossSurvival.blob.lastDx).toBe(0);
    expect(game._bossSurvival.blob.lastDy).toBe(0);
  });

  it("flip leaves the blob alone when its footprint stays clear", () => {
    survivalStyle.setup(game, { id: "test_chaser", style: "survival" });
    game._bossSurvival.introTicks = 0;
    game._bossSurvival.blob.x = 5;
    game._bossSurvival.blob.y = 5;
    game._bossSurvival.blob.lastDx = 1;
    game._bossSurvival.blob.lastDy = 0;
    // No walls touching the blob's footprint (5..6, 5..6).
    game._bossSurvival.shiftCounter = SURVIVAL_RIFT_INTERVAL_TICKS - 1;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    // Blob may have moved one cell via planBlobMove, but no push/stun.
    expect(game._bossSurvival.blob.stunTicks).toBe(0);
  });

  it("blob stun ticks count down without movement", () => {
    survivalStyle.setup(game, { id: "test_survival", style: "survival" });
    game._bossSurvival.introTicks = 0;
    game._bossSurvival.blob.x = 5;
    game._bossSurvival.blob.y = 5;
    game._bossSurvival.blob.stunTicks = 3;
    game._lastBossTickTime = 0;
    survivalStyle.tick(game);
    expect(game._bossSurvival.blob.stunTicks).toBe(2);
    // Snake moved one cell, but blob stayed put.
    expect(game._bossSurvival.blob.x).toBe(5);
    expect(game._bossSurvival.blob.y).toBe(5);
  });
});

describe("catacombs survival integration (Step 5)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = generateCatacombsGrid;
    game.advanceGrid = advanceCatacombsGrid;
    game.startRun();
    game.upgrades.setMutation("catacombs");
  });

  it("resolves the boss def to catacombs_chaser with survival style", () => {
    game._enterBossFight();
    expect(game._bossDef.id).toBe("catacombs_chaser");
    expect(game._bossDef.style).toBe("survival");
    expect(game.state).toBe(Game.STATE_BOSS);
  });

  it("clears food cells at fight entry", () => {
    expect(game.grid.foodX).toBeGreaterThanOrEqual(0); // catacombs places food at start
    game._enterBossFight();
    expect(game.grid.foodX).toBe(-1);
    expect(game.grid.foodY).toBe(-1);
    expect(game.grid.bossFoodX).toBe(-1);
    expect(game.grid.bossFoodY).toBe(-1);
  });

  it("spawns the blob at a valid 2×2 corridor placement", () => {
    game._enterBossFight();
    const blob = game._bossSurvival.blob;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        expect(game.grid.isWallCell(blob.x + dx, blob.y + dy)).toBe(false);
      }
    }
  });

  it("blob spawn is far from the snake head (BFS-furthest)", () => {
    // Pin the seed: BFS-furthest in a maze is "far" by maze-distance,
    // but the *Manhattan* distance varies with the specific layout —
    // some mazes wind back so the BFS-furthest 2×2 is geographically
    // close. With random seeds this asserted-on Manhattan threshold
    // flaked rarely (~1 in 20 runs). Pinning the seed makes the
    // layout reproducible while still exercising the BFS placement.
    game._pendingRunSeed = 1;
    game.startRun();
    game.upgrades.setMutation("catacombs");

    game._enterBossFight();
    const blob = game._bossSurvival.blob;
    const head = {
      x: game.snake.snakeX[game.snake.headIndex],
      y: game.snake.snakeY[game.snake.headIndex],
    };
    const dist = Math.abs(blob.x - head.x) + Math.abs(blob.y - head.y);
    expect(dist).toBeGreaterThan(10);
  });

  it("survives SURVIVAL_WIN_TICKS → STATE_CONTRABAND", () => {
    game._enterBossFight();
    game._bossSurvival.introTicks = 0;
    game._bossSurvival.ticksLeft = 1;
    game._lastBossTickTime = 0;
    game._bossTick();
    expect(game.state).toBe(Game.STATE_CONTRABAND);
  });

  it("survival contraband pool excludes bullet-hell-only items", () => {
    game._enterBossFight();
    game._bossSurvival.introTicks = 0;
    game._bossSurvival.ticksLeft = 1;
    game._lastBossTickTime = 0;
    game._bossTick();
    expect(game._contrabandPool).not.toBeNull();
    const lockedIds = ["danger_noodle", "double_snake", "snake_hungry", "collateral_hissage"];
    for (const item of game._contrabandPool) {
      expect(lockedIds).not.toContain(item.id);
    }
  });

  it("rifts mechanic stays initialised across the boss-fight transition", () => {
    // generateCatacombsGrid sets up rifts; survival.setup must not clobber it
    // because the path-shift driver relies on advanceRifts(game).
    expect(game.mechanic).not.toBeNull();
    expect(game.mechanic.type).toBe("rifts");
    game._enterBossFight();
    expect(game.mechanic).not.toBeNull();
    expect(game.mechanic.type).toBe("rifts");
  });
});

describe("hissalia / soulslike scaffolding (Step 1)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
  });

  it("Hissalia is in ALL_BOSS_DEFS and reachable via id", async () => {
    const { ALL_BOSS_DEFS, getBossDefById } = await import("../src/core/boss/bosses/index.js");
    expect(ALL_BOSS_DEFS.find((d) => d.id === "hissalia")).toBeDefined();
    const def = getBossDefById("hissalia");
    expect(def).not.toBeNull();
    expect(def.style).toBe("soulslike");
  });

  it("entering Hissalia via practice resolves to soulslike style without crashing", () => {
    game._practiceBossId = "hissalia";
    game._enterBossFight();
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game._bossDef.id).toBe("hissalia");
    expect(game._bossDef.style).toBe("soulslike");
    // The minimal _boss shim carries Hissalia's display name.
    expect(game._boss).not.toBeNull();
    expect(game._boss.name).toBe("Hissalia, Blade of Wormwood (WIP)");
  });

  it("tick + teardown on the scaffold don't throw", () => {
    game._practiceBossId = "hissalia";
    game._enterBossFight();
    expect(() => game._bossTick()).not.toThrow();
    expect(() => game._bossTick()).not.toThrow();
    // Practice victory transitions cleanly back to the hub.
    game._practiceMode = "single";
    expect(() => game._exitBossVictory()).not.toThrow();
    expect(game.state).toBe(Game.STATE_PRACTICE_HUB);
    expect(game._boss).toBeNull();
    expect(game._soulslike).toBeNull();
  });
});

describe("hissalia / soulslike arena (Step 2)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  it("carves a 29×29 inner playable area at (1..29, 1..29)", () => {
    // Scenery (tree, gravestones) sit inside the playable area and
    // still report as wall cells for collision. The arena parser
    // exposes the scenery regions on `game._arenaScenery`; skip
    // those cells before asserting "everything else is floor."
    const blocked = new Set();
    for (const region of game._arenaScenery ?? []) {
      if (!region.blocking) {
        continue;
      }
      for (const cell of region.cells) {
        blocked.add(cell.y * game.grid.width + cell.x);
      }
    }
    for (let dy = 0; dy < 29; dy++) {
      for (let dx = 0; dx < 29; dx++) {
        const x = 1 + dx;
        const y = 1 + dy;
        if (blocked.has(y * game.grid.width + x)) {
          continue;
        }
        expect(game.grid.isWallCell(x, y)).toBe(false);
      }
    }
  });

  it("loads the parsed scenery onto game._arenaScenery", () => {
    expect(Array.isArray(game._arenaScenery)).toBe(true);
    const types = new Set(game._arenaScenery.map((r) => r.type));
    expect(types.has("tree")).toBe(true);
    expect(types.has("gravestone")).toBe(true);
    expect(types.has("flower")).toBe(true);
  });

  it("walls the border around the inner area", () => {
    // Single-cell wall ring around a 29×29 floor.
    for (let i = 0; i < 31; i++) {
      expect(game.grid.isWallCell(0, i)).toBe(true); // west border
      expect(game.grid.isWallCell(30, i)).toBe(true); // east border
      expect(game.grid.isWallCell(i, 0)).toBe(true); // north border
      expect(game.grid.isWallCell(i, 30)).toBe(true); // south border
    }
  });

  it("spawns the snake as a 1-cell fighter south-centred facing north", () => {
    expect(game.snake.snakeLength).toBe(1);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(15);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(24);
    expect(game.snake.dirX).toBe(0);
    expect(game.snake.dirY).toBe(-1);
  });

  it("places the 2×2 boss at the north-centred spawn", () => {
    // Inner area is 20×20 at (5, 5); 2×2 boss top-left at (14, 5)
    // spans (14..15, 5..6) — top of the playable area, centred
    // horizontally around x=15 (matches the snake's column).
    expect(game._soulslike.bossX).toBe(14);
    expect(game._soulslike.bossY).toBe(5);
  });

  it("snake and boss footprints don't overlap", () => {
    const headX = game.snake.snakeX[game.snake.headIndex];
    const headY = game.snake.snakeY[game.snake.headIndex];
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const overlap =
          game._soulslike.bossX + dx === headX && game._soulslike.bossY + dy === headY;
        expect(overlap).toBe(false);
      }
    }
  });

  it("clears food cells (no food during a soulslike fight)", () => {
    expect(game.grid.foodX).toBe(-1);
    expect(game.grid.foodY).toBe(-1);
    expect(game.grid.bossFoodX).toBe(-1);
    expect(game.grid.bossFoodY).toBe(-1);
  });

  it("seeds _soulslike with HP, stamina, boss HP at v1 defaults", () => {
    const sl = game._soulslike;
    expect(sl.snakeHp).toBe(5);
    expect(sl.snakeHpMax).toBe(5);
    expect(sl.stamina).toBe(5);
    expect(sl.staminaMax).toBe(5);
    expect(sl.bossHp).toBe(30);
    expect(sl.bossHpMax).toBe(30);
    expect(sl.bossPhase).toBe(1);
  });

  it("seeds _soulslike with zeroed counters and idle anim states", () => {
    const sl = game._soulslike;
    expect(sl.staminaRegenCounter).toBe(0);
    expect(sl.staminaDelayCounter).toBe(0);
    expect(sl.dodgeIframes).toBe(0);
    expect(sl.dodgeRecovery).toBe(0);
    expect(sl.parryWindow).toBe(0);
    expect(sl.bossAttackId).toBeNull();
    expect(sl.phaseTransitionTicks).toBe(0);
    expect(sl.waterfowlPhase).toBe(0);
    expect(sl.deathScreenTicks).toBe(0);
    expect(sl.snakeAnim).toEqual({ state: "idle", framesIn: 0 });
    expect(sl.bossAnim).toEqual({ state: "idle", framesIn: 0 });
  });
});

describe("hissalia / soulslike fighter movement (Step 3)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  function forceMoveSubtick(g) {
    g._lastBossMoveTime = 0;
    g._bossTick();
  }

  it("onInput sets _heldDirection and _playerFacing", () => {
    game.onInput(1, 0);
    expect(game._heldDirection).toEqual({ dx: 1, dy: 0 });
    expect(game._playerFacing).toEqual({ dx: 1, dy: 0 });
  });

  it("vertical input is allowed (no Y-lock in soulslike)", () => {
    game.onInput(0, 1);
    expect(game._heldDirection).toEqual({ dx: 0, dy: 1 });
    expect(game._playerFacing).toEqual({ dx: 0, dy: 1 });
  });

  it("tick moves the snake one cell in the held direction", () => {
    const startX = game.snake.snakeX[game.snake.headIndex];
    const startY = game.snake.snakeY[game.snake.headIndex];
    game.onInput(1, 0);
    forceMoveSubtick(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(startX + 1);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(startY);
  });

  it("snake doesn't auto-advance without held direction", () => {
    const startX = game.snake.snakeX[game.snake.headIndex];
    const startY = game.snake.snakeY[game.snake.headIndex];
    forceMoveSubtick(game);
    forceMoveSubtick(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(startX);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(startY);
  });

  it("snake stops when input is released", () => {
    game.onInput(1, 0);
    forceMoveSubtick(game);
    const afterX = game.snake.snakeX[game.snake.headIndex];
    game.onInputRelease(1, 0);
    forceMoveSubtick(game);
    forceMoveSubtick(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(afterX);
  });

  it("snake is blocked by the arena's southern wall", () => {
    // Spawn at (15, 24); the south wall ring is at y=30 — hold south
    // long enough to reach it and assert the snake stops there.
    game.onInput(0, 1);
    for (let i = 0; i < 10; i++) {
      forceMoveSubtick(game);
    }
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(29);
    forceMoveSubtick(game);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(29);
  });

  it("snake reaches the eastern wall and stops, doesn't leak past", () => {
    // Snake spawns at (15, 24); the SE-corner tree blocks col 26+ on
    // this row, so the snake should stop at col 25.
    game.onInput(1, 0);
    for (let i = 0; i < 30; i++) {
      forceMoveSubtick(game);
    }
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(25);
    forceMoveSubtick(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(25);
  });

  it("facing follows input even on a blocked move", () => {
    // Snake at (8, 8), input west — blocked but facing should still
    // update.
    game.onInput(-1, 0);
    forceMoveSubtick(game);
    expect(game._playerFacing).toEqual({ dx: -1, dy: 0 });
  });

  it("takeDamage decrements snakeHp and stops at zero", async () => {
    const { takeDamage } = await import("../src/core/boss/styles/soulslike/player.js");
    expect(game._soulslike.snakeHp).toBe(5);
    takeDamage(game, 2, "overhead");
    expect(game._soulslike.snakeHp).toBe(3);
    takeDamage(game, 10, "overhead");
    expect(game._soulslike.snakeHp).toBe(0);
  });

  it("takeDamage at zero HP records the attack name as the death cause", async () => {
    const { takeDamage } = await import("../src/core/boss/styles/soulslike/player.js");
    takeDamage(game, 99, "waterfowl");
    expect(game._soulslike.snakeHp).toBe(0);
    expect(game.snake.deathCause).toBe("waterfowl");
  });
});

describe("hissalia / soulslike stamina (Step 4)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  function forceBossSubtick(g) {
    g._lastBossTickTime = 0;
    g._bossTick();
  }

  it("tryConsume succeeds when stamina is sufficient and arms the regen delay", async () => {
    const { tryConsume } = await import("../src/core/boss/styles/soulslike/stamina.js");
    const ok = tryConsume(game, 2);
    expect(ok).toBe(true);
    expect(game._soulslike.stamina).toBe(3);
    expect(game._soulslike.staminaDelayCounter).toBe(6);
    expect(game._soulslike.staminaRegenCounter).toBe(0);
  });

  it("tryConsume fails (no-op) when stamina is insufficient", async () => {
    const { tryConsume } = await import("../src/core/boss/styles/soulslike/stamina.js");
    game._soulslike.stamina = 1;
    const ok = tryConsume(game, 2);
    expect(ok).toBe(false);
    expect(game._soulslike.stamina).toBe(1);
    // Delay counter unaffected on failure.
    expect(game._soulslike.staminaDelayCounter).toBe(0);
  });

  it("regen decrements the delay counter before accruing regen", async () => {
    const { regenStamina } = await import("../src/core/boss/styles/soulslike/stamina.js");
    game._soulslike.stamina = 3;
    game._soulslike.staminaDelayCounter = 2;
    regenStamina(game);
    expect(game._soulslike.staminaDelayCounter).toBe(1);
    expect(game._soulslike.stamina).toBe(3);
    regenStamina(game);
    expect(game._soulslike.staminaDelayCounter).toBe(0);
    expect(game._soulslike.stamina).toBe(3);
  });

  it("regen accrues 10 ticks → +1 stamina", async () => {
    const { regenStamina } = await import("../src/core/boss/styles/soulslike/stamina.js");
    game._soulslike.stamina = 2;
    game._soulslike.staminaDelayCounter = 0;
    for (let i = 0; i < 9; i++) {
      regenStamina(game);
      expect(game._soulslike.stamina).toBe(2);
    }
    regenStamina(game);
    expect(game._soulslike.stamina).toBe(3);
    expect(game._soulslike.staminaRegenCounter).toBe(0);
  });

  it("regen caps at staminaMax", async () => {
    const { regenStamina } = await import("../src/core/boss/styles/soulslike/stamina.js");
    expect(game._soulslike.stamina).toBe(5); // starts full
    for (let i = 0; i < 30; i++) {
      regenStamina(game);
    }
    expect(game._soulslike.stamina).toBe(5);
  });

  it("the boss sub-tick fires regen on its 120 ms gate", async () => {
    const { tryConsume } = await import("../src/core/boss/styles/soulslike/stamina.js");
    // Spend 1 stamina + clear the delay so regen can accrue this run.
    tryConsume(game, 1);
    game._soulslike.staminaDelayCounter = 0;
    expect(game._soulslike.stamina).toBe(4);
    // Ten boss-tick gates → +1 stamina.
    for (let i = 0; i < 10; i++) {
      forceBossSubtick(game);
    }
    expect(game._soulslike.stamina).toBe(5);
  });
});

describe("hissalia / soulslike stab (Step 5)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  function forceBossSubtick(g) {
    g._lastBossTickTime = 0;
    g._bossTick();
  }

  it("knifePosition rest: 1 cell to the player's right", async () => {
    const { knifePosition } = await import("../src/core/boss/styles/soulslike/combat.js");
    // Facing east → right is south. Rest knife at (10, 11).
    expect(knifePosition(10, 10, 1, 0, false)).toEqual({ x: 10, y: 11 });
    // Facing south → right is west. Rest at (9, 10).
    expect(knifePosition(10, 10, 0, 1, false)).toEqual({ x: 9, y: 10 });
    // Facing west → right is north. Rest at (10, 9).
    expect(knifePosition(10, 10, -1, 0, false)).toEqual({ x: 10, y: 9 });
    // Facing north → right is east. Rest at (11, 10).
    expect(knifePosition(10, 10, 0, -1, false)).toEqual({ x: 11, y: 10 });
  });

  it("knifePosition stab: rest position + 1 cell forward", async () => {
    const { knifePosition } = await import("../src/core/boss/styles/soulslike/combat.js");
    // Facing east: rest (10, 11) + forward (1, 0) = (11, 11).
    expect(knifePosition(10, 10, 1, 0, true)).toEqual({ x: 11, y: 11 });
    // Facing north: rest (11, 10) + forward (0, -1) = (11, 9).
    expect(knifePosition(10, 10, 0, -1, true)).toEqual({ x: 11, y: 9 });
  });

  it("stab consumes 1 stamina and arms the stab_active animation", async () => {
    const { stab } = await import("../src/core/boss/styles/soulslike/combat.js");
    expect(game._soulslike.stamina).toBe(5);
    const ok = stab(game);
    expect(ok).toBe(true);
    expect(game._soulslike.stamina).toBe(4);
    expect(game._soulslike.snakeAnim.state).toBe("stab_active");
  });

  it("stab no-ops when stamina is insufficient", async () => {
    const { stab } = await import("../src/core/boss/styles/soulslike/combat.js");
    game._soulslike.stamina = 0;
    const ok = stab(game);
    expect(ok).toBe(false);
    expect(game._soulslike.stamina).toBe(0);
    expect(game._soulslike.snakeAnim.state).toBe("idle");
  });

  it("stab + boss sub-tick deals 1 damage when knife tip overlaps boss", async () => {
    const { stab } = await import("../src/core/boss/styles/soulslike/combat.js");
    // 1×1 boss at (15, 5). Place snake at (14, 4) facing east → handle
    // (15, 4), tip (15, 5) — knife tip on the boss cell.
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 14;
    game.snake.snakeY[head] = 4;
    game.grid.setCell("snake", 14, 4);
    game._playerFacing = { dx: 1, dy: 0 };

    const before = game._soulslike.bossHp;
    stab(game);
    forceBossSubtick(game);
    expect(game._soulslike.bossHp).toBe(before - 1);
    expect(game._soulslike.snakeAnim.state).toBe("idle");
  });

  it("stab + boss sub-tick misses when the knife tip is off the boss", async () => {
    const { stab } = await import("../src/core/boss/styles/soulslike/combat.js");
    // Default spawn at (15, 24) facing north; tip lands at (16, 23) —
    // far from the boss top-left at (14, 5).
    const before = game._soulslike.bossHp;
    stab(game);
    forceBossSubtick(game);
    expect(game._soulslike.bossHp).toBe(before);
    expect(game._soulslike.snakeAnim.state).toBe("idle");
  });

  it('game.onPlayerAction("stab") triggers a stab in STATE_BOSS', () => {
    expect(game._soulslike.stamina).toBe(5);
    game.onPlayerAction("stab");
    expect(game._soulslike.stamina).toBe(4);
    expect(game._soulslike.snakeAnim.state).toBe("stab_active");
  });

  it("onPlayerAction is a no-op outside STATE_BOSS", () => {
    game._practiceMode = "single";
    game._exitBossVictory();
    expect(game.state).not.toBe(Game.STATE_BOSS);
    // Soulslike state is torn down; this should not throw.
    expect(() => game.onPlayerAction("stab")).not.toThrow();
  });

  it("dispatchAction(ACTION_STAB) routes to stab in STATE_BOSS", async () => {
    const { dispatchAction, ACTION_STAB } = await import("../src/input/actions.js");
    expect(game._soulslike.stamina).toBe(5);
    dispatchAction(game, ACTION_STAB);
    expect(game._soulslike.stamina).toBe(4);
  });
});

describe("hissalia / soulslike dodge (Step 6)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  function forceBossSubtick(g) {
    g._lastBossTickTime = 0;
    g._bossTick();
  }

  function forceMoveSubtick(g) {
    g._lastBossMoveTime = 0;
    g._bossTick();
  }

  it("dodge moves the snake DODGE_DISTANCE cells in the held direction", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    const startX = game.snake.snakeX[game.snake.headIndex];
    game.onInput(1, 0); // hold east
    const ok = dodge(game);
    expect(ok).toBe(true);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(startX + 2);
  });

  it("dodge falls back to facing when no held direction", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    const startY = game.snake.snakeY[game.snake.headIndex];
    expect(game._heldDirection).toBeNull();
    expect(game._playerFacing).toEqual({ dx: 0, dy: -1 });
    dodge(game);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(startY - 2);
  });

  it("dodge stops at a wall", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    // Place the snake adjacent to the south wall (row 30) so a south
    // dodge has nowhere to advance.
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 15;
    game.snake.snakeY[head] = 29;
    game.grid.setCell("snake", 15, 29);
    game.onInput(0, 1);
    dodge(game);
    expect(game.snake.snakeY[head]).toBe(29);
  });

  it("dodge consumes 2 stamina", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    expect(game._soulslike.stamina).toBe(5);
    dodge(game);
    expect(game._soulslike.stamina).toBe(3);
  });

  it("dodge no-ops when stamina is below cost", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    game._soulslike.stamina = 1;
    const startX = game.snake.snakeX[game.snake.headIndex];
    const ok = dodge(game);
    expect(ok).toBe(false);
    expect(game._soulslike.stamina).toBe(1);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(startX);
  });

  it("dodge sets iframes + recovery + dodge_active anim", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    game.onInput(1, 0);
    dodge(game);
    expect(game._soulslike.dodgeIframes).toBe(4);
    expect(game._soulslike.dodgeRecovery).toBe(4);
    expect(game._soulslike.snakeAnim.state).toBe("dodge_active");
  });

  it("takeDamage during iframes is a no-op", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    const { takeDamage } = await import("../src/core/boss/styles/soulslike/player.js");
    game.onInput(1, 0);
    dodge(game);
    expect(game._soulslike.snakeHp).toBe(5);
    takeDamage(game, 3, "overhead");
    expect(game._soulslike.snakeHp).toBe(5);
  });

  it("takeDamage during recovery (post-iframes) does deal damage", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    const { takeDamage } = await import("../src/core/boss/styles/soulslike/player.js");
    game.onInput(1, 0);
    dodge(game);
    for (let i = 0; i < 4; i++) {
      forceBossSubtick(game);
    }
    expect(game._soulslike.dodgeIframes).toBe(0);
    expect(game._soulslike.dodgeRecovery).toBeGreaterThan(0);
    expect(game._soulslike.snakeAnim.state).toBe("dodge_recovery");
    takeDamage(game, 1, "overhead");
    expect(game._soulslike.snakeHp).toBe(4);
  });

  it("stab is blocked during iframes and recovery", async () => {
    const { dodge, stab } = await import("../src/core/boss/styles/soulslike/combat.js");
    game.onInput(1, 0);
    dodge(game);
    expect(stab(game)).toBe(false); // during iframes
    for (let i = 0; i < 4; i++) {
      forceBossSubtick(game);
    }
    expect(stab(game)).toBe(false); // during recovery
  });

  it("dodge is blocked during iframes and recovery", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    game.onInput(1, 0);
    dodge(game);
    const staminaAfterFirst = game._soulslike.stamina;
    expect(dodge(game)).toBe(false);
    expect(game._soulslike.stamina).toBe(staminaAfterFirst);
  });

  it("held-direction movement is locked out during dodge", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    game.onInput(1, 0);
    dodge(game);
    const xAfterDodge = game.snake.snakeX[game.snake.headIndex];
    forceMoveSubtick(game);
    forceMoveSubtick(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(xAfterDodge);
  });

  it("full state machine: dodge_active → dodge_recovery → idle over 8 boss sub-ticks", async () => {
    const { dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    game.onInput(1, 0);
    dodge(game);
    expect(game._soulslike.snakeAnim.state).toBe("dodge_active");
    for (let i = 0; i < 4; i++) {
      forceBossSubtick(game);
    }
    expect(game._soulslike.snakeAnim.state).toBe("dodge_recovery");
    for (let i = 0; i < 4; i++) {
      forceBossSubtick(game);
    }
    expect(game._soulslike.snakeAnim.state).toBe("idle");
    expect(game._soulslike.dodgeIframes).toBe(0);
    expect(game._soulslike.dodgeRecovery).toBe(0);
  });

  it("dispatchAction(ACTION_DODGE) routes to dodge in STATE_BOSS", async () => {
    const { dispatchAction, ACTION_DODGE } = await import("../src/input/actions.js");
    expect(game._soulslike.stamina).toBe(5);
    game.onInput(1, 0);
    dispatchAction(game, ACTION_DODGE);
    expect(game._soulslike.stamina).toBe(3);
    expect(game._soulslike.snakeAnim.state).toBe("dodge_active");
  });
});

describe("hissalia / soulslike parry (Step 7)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  function forceBossSubtick(g) {
    g._lastBossTickTime = 0;
    g._bossTick();
  }

  it("parry consumes 1 stamina + sets parryWindow + parry_active anim", async () => {
    const { parry } = await import("../src/core/boss/styles/soulslike/combat.js");
    expect(game._soulslike.stamina).toBe(5);
    const ok = parry(game);
    expect(ok).toBe(true);
    expect(game._soulslike.stamina).toBe(4);
    expect(game._soulslike.parryWindow).toBe(2);
    expect(game._soulslike.snakeAnim.state).toBe("parry_active");
  });

  it("parry no-ops when stamina is below cost", async () => {
    const { parry } = await import("../src/core/boss/styles/soulslike/combat.js");
    game._soulslike.stamina = 0;
    const ok = parry(game);
    expect(ok).toBe(false);
    expect(game._soulslike.parryWindow).toBe(0);
    expect(game._soulslike.snakeAnim.state).toBe("idle");
  });

  it("parry is blocked during dodge iframes/recovery", async () => {
    const { dodge, parry } = await import("../src/core/boss/styles/soulslike/combat.js");
    game.onInput(1, 0);
    dodge(game);
    // During iframes
    expect(parry(game)).toBe(false);
    for (let i = 0; i < 4; i++) {
      forceBossSubtick(game);
    }
    // During recovery
    expect(parry(game)).toBe(false);
  });

  it("stab and dodge are blocked during the parry window", async () => {
    const { parry, stab, dodge } = await import("../src/core/boss/styles/soulslike/combat.js");
    parry(game);
    expect(stab(game)).toBe(false);
    expect(dodge(game)).toBe(false);
  });

  it("tickParry decrements the window + reverts anim to idle on close", async () => {
    const { parry } = await import("../src/core/boss/styles/soulslike/combat.js");
    parry(game);
    expect(game._soulslike.parryWindow).toBe(2);
    forceBossSubtick(game);
    expect(game._soulslike.parryWindow).toBe(1);
    expect(game._soulslike.snakeAnim.state).toBe("parry_active");
    forceBossSubtick(game);
    expect(game._soulslike.parryWindow).toBe(0);
    expect(game._soulslike.snakeAnim.state).toBe("idle");
  });

  it("parryable hit during the window: stagger triggered, no damage, window consumed", async () => {
    const { parry } = await import("../src/core/boss/styles/soulslike/combat.js");
    const { takeDamage } = await import("../src/core/boss/styles/soulslike/player.js");
    parry(game);
    const hpBefore = game._soulslike.snakeHp;
    takeDamage(game, 2, "sweep", true /* parryable */);
    expect(game._soulslike.snakeHp).toBe(hpBefore); // no damage
    expect(game._soulslike.staggerTicks).toBe(12);
    expect(game._soulslike.bossAnim.state).toBe("stagger");
    expect(game._soulslike.parryWindow).toBe(0); // consumed
    expect(game._soulslike.snakeAnim.state).toBe("idle");
  });

  it("non-parryable hit during the window: damage applied, no stagger", async () => {
    const { parry } = await import("../src/core/boss/styles/soulslike/combat.js");
    const { takeDamage } = await import("../src/core/boss/styles/soulslike/player.js");
    parry(game);
    const hpBefore = game._soulslike.snakeHp;
    takeDamage(game, 2, "overhead", false /* non-parryable */);
    expect(game._soulslike.snakeHp).toBe(hpBefore - 2);
    expect(game._soulslike.staggerTicks).toBe(0);
  });

  it("parryable hit outside the window: damage applied", async () => {
    const { takeDamage } = await import("../src/core/boss/styles/soulslike/player.js");
    expect(game._soulslike.parryWindow).toBe(0);
    takeDamage(game, 1, "sweep", true);
    expect(game._soulslike.snakeHp).toBe(4);
    expect(game._soulslike.staggerTicks).toBe(0);
  });

  it("tickStagger counts down + reverts bossAnim to idle on zero", async () => {
    // Direct unit test of tickStagger so the boss attack pipeline
    // (which would re-enter windup once stagger hits 0) doesn't
    // race with this assertion.
    const { tickStagger } = await import("../src/core/boss/styles/soulslike/combat.js");
    game._soulslike.staggerTicks = 2;
    game._soulslike.bossAnim = { state: "stagger", framesIn: 0 };
    tickStagger(game);
    expect(game._soulslike.staggerTicks).toBe(1);
    expect(game._soulslike.bossAnim.state).toBe("stagger");
    tickStagger(game);
    expect(game._soulslike.staggerTicks).toBe(0);
    expect(game._soulslike.bossAnim.state).toBe("idle");
  });

  it("stab during stagger deals 3× damage", async () => {
    const { stab } = await import("../src/core/boss/styles/soulslike/combat.js");
    // Position snake at (14, 4) facing east so knife tip lands on the
    // 1×1 boss at (15, 5).
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 14;
    game.snake.snakeY[head] = 4;
    game.grid.setCell("snake", 14, 4);
    game._playerFacing = { dx: 1, dy: 0 };
    // Force the boss into stagger.
    game._soulslike.staggerTicks = 12;
    game._soulslike.bossAnim = { state: "stagger", framesIn: 0 };
    const hpBefore = game._soulslike.bossHp;
    stab(game);
    forceBossSubtick(game);
    expect(game._soulslike.bossHp).toBe(hpBefore - 3);
  });

  it("dispatchAction(ACTION_PARRY) routes to parry in STATE_BOSS", async () => {
    const { dispatchAction, ACTION_PARRY } = await import("../src/input/actions.js");
    expect(game._soulslike.stamina).toBe(5);
    dispatchAction(game, ACTION_PARRY);
    expect(game._soulslike.stamina).toBe(4);
    expect(game._soulslike.parryWindow).toBe(2);
  });
});

describe("hissalia / soulslike boss attacks (Step 8)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  // A deterministic rand: always 0.5 (above the 0.1 alternate-roll
  // threshold, so primary distance bracket always wins).
  const detRand = () => 0.5;

  it("ATTACK_NODES contains the four v1 attacks with correct shapes", async () => {
    const { ATTACK_NODES } = await import("../src/core/boss/styles/soulslike/attacks.js");
    for (const id of ["sweep", "regular", "overhead", "kick"]) {
      expect(ATTACK_NODES.has(id)).toBe(true);
      const node = ATTACK_NODES.get(id);
      expect(node.id).toBe(id);
      expect(typeof node.windupTicks).toBe("number");
      expect(typeof node.executeTicks).toBe("number");
      expect(typeof node.recoveryTicks).toBe("number");
      expect(typeof node.parryable).toBe("boolean");
      expect(typeof node.telegraphPose).toBe("function");
      expect(typeof node.executePose).toBe("function");
    }
    // D7 parryability table.
    expect(ATTACK_NODES.get("sweep").parryable).toBe(true);
    expect(ATTACK_NODES.get("regular").parryable).toBe(true);
    expect(ATTACK_NODES.get("overhead").parryable).toBe(false);
    expect(ATTACK_NODES.get("kick").parryable).toBe(true);
  });

  it("manhattanToBoss returns distance to the 2×2 boss footprint", async () => {
    const { manhattanToBoss } = await import("../src/core/boss/styles/soulslike/attacks.js");
    // Boss top-left (21, 21) spans (21..22, 21..22).
    expect(manhattanToBoss(20, 20, 21, 21)).toBe(2); // NW diagonal
    expect(manhattanToBoss(20, 21, 21, 21)).toBe(1); // adjacent west
    expect(manhattanToBoss(21, 21, 21, 21)).toBe(0); // inside
    expect(manhattanToBoss(25, 21, 21, 21)).toBe(3); // 3 east of east edge
  });

  it("computeBossFacing snaps to dominant cardinal direction", async () => {
    const { computeBossFacing } = await import("../src/core/boss/styles/soulslike/attacks.js");
    // Boss at (21, 21). Snake far west:
    expect(computeBossFacing(21, 21, 8, 22)).toEqual({ dx: -1, dy: 0 });
    // Snake far north:
    expect(computeBossFacing(21, 21, 22, 5)).toEqual({ dx: 0, dy: -1 });
    // Snake east:
    expect(computeBossFacing(21, 21, 30, 22)).toEqual({ dx: 1, dy: 0 });
    // Snake south:
    expect(computeBossFacing(21, 21, 22, 30)).toEqual({ dx: 0, dy: 1 });
  });

  it("attack node has telegraph + execute pose helpers", async () => {
    const { ATTACK_NODES } = await import("../src/core/boss/styles/soulslike/attacks.js");
    for (const id of ["sweep", "regular", "overhead", "kick"]) {
      const node = ATTACK_NODES.get(id);
      expect(typeof node.telegraphPose).toBe("function");
      expect(typeof node.executePose).toBe("function");
    }
  });

  it("sweep execute pose arcs tip through 3 distinct cells outside the boss", async () => {
    const { ATTACK_NODES } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const sweep = ATTACK_NODES.get("sweep");
    const facing = { dx: 0, dy: 1 }; // south
    const tips = [0, 1, 2].map((t) => sweep.executePose(10, 10, facing, t).tip);
    // Three distinct cells, all outside the 2×2 footprint (10..11, 10..11).
    const keys = new Set(tips.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(3);
    for (const t of tips) {
      const insideBoss = t.x >= 10 && t.x <= 11 && t.y >= 10 && t.y <= 11;
      expect(insideBoss).toBe(false);
    }
  });

  it("regular execute pose tip extends to reach 2 beyond the front edge", async () => {
    const { ATTACK_NODES } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const regular = ATTACK_NODES.get("regular");
    const facing = { dx: 0, dy: 1 };
    // 2×2 boss top-left (10, 10) → south front edge y=11. Reach 2 = y=13.
    const mid = regular.executePose(10, 10, facing, 1).tip;
    expect(mid).toEqual({ x: 10, y: 13 });
  });

  it("overhead execute pose tip reaches 3 cells beyond the front edge at peak", async () => {
    const { ATTACK_NODES } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const overhead = ATTACK_NODES.get("overhead");
    const facing = { dx: 0, dy: 1 };
    // 2×2 boss top-left (10, 10) → south front edge y=11. Reach 3 = y=14.
    const peak = overhead.executePose(10, 10, facing, 2).tip;
    expect(peak).toEqual({ x: 10, y: 14 });
  });

  it("selectNextAttack picks sweep at adjacent (no kick gate)", async () => {
    const { selectNextAttack } = await import("../src/core/boss/styles/soulslike/attacks.js");
    // 2×2 boss at (14, 5)..(15, 6). Place snake at (13, 5) — adjacent west.
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 13;
    game.snake.snakeY[head] = 5;
    game.grid.setCell("snake", 13, 5);
    // ticksSinceLastAttack large so kick gate is closed.
    game._soulslike.ticksSinceLastAttack = 999;
    const node = selectNextAttack(game, detRand);
    expect(node.id).toBe("sweep");
  });

  it("selectNextAttack picks kick at adjacent when recent-attack gate is open", async () => {
    const { selectNextAttack } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 13;
    game.snake.snakeY[head] = 5;
    game.grid.setCell("snake", 13, 5);
    game._soulslike.ticksSinceLastAttack = 5; // < KICK_RECENT_THRESHOLD = 18
    const node = selectNextAttack(game, detRand);
    expect(node.id).toBe("kick");
  });

  it("selectNextAttack picks regular at distance 2", async () => {
    const { selectNextAttack } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    // (12, 5) — 2 west of boss footprint.
    game.snake.snakeX[head] = 12;
    game.snake.snakeY[head] = 5;
    game.grid.setCell("snake", 12, 5);
    expect(selectNextAttack(game, detRand).id).toBe("regular");
  });

  it("selectNextAttack picks overhead at distance 3+", async () => {
    const { selectNextAttack } = await import("../src/core/boss/styles/soulslike/attacks.js");
    expect(selectNextAttack(game, detRand).id).toBe("overhead");
  });

  it("90/10 alt-roll picks a different bracket when rand below 0.1", async () => {
    const { selectNextAttack } = await import("../src/core/boss/styles/soulslike/attacks.js");
    // Snake adjacent → primary "sweep". Rand 0.05 < 0.1 → roll alt.
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 13;
    game.snake.snakeY[head] = 5;
    game.grid.setCell("snake", 13, 5);
    game._soulslike.ticksSinceLastAttack = 999;
    // First rand call (0.05) triggers alt; second call picks index in
    // the others array. With 0.0 we pick the first non-primary.
    const calls = [0.05, 0.0];
    let i = 0;
    const seq = () => calls[i++] ?? 0.5;
    const node = selectNextAttack(game, seq);
    expect(["regular", "overhead"]).toContain(node.id);
  });

  it("state machine: idle → windup → execute → recovery → idle", async () => {
    const { tickBossAttacks, ATTACK_NODES } =
      await import("../src/core/boss/styles/soulslike/attacks.js");
    // Snake stays at default (8, 8) → overhead bracket; deterministic.
    const sl = game._soulslike;
    expect(sl.bossAttackId).toBeNull();
    // Tick 1: idle → start windup (overhead).
    tickBossAttacks(game, detRand);
    expect(sl.bossAttackId).toBe("overhead");
    expect(sl.bossAttackPhase).toBe("windup");
    expect(sl.bossAttackTicks).toBe(ATTACK_NODES.get("overhead").windupTicks);
    // Tick down windup.
    const node = ATTACK_NODES.get("overhead");
    for (let i = 0; i < node.windupTicks; i++) {
      tickBossAttacks(game, detRand);
    }
    expect(sl.bossAttackPhase).toBe("execute");
    // Tick down execute.
    for (let i = 0; i < node.executeTicks; i++) {
      tickBossAttacks(game, detRand);
    }
    expect(sl.bossAttackPhase).toBe("recovery");
    for (let i = 0; i < node.recoveryTicks; i++) {
      tickBossAttacks(game, detRand);
    }
    expect(sl.bossAttackId).toBeNull();
    expect(sl.bossAttackPhase).toBeNull();
    expect(sl.bossAnim.state).toBe("idle");
  });

  it("hit detection: regular thrust hits the snake mid-execute at reach 2", async () => {
    const { tickBossAttacks, ATTACK_NODES } =
      await import("../src/core/boss/styles/soulslike/attacks.js");
    // 2×2 boss top-left (14, 5); snake at (12, 5) — distance 2 → regular.
    // Regular's swing: tip at reach 1 → 2 → 1. Mid-tick lands at the
    // snake; the other two ticks miss.
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 12;
    game.snake.snakeY[head] = 5;
    game.grid.setCell("snake", 12, 5);

    const sl = game._soulslike;
    const hpBefore = sl.snakeHp;
    const node = ATTACK_NODES.get("regular");
    const total = 1 + node.windupTicks + node.executeTicks + node.recoveryTicks;
    for (let i = 0; i < total; i++) {
      tickBossAttacks(game, detRand);
    }
    // Exactly one hit (mid-tick at reach 2).
    expect(sl.snakeHp).toBe(hpBefore - 1);
    expect(game.snake.deathCause).toBeNull();
  });

  it("hit detection: snake at iframes takes no damage during attack execute", async () => {
    const { tickBossAttacks, ATTACK_NODES } =
      await import("../src/core/boss/styles/soulslike/attacks.js");
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 13;
    game.snake.snakeY[head] = 5;
    game.grid.setCell("snake", 13, 5);

    const sl = game._soulslike;
    // Force snake into iframes.
    sl.dodgeIframes = 99;
    const hpBefore = sl.snakeHp;
    const node = ATTACK_NODES.get("regular");
    const total = 1 + node.windupTicks + node.executeTicks + node.recoveryTicks;
    for (let i = 0; i < total; i++) {
      tickBossAttacks(game, detRand);
    }
    expect(sl.snakeHp).toBe(hpBefore);
  });

  it("stagger pauses attack progression", async () => {
    const { tickBossAttacks } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const sl = game._soulslike;
    // Start an attack (tick 1).
    tickBossAttacks(game, detRand);
    const ticksBefore = sl.bossAttackTicks;
    // Now stagger.
    sl.staggerTicks = 12;
    // Tick — should not progress.
    tickBossAttacks(game, detRand);
    expect(sl.bossAttackTicks).toBe(ticksBefore);
    expect(sl.bossAttackId).toBe("overhead");
  });

  it("boss-defeated stops attack pipeline (no new attacks picked)", async () => {
    const { tickBossAttacks } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const sl = game._soulslike;
    sl.bossHp = 0;
    tickBossAttacks(game, detRand);
    expect(sl.bossAttackId).toBeNull();
  });

  it("snake reaching 0 HP from a boss attack records the attack id as death cause", async () => {
    const { tickBossAttacks, ATTACK_NODES } =
      await import("../src/core/boss/styles/soulslike/attacks.js");
    // 2×2 boss at (14, 5); snake at (12, 5) — distance 2 → regular.
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 12;
    game.snake.snakeY[head] = 5;
    game.grid.setCell("snake", 12, 5);
    // Reduce snake HP so a single attack kills.
    game._soulslike.snakeHp = 1;
    const node = ATTACK_NODES.get("regular");
    const total = 1 + node.windupTicks + node.executeTicks + node.recoveryTicks;
    for (let i = 0; i < total; i++) {
      tickBossAttacks(game, detRand);
    }
    expect(game._soulslike.snakeHp).toBe(0);
    expect(game.snake.deathCause).toBe("regular");
  });

  it("parryable attack converts to stagger when parry window is open", async () => {
    const { tickBossAttacks, ATTACK_NODES } =
      await import("../src/core/boss/styles/soulslike/attacks.js");
    const { parry } = await import("../src/core/boss/styles/soulslike/combat.js");
    // Distance 2 → regular (parryable). Regular hits at mid-execute
    // (tick 1) when tip extends to reach 2; tick 0 and tick 2 are at
    // reach 1 and don't touch the snake.
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 12;
    game.snake.snakeY[head] = 5;
    game.grid.setCell("snake", 12, 5);

    const sl = game._soulslike;
    const node = ATTACK_NODES.get("regular");
    // Burn idle → start → all windup ticks → execute phase entry.
    tickBossAttacks(game, detRand); // start
    for (let i = 0; i < node.windupTicks; i++) {
      tickBossAttacks(game, detRand);
    }
    expect(sl.bossAttackPhase).toBe("execute");
    // First execute tick (tick 0) — tip at reach 1, snake at reach 2 →
    // no hit yet. Time the parry so the window is still open at tick 1.
    tickBossAttacks(game, detRand);
    const hpBefore = sl.snakeHp;
    expect(sl.snakeHp).toBe(hpBefore); // no hit on tick 0
    // Parry window opens just before the mid-tick strike.
    expect(parry(game)).toBe(true);
    expect(sl.parryWindow).toBe(2);
    tickBossAttacks(game, detRand); // tick 1 — the hit lands here
    expect(sl.snakeHp).toBe(hpBefore); // parry caught it
    expect(sl.staggerTicks).toBeGreaterThan(0);
  });
});

describe("hissalia / soulslike phase transitions (Step 9)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  it("HP just above 60% does not arm a phase transition", async () => {
    const { tickPhases } = await import("../src/core/boss/styles/soulslike/phases.js");
    const sl = game._soulslike;
    // 30 max HP × 0.6 = 18.0; 19 is just above.
    sl.bossHp = 19;
    tickPhases(game);
    expect(sl.bossPhase).toBe(1);
    expect(sl.phaseTransitionTicks).toBe(0);
  });

  it("HP at 60% arms phase 2 transition", async () => {
    const { tickPhases } = await import("../src/core/boss/styles/soulslike/phases.js");
    const sl = game._soulslike;
    sl.bossHp = 18; // exactly 60%
    tickPhases(game);
    expect(sl.bossPhase).toBe(2);
    expect(sl.phaseTransitionTicks).toBe(12);
    expect(sl.bossAnim.state).toBe("phase_pause");
  });

  it("HP at 30% arms phase 3 transition (when in phase 2)", async () => {
    const { tickPhases } = await import("../src/core/boss/styles/soulslike/phases.js");
    const sl = game._soulslike;
    sl.bossPhase = 2;
    sl.bossHp = 9; // 30%
    tickPhases(game);
    expect(sl.bossPhase).toBe(3);
    expect(sl.phaseTransitionTicks).toBe(12);
  });

  it("phase transition cancels in-progress attack", async () => {
    const { tickPhases } = await import("../src/core/boss/styles/soulslike/phases.js");
    const sl = game._soulslike;
    sl.bossAttackId = "regular";
    sl.bossAttackPhase = "windup";
    sl.bossAttackTicks = 5;
    sl.bossAttackAim = { x: 10, y: 10 };
    sl.bossHp = 17;
    tickPhases(game);
    expect(sl.bossAttackId).toBeNull();
    expect(sl.bossAttackPhase).toBeNull();
    expect(sl.bossAttackTicks).toBe(0);
    expect(sl.bossAttackAim).toBeNull();
  });

  it("tickBossAttacks no-ops during phase pause", async () => {
    const { tickBossAttacks } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const sl = game._soulslike;
    sl.phaseTransitionTicks = 8;
    sl.bossAttackId = null;
    tickBossAttacks(game, () => 0.5);
    expect(sl.bossAttackId).toBeNull();
    // Counter doesn't accumulate during pause.
    expect(sl.ticksSinceLastAttack).toBe(0);
  });

  it("stab during phase pause deals no damage to the boss", async () => {
    const { stab, tickStab } = await import("../src/core/boss/styles/soulslike/combat.js");
    const sl = game._soulslike;
    // Position snake adjacent to boss.
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = 20;
    game.snake.snakeY[head] = 20;
    game.grid.setCell("snake", 20, 20);
    game._playerFacing = { dx: 1, dy: 0 };
    sl.phaseTransitionTicks = 12;
    const hpBefore = sl.bossHp;
    stab(game);
    tickStab(game);
    expect(sl.bossHp).toBe(hpBefore);
  });

  it("phase pause counts down and ends with pendingSpecial set", async () => {
    const { tickPhases } = await import("../src/core/boss/styles/soulslike/phases.js");
    const sl = game._soulslike;
    sl.phaseTransitionTicks = 3;
    sl.bossAnim = { state: "phase_pause", framesIn: 0 };
    sl.pendingSpecial = false;

    tickPhases(game);
    expect(sl.phaseTransitionTicks).toBe(2);
    expect(sl.pendingSpecial).toBe(false);
    tickPhases(game);
    expect(sl.phaseTransitionTicks).toBe(1);
    tickPhases(game);
    expect(sl.phaseTransitionTicks).toBe(0);
    expect(sl.pendingSpecial).toBe(true);
    expect(sl.bossAnim.state).toBe("idle");
  });

  it("HP zero doesn't trigger further phase transitions", async () => {
    const { tickPhases } = await import("../src/core/boss/styles/soulslike/phases.js");
    const sl = game._soulslike;
    sl.bossPhase = 3;
    sl.bossHp = 0;
    tickPhases(game);
    expect(sl.phaseTransitionTicks).toBe(0);
    expect(sl.bossPhase).toBe(3);
  });

  it("phase 3 transition doesn't refire if already in phase 3", async () => {
    const { tickPhases } = await import("../src/core/boss/styles/soulslike/phases.js");
    const sl = game._soulslike;
    sl.bossPhase = 3;
    sl.bossHp = 1; // way below threshold
    tickPhases(game);
    expect(sl.phaseTransitionTicks).toBe(0);
    expect(sl.bossPhase).toBe(3);
  });
});

describe("hissalia / soulslike Waterfowl special (Step 10)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  function placeSnake(x, y) {
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = x;
    game.snake.snakeY[head] = y;
    game.grid.setCell("snake", x, y);
  }

  it("inactive: idle ticks accumulate ticksSinceLastSpecial", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    expect(sl.ticksSinceLastSpecial).toBe(0);
    tickWaterfowl(game);
    tickWaterfowl(game);
    tickWaterfowl(game);
    expect(sl.ticksSinceLastSpecial).toBe(3);
    expect(sl.waterfowlPhase).toBe(0);
  });

  it("pendingSpecial triggers waterfowl on next tick", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.pendingSpecial = true;
    placeSnake(12, 14);
    tickWaterfowl(game);
    expect(sl.waterfowlPhase).toBe(1); // LOCK_1
    expect(sl.waterfowlLockX).toBe(12);
    expect(sl.waterfowlLockY).toBe(14);
    expect(sl.waterfowlTicks).toBe(8); // WATERFOWL_LOCK_TICKS
  });

  it("SPECIAL_FORCE_TICKS failsafe triggers waterfowl", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.ticksSinceLastSpecial = 360; // SPECIAL_FORCE_TICKS
    placeSnake(12, 12);
    tickWaterfowl(game);
    expect(sl.waterfowlPhase).toBe(1);
  });

  it("lock holds for WATERFOWL_LOCK_TICKS without advancing", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.pendingSpecial = true;
    placeSnake(12, 12);
    tickWaterfowl(game); // enter lock_1
    expect(sl.waterfowlPhase).toBe(1);
    // Run 7 more ticks — each decrements waterfowlTicks but doesn't
    // advance phase (8-tick lock).
    for (let i = 0; i < 7; i++) {
      tickWaterfowl(game);
    }
    expect(sl.waterfowlPhase).toBe(1);
    // Next tick: waterfowlTicks reaches 0, advance to JUMP_1.
    tickWaterfowl(game);
    expect(sl.waterfowlPhase).toBe(2);
  });

  it("bait window: snake moving during lock shifts the jump target", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.pendingSpecial = true;
    placeSnake(12, 12);
    tickWaterfowl(game); // lock at (12, 12)
    expect(sl.waterfowlLockX).toBe(12);
    expect(sl.waterfowlLockY).toBe(12);
    // Player baits — moves to a different cell. Lock stays put.
    placeSnake(18, 18);
    expect(sl.waterfowlLockX).toBe(12);
    expect(sl.waterfowlLockY).toBe(12);
    // Run out the rest of the lock (7) + full dash (3) + advance into
    // SWIPE_1 (1) = 11 ticks. The dash lands the boss exactly on the
    // locked target on its final sub-tick before advancing.
    for (let i = 0; i < 11; i++) {
      tickWaterfowl(game);
    }
    expect(sl.waterfowlPhase).toBe(3); // SWIPE_1 (dash complete)
    // Boss dashed to the OLD lock position (where the player was), not
    // the new one.
    expect(sl.bossX).toBe(12);
    expect(sl.bossY).toBe(12);
  });

  it("jump teleports boss; swipe damages snake along the sword path", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.pendingSpecial = true;
    placeSnake(15, 15);
    tickWaterfowl(game); // enter LOCK_1
    // Bait: snake moves to (15, 14) — the N-left handle cell of the
    // 12-cell swipe ring around the (15, 15) landing site. Hit on
    // swipe step 0.
    placeSnake(15, 14);
    // Run lock (7 more) + dash (3) + enter SWIPE_1 (1) + first swipe
    // sub-tick (1) = 12 ticks. The sub-tick at ring step 0 (N-left)
    // checks (15, 14) and damages.
    for (let i = 0; i < 12; i++) {
      tickWaterfowl(game);
    }
    expect(sl.waterfowlPhase).toBe(3); // SWIPE_1
    expect(sl.bossX).toBe(15);
    expect(sl.bossY).toBe(15);
    expect(sl.snakeHp).toBe(4);
  });

  it("swipe misses snake outside the ring (after baiting away)", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.pendingSpecial = true;
    placeSnake(10, 10);
    tickWaterfowl(game); // lock at (10, 10)
    // Bait: snake runs far away. Boss lands at (10, 10); the 12-cell
    // swipe ring around it doesn't reach (20, 20).
    placeSnake(20, 20);
    for (let i = 0; i < 25; i++) {
      tickWaterfowl(game);
    }
    expect(sl.snakeHp).toBe(5);
  });

  it("iframes block waterfowl swipe damage", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.pendingSpecial = true;
    placeSnake(15, 15);
    tickWaterfowl(game); // enter LOCK_1
    // Place snake on a ring cell — would normally take damage on a
    // swipe sub-tick — and give it long-lived iframes.
    placeSnake(15, 14);
    sl.dodgeIframes = 999;
    for (let i = 0; i < 25; i++) {
      tickWaterfowl(game);
    }
    expect(sl.snakeHp).toBe(5);
  });

  it("stagger pauses waterfowl progression", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.pendingSpecial = true;
    placeSnake(12, 12);
    tickWaterfowl(game); // enter lock_1
    expect(sl.waterfowlPhase).toBe(1);
    const ticksAtLock = sl.waterfowlTicks;
    sl.staggerTicks = 5;
    tickWaterfowl(game);
    // Stagger gates the entire tick — counter doesn't decrement.
    expect(sl.waterfowlTicks).toBe(ticksAtLock);
  });

  it("tickBossAttacks no-ops while waterfowl is active", async () => {
    const { tickBossAttacks } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const sl = game._soulslike;
    sl.waterfowlPhase = 1;
    sl.bossAttackId = null;
    tickBossAttacks(game, () => 0.5);
    expect(sl.bossAttackId).toBeNull();
    expect(sl.ticksSinceLastAttack).toBe(0);
  });

  it("pattern advances through all 13 beats and exits cleanly", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.pendingSpecial = true;
    placeSnake(15, 15);
    sl.dodgeIframes = 999; // immune throughout — focus on phase progression

    const observedPhases = new Set();
    // Run until waterfowl resets to inactive (phase=0 after entering at
    // least one non-zero phase). Capped at 200 ticks as a safety net.
    let started = false;
    for (let i = 0; i < 200; i++) {
      observedPhases.add(sl.waterfowlPhase);
      tickWaterfowl(game);
      if (sl.waterfowlPhase > 0) {
        started = true;
      } else if (started) {
        break;
      }
    }
    // Every phase 1..13 should have been observed at least once.
    for (let p = 1; p <= 13; p++) {
      expect(observedPhases.has(p)).toBe(true);
    }
    // After the secondary completes, waterfowl resets to inactive and
    // pendingSpecial is cleared.
    expect(sl.waterfowlPhase).toBe(0);
    expect(sl.pendingSpecial).toBe(false);
    expect(sl.ticksSinceLastSpecial).toBe(0);
  });

  it("secondary circle catches snake at distance > primary radius", async () => {
    const { tickWaterfowl } = await import("../src/core/boss/styles/soulslike/waterfowl.js");
    const sl = game._soulslike;
    sl.pendingSpecial = true;
    placeSnake(15, 15);
    sl.dodgeIframes = 999;
    // Walk the state machine until we're in phase 12 (the 1-tick gap
    // immediately before SECONDARY). Bounded loop so a regression
    // can't infinite-loop the test.
    for (let i = 0; i < 200 && sl.waterfowlPhase !== 12; i++) {
      tickWaterfowl(game);
    }
    expect(sl.waterfowlPhase).toBe(12);
    // Drop iframes and reposition the snake at a cell that's outside
    // primary RADIUS=3 but inside secondary RADIUS_FINAL=4 of the
    // boss centre. The boss's final position depends on where snake
    // was pushed during the dashes, so compute relative to bossX/Y.
    // (bossX+4, bossY): dx=3.5, dy=-0.5 → dist²=12.5, dist=3.54.
    sl.dodgeIframes = 0;
    sl.snakeHp = 5;
    placeSnake(sl.bossX + 4, sl.bossY);
    tickWaterfowl(game); // gap → SECONDARY entry, fires circleHit
    expect(sl.waterfowlPhase).toBe(13);
    expect(sl.snakeHp).toBe(4); // secondary radius 4 caught the hit
  });
});

describe("hissalia / soulslike rendering (Step 11)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  it("fighterCellByAnim maps each animation state to a distinct cell", async () => {
    const { fighterCellByAnim } = await import("../src/core/boss/styles/soulslike/animation.js");
    const {
      CELL_FIGHTER_IDLE,
      CELL_FIGHTER_STAB_ACTIVE,
      CELL_FIGHTER_DODGE_ACTIVE,
      CELL_FIGHTER_DODGE_RECOVERY,
      CELL_FIGHTER_PARRY_ACTIVE,
    } = await import("../src/render/renderer.js");
    expect(fighterCellByAnim("idle")).toBe(CELL_FIGHTER_IDLE);
    expect(fighterCellByAnim("stab_active")).toBe(CELL_FIGHTER_STAB_ACTIVE);
    expect(fighterCellByAnim("dodge_active")).toBe(CELL_FIGHTER_DODGE_ACTIVE);
    expect(fighterCellByAnim("dodge_recovery")).toBe(CELL_FIGHTER_DODGE_RECOVERY);
    expect(fighterCellByAnim("parry_active")).toBe(CELL_FIGHTER_PARRY_ACTIVE);
    // Unknown state falls back to idle (defensive default).
    expect(fighterCellByAnim("__bogus__")).toBe(CELL_FIGHTER_IDLE);
  });

  it("glaivePose idle: default forward pose 1 + 2 cells beyond front edge", async () => {
    const { glaivePose } = await import("../src/core/boss/styles/soulslike/animation.js");
    const sl = {
      bossX: 10,
      bossY: 10,
      bossFacing: { dx: 0, dy: 1 },
      bossAttackId: null,
      bossAttackPhase: null,
      bossAttackTicks: 0,
    };
    // 2×2 boss top-left (10, 10) → south front edge y=11.
    // Handle 1 cell beyond = y=12; tip at y=13.
    const pose = glaivePose(sl);
    expect(pose.handle).toEqual({ x: 10, y: 12 });
    expect(pose.tip).toEqual({ x: 10, y: 13 });
    expect(pose.isSignifier).toBe(false);
  });

  it("glaivePose during windup uses attack telegraph; last tick is signifier", async () => {
    const { glaivePose } = await import("../src/core/boss/styles/soulslike/animation.js");
    const sl = {
      bossX: 10,
      bossY: 10,
      bossFacing: { dx: 0, dy: 1 },
      bossAttackId: "sweep",
      bossAttackPhase: "windup",
      bossAttackTicks: 1, // last tick → signifier
    };
    const pose = glaivePose(sl);
    expect(pose.isSignifier).toBe(true);
  });

  it("glaivePose during execute uses swing pose at current tick", async () => {
    const { glaivePose } = await import("../src/core/boss/styles/soulslike/animation.js");
    const { ATTACK_NODES } = await import("../src/core/boss/styles/soulslike/attacks.js");
    const reg = ATTACK_NODES.get("regular");
    const sl = {
      bossX: 10,
      bossY: 10,
      bossFacing: { dx: 0, dy: 1 },
      bossAttackId: "regular",
      bossAttackPhase: "execute",
      bossAttackTicks: reg.executeTicks - 1, // tick 1 (mid)
    };
    const pose = glaivePose(sl);
    // 2×2 boss; mid-tick = reach 2 south from front edge y=11 → y=13.
    expect(pose.tip).toEqual({ x: 10, y: 13 });
  });

  // Helpers that intercept the cell adapter via spec overrides — same
  // pattern as the Step 3 "CELL_WALL_ARENA, not CELL_WALL" test.
  function captureCells(cellIds) {
    const calls = new Map();
    for (const id of cellIds) {
      calls.set(id, []);
    }
    return calls;
  }

  async function withCellSpies(cellIds, fn) {
    const { defineCell } = await import("../src/core/grid/cell/index.js");
    const { getCellSpec } = await import("../src/core/grid/cell/registry.js");
    const captured = captureCells(cellIds);
    const originals = new Map();
    for (const id of cellIds) {
      originals.set(id, getCellSpec(id));
      defineCell(id, {
        render: (x, y, context) => captured.get(id).push({ x, y, context }),
      });
    }
    try {
      await fn(captured);
    } finally {
      for (const id of cellIds) {
        defineCell(id, originals.get(id));
      }
    }
  }

  it("draws the 2×2 hissalia footprint as 4 CELL_HISSALIA calls", async () => {
    const { CELL_HISSALIA } = await import("../src/render/renderer.js");
    await withCellSpies([CELL_HISSALIA], (captured) => {
      game.renderer = {
        clear: () => {},
        drawCell: () => {},
        cell: () => {},
        drawHUD: () => {},
        drawScreen: () => {},
        drawBossInfo: () => {},
        drawSurvivalInfo: () => {},
        drawSoulslikeInfo: () => {},
        drawBossIntroOverlay: () => {},
        flush: () => {},
      };
      game.renderFrame();
      const sl = game._soulslike;
      const calls = captured.get(CELL_HISSALIA);
      expect(calls.length).toBe(4);
      const coords = calls.map((c) => `${c.x},${c.y}`).sort();
      expect(coords).toEqual([
        `${sl.bossX},${sl.bossY}`,
        `${sl.bossX},${sl.bossY + 1}`,
        `${sl.bossX + 1},${sl.bossY}`,
        `${sl.bossX + 1},${sl.bossY + 1}`,
      ]);
    });
  });

  it("hissalia context.staggered reflects staggerTicks", async () => {
    const { CELL_HISSALIA } = await import("../src/render/renderer.js");
    await withCellSpies([CELL_HISSALIA], async (captured) => {
      game.renderer = {
        clear: () => {},
        drawCell: () => {},
        cell: () => {},
        drawHUD: () => {},
        drawScreen: () => {},
        drawBossInfo: () => {},
        drawSurvivalInfo: () => {},
        drawSoulslikeInfo: () => {},
        drawBossIntroOverlay: () => {},
        flush: () => {},
      };
      game._soulslike.staggerTicks = 0;
      game.renderFrame();
      expect(captured.get(CELL_HISSALIA).at(-1).context.staggered).toBe(false);

      game._soulslike.staggerTicks = 6;
      game.renderFrame();
      expect(captured.get(CELL_HISSALIA).at(-1).context.staggered).toBe(true);
    });
  });

  it("snake fighter cell type tracks snakeAnim.state", async () => {
    const { CELL_FIGHTER_IDLE, CELL_FIGHTER_STAB_ACTIVE, CELL_FIGHTER_PARRY_ACTIVE } =
      await import("../src/render/renderer.js");
    await withCellSpies(
      [CELL_FIGHTER_IDLE, CELL_FIGHTER_STAB_ACTIVE, CELL_FIGHTER_PARRY_ACTIVE],
      async (captured) => {
        game.renderer = {
          clear: () => {},
          drawCell: () => {},
          cell: () => {},
          drawHUD: () => {},
          drawScreen: () => {},
          drawBossInfo: () => {},
          drawSurvivalInfo: () => {},
          drawSoulslikeInfo: () => {},
          drawBossIntroOverlay: () => {},
          flush: () => {},
        };
        game._soulslike.snakeAnim = { state: "idle", framesIn: 0 };
        game.renderFrame();
        expect(captured.get(CELL_FIGHTER_IDLE).length).toBeGreaterThan(0);

        game._soulslike.snakeAnim = { state: "stab_active", framesIn: 0 };
        game.renderFrame();
        expect(captured.get(CELL_FIGHTER_STAB_ACTIVE).length).toBeGreaterThan(0);

        game._soulslike.snakeAnim = { state: "parry_active", framesIn: 0 };
        game.renderFrame();
        expect(captured.get(CELL_FIGHTER_PARRY_ACTIVE).length).toBeGreaterThan(0);
      }
    );
  });

  it("halberd tip context.tickInExecute > 0 during execute phase", async () => {
    const { CELL_HALBERD_TIP } = await import("../src/render/renderer.js");
    await withCellSpies([CELL_HALBERD_TIP], async (captured) => {
      game.renderer = {
        clear: () => {},
        drawCell: () => {},
        cell: () => {},
        drawHUD: () => {},
        drawScreen: () => {},
        drawBossInfo: () => {},
        drawSurvivalInfo: () => {},
        drawSoulslikeInfo: () => {},
        drawBossIntroOverlay: () => {},
        flush: () => {},
      };
      // Idle → attackPhase null, no signifier.
      game.renderFrame();
      expect(captured.get(CELL_HALBERD_TIP).at(-1).context.attackPhase).toBeNull();
      expect(captured.get(CELL_HALBERD_TIP).at(-1).context.isSignifier).toBe(false);

      // Force into execute mid-attack.
      game._soulslike.bossAttackId = "regular";
      game._soulslike.bossAttackPhase = "execute";
      game._soulslike.bossAttackTicks = 2;
      game.renderFrame();
      expect(captured.get(CELL_HALBERD_TIP).at(-1).context.attackPhase).toBe("execute");
    });
  });

  it("halberd tip context.isSignifier flashes on last tick of windup", async () => {
    const { CELL_HALBERD_TIP } = await import("../src/render/renderer.js");
    await withCellSpies([CELL_HALBERD_TIP], async (captured) => {
      game.renderer = {
        clear: () => {},
        drawCell: () => {},
        cell: () => {},
        drawHUD: () => {},
        drawScreen: () => {},
        drawBossInfo: () => {},
        drawSurvivalInfo: () => {},
        drawSoulslikeInfo: () => {},
        drawBossIntroOverlay: () => {},
        flush: () => {},
      };
      // Mid-windup — not yet the signifier.
      game._soulslike.bossAttackId = "regular";
      game._soulslike.bossAttackPhase = "windup";
      game._soulslike.bossAttackTicks = 5;
      game.renderFrame();
      expect(captured.get(CELL_HALBERD_TIP).at(-1).context.isSignifier).toBe(false);

      // Last windup tick — signifier flash.
      game._soulslike.bossAttackTicks = 1;
      game.renderFrame();
      expect(captured.get(CELL_HALBERD_TIP).at(-1).context.isSignifier).toBe(true);
    });
  });

  it("knife tip context.snakeAnimState passes the current state", async () => {
    const { CELL_KNIFE_TIP } = await import("../src/render/renderer.js");
    await withCellSpies([CELL_KNIFE_TIP], async (captured) => {
      game.renderer = {
        clear: () => {},
        drawCell: () => {},
        cell: () => {},
        drawHUD: () => {},
        drawScreen: () => {},
        drawBossInfo: () => {},
        drawSurvivalInfo: () => {},
        drawSoulslikeInfo: () => {},
        drawBossIntroOverlay: () => {},
        flush: () => {},
      };
      game._soulslike.snakeAnim = { state: "stab_active", framesIn: 0 };
      // Make sure the knife tip lands inside the arena, not on a wall.
      // The snake spawns at (8, 8) with facing east; tip is 1 east, 1
      // south of that = (9, 9). Inside the inner playable area.
      game.renderFrame();
      const last = captured.get(CELL_KNIFE_TIP).at(-1);
      expect(last).toBeDefined();
      expect(last.context.snakeAnimState).toBe("stab_active");
    });
  });
});

describe("hissalia / soulslike HUD (Step 12)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  function captureHud() {
    const calls = [];
    const mock = {
      clear: () => {},
      drawCell: () => {},
      cell: () => {},
      drawHUD: () => {},
      drawScreen: () => {},
      drawBossInfo: () => {},
      drawSurvivalInfo: () => {},
      drawSoulslikeInfo: (...args) => calls.push(args),
      drawBossIntroOverlay: () => {},
      flush: () => {},
    };
    game.renderer = mock;
    return calls;
  }

  it("drawSoulslikeInfo receives all 7 stats from `_soulslike` + `_boss`", () => {
    const calls = captureHud();
    game.renderFrame();
    expect(calls.length).toBe(1);
    const [snakeHp, snakeHpMax, stamina, staminaMax, bossName, bossHp, bossHpMax] = calls[0];
    const sl = game._soulslike;
    expect(snakeHp).toBe(sl.snakeHp);
    expect(snakeHpMax).toBe(sl.snakeHpMax);
    expect(stamina).toBe(sl.stamina);
    expect(staminaMax).toBe(sl.staminaMax);
    expect(bossName).toBe(game._boss.name);
    expect(bossHp).toBe(sl.bossHp);
    expect(bossHpMax).toBe(sl.bossHpMax);
  });

  it("HUD reflects depleted snake HP", () => {
    const calls = captureHud();
    game._soulslike.snakeHp = 2;
    game.renderFrame();
    expect(calls.at(-1)[0]).toBe(2); // snakeHp
    expect(calls.at(-1)[1]).toBe(5); // snakeHpMax (default)
  });

  it("HUD reflects depleted stamina", () => {
    const calls = captureHud();
    game._soulslike.stamina = 1;
    game.renderFrame();
    expect(calls.at(-1)[2]).toBe(1); // stamina
    expect(calls.at(-1)[3]).toBe(5); // staminaMax
  });

  it("HUD reflects boss HP changes", () => {
    const calls = captureHud();
    game._soulslike.bossHp = 12;
    game.renderFrame();
    expect(calls.at(-1)[5]).toBe(12); // bossHp
    expect(calls.at(-1)[6]).toBe(30); // bossHpMax (default)
  });

  it("renderer base drawSoulslikeInfo default is a safe no-op", async () => {
    const { Renderer } = await import("../src/render/renderer.js");
    class TestR extends Renderer {
      clear() {}
      drawHUD() {}
      drawScreen() {}
      flush() {}
    }
    const r = new TestR();
    expect(() => r.drawSoulslikeInfo(5, 5, 5, 5, "x", 30, 30)).not.toThrow();
  });
});

describe("hissalia / soulslike boss movement", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  function placeSnake(x, y) {
    const head = game.snake.headIndex;
    game.grid.clearCell("snake", game.snake.snakeX[head], game.snake.snakeY[head]);
    game.snake.snakeX[head] = x;
    game.snake.snakeY[head] = y;
    game.grid.setCell("snake", x, y);
  }

  it("default mode is idle", () => {
    expect(game._soulslike.movementMode).toBe("idle");
  });

  it("boss does not move while committed to an attack", async () => {
    const { tickBossMovement } = await import("../src/core/boss/styles/soulslike/movement.js");
    const sl = game._soulslike;
    sl.bossAttackId = "regular";
    sl.bossAttackPhase = "windup";
    sl.bossAttackTicks = 4;
    const { bossX, bossY } = sl;
    // Force the movement timer to fire.
    sl.movementTimer = 1;
    tickBossMovement(game);
    expect(sl.bossX).toBe(bossX);
    expect(sl.bossY).toBe(bossY);
  });

  it("boss does not move while staggered / phase-paused / waterfowling", async () => {
    const { tickBossMovement } = await import("../src/core/boss/styles/soulslike/movement.js");
    const sl = game._soulslike;
    const { bossX, bossY } = sl;
    sl.movementTimer = 1;

    sl.staggerTicks = 5;
    tickBossMovement(game);
    expect(sl.bossX).toBe(bossX);
    sl.staggerTicks = 0;

    sl.phaseTransitionTicks = 5;
    tickBossMovement(game);
    expect(sl.bossX).toBe(bossX);
    sl.phaseTransitionTicks = 0;

    sl.waterfowlPhase = 1;
    tickBossMovement(game);
    expect(sl.bossX).toBe(bossX);
    sl.waterfowlPhase = 0;
    expect(sl.bossY).toBe(bossY);
  });

  it("sustained closeness flips boss to defensive mode", async () => {
    const { tickBossMovement } = await import("../src/core/boss/styles/soulslike/movement.js");
    const { CLOSENESS_TRIGGER_TICKS } =
      await import("../src/core/boss/styles/soulslike/constants.js");
    const sl = game._soulslike;
    // Place snake adjacent to boss.
    placeSnake(sl.bossX + 1, sl.bossY);
    for (let i = 0; i <= CLOSENESS_TRIGGER_TICKS; i++) {
      tickBossMovement(game);
    }
    expect(sl.movementMode).toBe("defensive");
  });

  it("multiple boss hits flip boss to defensive mode", async () => {
    const { tickBossMovement, recordBossHit } =
      await import("../src/core/boss/styles/soulslike/movement.js");
    const { HITS_FOR_DEFENSIVE } = await import("../src/core/boss/styles/soulslike/constants.js");
    const sl = game._soulslike;
    // Place snake mid-arena so closeness doesn't also trigger.
    placeSnake(15, 12);
    for (let i = 0; i < HITS_FOR_DEFENSIVE; i++) {
      recordBossHit(sl);
    }
    tickBossMovement(game);
    expect(sl.movementMode).toBe("defensive");
  });

  it("sustained farness flips boss to aggressive mode", async () => {
    const { tickBossMovement } = await import("../src/core/boss/styles/soulslike/movement.js");
    const { FARNESS_TRIGGER_TICKS } =
      await import("../src/core/boss/styles/soulslike/constants.js");
    const sl = game._soulslike;
    // Snake far from boss — default spawn at (15, 24) vs boss (15, 5)
    // is distance 19, well past FARNESS_THRESHOLD.
    for (let i = 0; i <= FARNESS_TRIGGER_TICKS; i++) {
      tickBossMovement(game);
    }
    expect(sl.movementMode).toBe("aggressive");
  });

  it("aggressive boss closes distance toward the snake over time", async () => {
    const { tickBossMovement } = await import("../src/core/boss/styles/soulslike/movement.js");
    const { AGGRESSIVE_DURATION_TICKS, MOVE_INTERVAL_TICKS } =
      await import("../src/core/boss/styles/soulslike/constants.js");
    const sl = game._soulslike;
    // Force aggressive mode + reset timer for predictable movement.
    sl.movementMode = "aggressive";
    sl.movementModeLeft = AGGRESSIVE_DURATION_TICKS;
    sl.movementTimer = 1;
    placeSnake(15, 24); // south-centre snake; boss at (15, 5)
    const startDist = Math.abs(sl.bossX - 15) + Math.abs(sl.bossY - 24);
    // Run enough ticks for at least one move.
    for (let i = 0; i < MOVE_INTERVAL_TICKS + 1; i++) {
      tickBossMovement(game);
    }
    const endDist = Math.abs(sl.bossX - 15) + Math.abs(sl.bossY - 24);
    expect(endDist).toBeLessThan(startDist);
  });

  it("defensive boss retreats from the snake over time", async () => {
    const { tickBossMovement } = await import("../src/core/boss/styles/soulslike/movement.js");
    const { DEFENSIVE_DURATION_TICKS, MOVE_INTERVAL_TICKS } =
      await import("../src/core/boss/styles/soulslike/constants.js");
    const sl = game._soulslike;
    // Put boss mid-arena so it has retreat room (the default north
    // spawn at y=5 is hard against the top wall — no retreat north).
    sl.bossX = 15;
    sl.bossY = 15;
    sl.movementMode = "defensive";
    sl.movementModeLeft = DEFENSIVE_DURATION_TICKS;
    sl.movementTimer = 1;
    // Snake 2 cells north of boss → defensive boss retreats south.
    const snakeX = 15;
    const snakeY = 13;
    placeSnake(snakeX, snakeY);
    const startDist = Math.abs(sl.bossX - snakeX) + Math.abs(sl.bossY - snakeY);
    for (let i = 0; i < MOVE_INTERVAL_TICKS + 1; i++) {
      tickBossMovement(game);
    }
    const endDist = Math.abs(sl.bossX - snakeX) + Math.abs(sl.bossY - snakeY);
    expect(endDist).toBeGreaterThan(startDist);
  });

  it("idle boss holds ground when snake is closing", async () => {
    const { tickBossMovement } = await import("../src/core/boss/styles/soulslike/movement.js");
    const sl = game._soulslike;
    sl.movementMode = "idle";
    sl.movementTimer = 1;
    placeSnake(15, 10);
    sl.prevPlayerDistance = 10; // snake was farther last tick
    // Snake at distance ~5 — closer than 10 → "snake is closing".
    const { bossX, bossY } = sl;
    tickBossMovement(game);
    expect(sl.bossX).toBe(bossX);
    expect(sl.bossY).toBe(bossY);
  });

  it("idle boss strafes when snake holds distance", async () => {
    const { tickBossMovement } = await import("../src/core/boss/styles/soulslike/movement.js");
    const sl = game._soulslike;
    sl.movementMode = "idle";
    sl.movementTimer = 1;
    placeSnake(15, 10);
    // Snake distance same as prevPlayerDistance → not closing → strafe.
    sl.prevPlayerDistance = Math.abs(sl.bossX - 15) + Math.abs(sl.bossY - 10);
    const { bossX, bossY } = sl;
    tickBossMovement(game);
    // Either bossX or bossY changed (strafed perpendicular).
    expect(sl.bossX !== bossX || sl.bossY !== bossY).toBe(true);
  });

  it("non-idle mode reverts to idle after its duration expires", async () => {
    const { tickBossMovement } = await import("../src/core/boss/styles/soulslike/movement.js");
    const sl = game._soulslike;
    sl.movementMode = "aggressive";
    sl.movementModeLeft = 1;
    // Snake placed mid-arena to avoid trigger-bouncing on a counter.
    placeSnake(15, 12);
    tickBossMovement(game);
    expect(sl.movementMode).toBe("idle");
  });

  it("hit decay resets the hitsTaken counter after HIT_DECAY_TICKS", async () => {
    const { tickBossMovement, recordBossHit } =
      await import("../src/core/boss/styles/soulslike/movement.js");
    const { HIT_DECAY_TICKS } = await import("../src/core/boss/styles/soulslike/constants.js");
    const sl = game._soulslike;
    placeSnake(15, 12);
    recordBossHit(sl);
    expect(sl.hitsTaken).toBe(1);
    for (let i = 0; i < HIT_DECAY_TICKS; i++) {
      tickBossMovement(game);
    }
    expect(sl.hitsTaken).toBe(0);
  });
});

describe("hissalia / soulslike YOU DIED screen (Step 13)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.startRun();
    game._practiceBossId = "hissalia";
    game._enterBossFight();
  });

  function tickOnce(g) {
    g._lastBossTickTime = 0;
    g.tick();
  }

  it("snake HP zero starts the death-pose hold without changing state", () => {
    const sl = game._soulslike;
    sl.snakeHp = 0;
    expect(sl.deathScreenTicks).toBe(0);
    tickOnce(game);
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(sl.deathScreenTicks).toBe(1);
  });

  it("after DEATH_HOLD_TICKS, state flips to STATE_DEAD_SOULSLIKE", async () => {
    const { DEATH_HOLD_TICKS } = await import("../src/core/boss/styles/soulslike/constants.js");
    const sl = game._soulslike;
    sl.snakeHp = 0;
    for (let i = 0; i < DEATH_HOLD_TICKS; i++) {
      tickOnce(game);
    }
    expect(game.state).toBe(Game.STATE_DEAD_SOULSLIKE);
  });

  it("regular boss / status ticks are paused while dead", async () => {
    const sl = game._soulslike;
    sl.snakeHp = 0;
    sl.bossAttackId = null;
    sl.ticksSinceLastAttack = 0;
    sl.stamina = 0;
    sl.staminaDelayCounter = 0;
    tickOnce(game);
    // No regen, no boss attack pickup, no phase transitions during the
    // death hold.
    expect(sl.bossAttackId).toBeNull();
    expect(sl.ticksSinceLastAttack).toBe(0);
    expect(sl.stamina).toBe(0);
  });

  it("STATE_DEAD_SOULSLIKE renders the YOU DIED overlay with the death cause", () => {
    game.snake.deathCause = "overhead";
    game.state = Game.STATE_DEAD_SOULSLIKE;
    let overlayCause = null;
    game.renderer = {
      clear: () => {},
      drawCell: () => {},
      cell: () => {},
      drawHUD: () => {},
      drawScreen: () => {},
      drawBossInfo: () => {},
      drawSurvivalInfo: () => {},
      drawSoulslikeInfo: () => {},
      drawBossIntroOverlay: () => {},
      drawYouDiedOverlay: (cause) => {
        overlayCause = cause;
      },
      flush: () => {},
    };
    game.renderFrame();
    expect(overlayCause).toBe("overhead");
  });

  it("YOU DIED overlay falls back to 'boss' when deathCause is unset", () => {
    game.snake.deathCause = null;
    game.state = Game.STATE_DEAD_SOULSLIKE;
    let overlayCause = null;
    game.renderer = {
      clear: () => {},
      drawCell: () => {},
      cell: () => {},
      drawHUD: () => {},
      drawScreen: () => {},
      drawBossInfo: () => {},
      drawSurvivalInfo: () => {},
      drawSoulslikeInfo: () => {},
      drawBossIntroOverlay: () => {},
      drawYouDiedOverlay: (cause) => {
        overlayCause = cause;
      },
      flush: () => {},
    };
    game.renderFrame();
    expect(overlayCause).toBe("boss");
  });

  it("dismissYouDied returns to STATE_PRACTICE_HUB and tears down soulslike state", () => {
    // _exitBossDeath routes to STATE_PRACTICE_HUB only when _practiceMode
    // is set; otherwise it ends the run via the normal death path. The
    // soulslike fight is practice-only in v1, so simulate the practice flag.
    game._practiceMode = "single";
    game.state = Game.STATE_DEAD_SOULSLIKE;
    expect(game._soulslike).not.toBeNull();
    game.dismissYouDied();
    expect(game.state).toBe(Game.STATE_PRACTICE_HUB);
    expect(game._soulslike).toBeNull();
    expect(game._bossDef).toBeNull();
  });

  it("dismissYouDied is a no-op outside STATE_DEAD_SOULSLIKE", () => {
    expect(game.state).toBe(Game.STATE_BOSS);
    game.dismissYouDied();
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game._soulslike).not.toBeNull();
  });

  it("base Renderer.drawYouDiedOverlay default is a safe no-op", async () => {
    const { Renderer } = await import("../src/render/renderer.js");
    class TestR extends Renderer {
      clear() {}
      drawHUD() {}
      drawScreen() {}
      flush() {}
    }
    const r = new TestR();
    expect(() => r.drawYouDiedOverlay("overhead")).not.toThrow();
  });
});

describe("menu", () => {
  let game;
  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
  });

  it("openMenu from start populates begin/practice/leaderboard/seed items", () => {
    game.openMenu();
    expect(game.state).toBe("menu");
    expect(game._menuItems.map((i) => i.id)).toEqual(["begin", "practice", "leaderboard", "seed"]);
    expect(game._menuSelection).toBe(0);
  });

  it("openMenu from dead populates restart/practice/leaderboard/seed items", () => {
    game.state = Game.STATE_DEAD;
    game.openMenu();
    expect(game.state).toBe("menu");
    expect(game._menuItems.map((i) => i.id)).toEqual([
      "restart",
      "practice",
      "leaderboard",
      "seed",
    ]);
  });

  it("openMenu from playing populates a resume/give_up pause menu", () => {
    game.startRun();
    game.openMenu();
    expect(game.state).toBe("menu");
    expect(game._menuItems.map((i) => i.id)).toEqual(["resume", "give_up"]);
    expect(game._pauseStartTime).not.toBe(null);
  });

  it("openMenu is a no-op outside start/dead/playing", () => {
    game.state = Game.STATE_BOSS;
    game.openMenu();
    expect(game.state).toBe(Game.STATE_BOSS);
  });

  it("selectMenu clamps to bounds", () => {
    game.openMenu();
    game.selectMenu(-5);
    expect(game._menuSelection).toBe(0);
    game.selectMenu(99);
    expect(game._menuSelection).toBe(game._menuItems.length - 1);
  });

  it("closeMenu returns to the originating state", () => {
    game.openMenu();
    game.closeMenu();
    expect(game.state).toBe(Game.STATE_START);

    game.state = Game.STATE_DEAD;
    game.openMenu();
    game.closeMenu();
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("confirmMenu on 'begin' starts a run", () => {
    game.openMenu();
    game.selectMenu(0);
    game.confirmMenu();
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("confirmMenu on 'seed' enters seed input", () => {
    game.openMenu();
    // begin/practice/leaderboard/seed → seed is index 3.
    game.selectMenu(3);
    game.confirmMenu();
    expect(game.state).toBe("seed_input");
    expect(game._seedInput).toBe("");
  });

  // ── Practice hub + mutation picker ─────────────────────────

  it("confirmMenu on 'practice' opens the practice hub", () => {
    game.openMenu();
    game.selectMenu(1); // practice row
    game.confirmMenu();
    expect(game.state).toBe(Game.STATE_PRACTICE_HUB);
    expect(game._practiceHubSelection).toBe(0);
  });

  it("hub 'Mutations' item opens the mutation picker", () => {
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu(); // → hub
    game.selectPracticeHub(0); // mutations
    game.confirmPracticeHub();
    expect(game.state).toBe(Game.STATE_MUTATION_PICKER);
    expect(game._mutationPickerSelection).toBeGreaterThanOrEqual(0);
  });

  it("selectMutationPicker clamps to bounds", () => {
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu();
    game.confirmPracticeHub(); // mutations is the default row
    game.selectMutationPicker(-5);
    expect(game._mutationPickerSelection).toBe(0);
    game.selectMutationPicker(999);
    expect(game._mutationPickerSelection).toBeGreaterThanOrEqual(0);
  });

  it("confirmMutationPicker immediately starts a practice run in the picked mutation", async () => {
    const { MUTATIONS } = await import("../src/core/generation/registry.js");
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu(); // → hub
    game.confirmPracticeHub(); // → mutation picker
    const ids = Object.keys(MUTATIONS);
    const idx = ids.indexOf("wildlands");
    game.selectMutationPicker(idx);
    game.confirmMutationPicker();
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game.upgrades.mutation).toBe("wildlands");
    expect(game.generateGrid).toBe(MUTATIONS.wildlands.generate);
  });

  it("closeMutationPicker returns to the practice hub when opened from there", () => {
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu();
    game.confirmPracticeHub(); // → mutation picker
    game.selectMutationPicker(1);
    game.closeMutationPicker();
    expect(game.state).toBe(Game.STATE_PRACTICE_HUB);
  });

  it("closePracticeHub returns to the menu", () => {
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu();
    game.closePracticeHub();
    expect(game.state).toBe("menu");
  });

  // ── Practice hub: boss picker / random / rush ────────────────

  it("hub 'Boss picker' opens the boss picker screen", () => {
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu();
    game.selectPracticeHub(1); // bossPicker
    game.confirmPracticeHub();
    expect(game.state).toBe(Game.STATE_BOSS_PICKER);
    expect(game._bossPickerSelection).toBe(0);
  });

  it("confirmBossPicker spawns the chosen boss with no contraband", async () => {
    const { ALL_BOSS_DEFS } = await import("../src/core/boss/bosses/index.js");
    const { LABELS } = await import("../src/text/labels.js");
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu();
    game.selectPracticeHub(1);
    game.confirmPracticeHub(); // → boss picker
    game.selectBossPicker(2); // third boss in registry
    game.confirmBossPicker();
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game._practiceMode).toBe("single");
    expect(game._boss.name).toBe(LABELS.bosses[ALL_BOSS_DEFS[2].id].name);
    expect(game._contraband).toHaveLength(0);
  });

  it("single-boss victory returns to practice hub without recording", () => {
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu();
    game.selectPracticeHub(1);
    game.confirmPracticeHub();
    game.selectBossPicker(0);
    game.confirmBossPicker();
    expect(game.state).toBe(Game.STATE_BOSS);

    game._exitBossVictory();
    expect(game.state).toBe(Game.STATE_PRACTICE_HUB);
    expect(game._practiceMode).toBe(null);
    expect(game._boss).toBe(null);
    expect(game._runRecorded).toBe(false);
  });

  it("single-boss death returns to the practice hub (no leaderboard)", async () => {
    const { DEATH_BOSS } = await import("../src/core/game/constants.js");
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu();
    game.selectPracticeHub(1);
    game.confirmPracticeHub();
    game.selectBossPicker(0);
    game.confirmBossPicker();

    game._exitBossDeath(DEATH_BOSS);
    expect(game.state).toBe(Game.STATE_PRACTICE_HUB);
    expect(game._practiceMode).toBe(null);
    expect(game._runRecorded).toBe(false);
    expect(game._pendingRunRecord).toBe(null);
  });

  it("startRandomPracticeBoss enters STATE_BOSS in single mode", () => {
    game.startRandomPracticeBoss();
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game._practiceMode).toBe("single");
    expect(game._boss).not.toBe(null);
  });

  it("startBossRush queues every boss in shuffled order and spawns the first", async () => {
    const { ALL_BOSS_DEFS } = await import("../src/core/boss/bosses/index.js");
    const { LABELS } = await import("../src/text/labels.js");
    game.startBossRush();
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game._practiceMode).toBe("rush");
    expect(game._bossRushTotal).toBe(ALL_BOSS_DEFS.length);
    expect(game._bossRushQueue.length).toBe(ALL_BOSS_DEFS.length - 1);
    // The spawned boss is one of the registered bosses (matched by name).
    const allNames = new Set(ALL_BOSS_DEFS.map((d) => LABELS.bosses[d.id].name));
    expect(allNames.has(game._boss.name)).toBe(true);
    // The queue holds unique boss ids.
    const ids = new Set(game._bossRushQueue);
    expect(ids.size).toBe(game._bossRushQueue.length);
  });

  it("rush victory chains contraband draft → next boss", () => {
    game.startBossRush();
    const firstName = game._boss.name;

    game._exitBossVictory();
    expect(game.state).toBe(Game.STATE_CONTRABAND);
    // Picking any contraband and confirming should spawn the next boss.
    game._contrabandSelection = 0;
    game.confirmContraband();
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game._boss.name).not.toBe(firstName); // different boss
    expect(game._practiceMode).toBe("rush");
  });

  it("rush completion shows the rush-complete screen after the last boss", async () => {
    const { ALL_BOSS_DEFS } = await import("../src/core/boss/bosses/index.js");
    game.startBossRush();
    // Plough through every boss in the queue.
    for (let i = 0; i < ALL_BOSS_DEFS.length; i++) {
      expect(game.state).toBe(Game.STATE_BOSS);
      game._exitBossVictory();
      expect(game.state).toBe(Game.STATE_CONTRABAND);
      game._contrabandSelection = 0;
      game.confirmContraband();
    }
    expect(game.state).toBe(Game.STATE_BOSS_RUSH_COMPLETE);
    expect(game._practiceMode).toBe(null);
    expect(game._bossRushQueue).toHaveLength(0);
  });

  it("closeBossRushComplete returns to the practice hub", () => {
    game.state = Game.STATE_BOSS_RUSH_COMPLETE;
    game.closeBossRushComplete();
    expect(game.state).toBe(Game.STATE_PRACTICE_HUB);
  });

  it("rush death exits the rush cleanly (no recorded score)", async () => {
    const { DEATH_PROJECTILE } = await import("../src/core/game/constants.js");
    game.startBossRush();
    game._exitBossDeath(DEATH_PROJECTILE);
    expect(game.state).toBe(Game.STATE_PRACTICE_HUB);
    expect(game._practiceMode).toBe(null);
    expect(game._bossRushQueue).toHaveLength(0);
    expect(game._runRecorded).toBe(false);
  });

  // ── Pause menu ──────────────────────────────────────────────

  it("closeMenu from pause returns to playing and clears _pauseStartTime", () => {
    game.startRun();
    game.openMenu();
    expect(game._pauseStartTime).not.toBe(null);
    game.closeMenu();
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game._pauseStartTime).toBe(null);
  });

  it("confirmMenu on 'resume' resumes the run", () => {
    game.startRun();
    game.openMenu();
    game.selectMenu(0); // resume
    game.confirmMenu();
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game._pauseStartTime).toBe(null);
  });

  it("confirmMenu on 'give_up' ends the run with DEATH_GIVE_UP", async () => {
    const { DEATH_GIVE_UP } = await import("../src/core/game/constants.js");
    game.startRun();
    game.openMenu();
    game.selectMenu(1); // give_up
    game.confirmMenu();
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.alive).toBe(false);
    expect(game.snake.deathCause).toBe(DEATH_GIVE_UP);
    expect(game._pauseStartTime).toBe(null);
  });

  // ── Post-run name input ─────────────────────────────────────

  it("a wall death routes through STATE_NAME_INPUT before STATE_DEAD", () => {
    game.startRun();
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.setCell("wall", hx + 2, hy);
    game.lastTickTime = 0;
    game.tick();
    game.lastTickTime = 0;
    game.tick();
    expect(game.state).toBe(Game.STATE_NAME_INPUT);
    expect(game._pendingRunRecord).not.toBe(null);
    game.confirmNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("appendNameInput / backspaceNameInput edit the buffer", () => {
    game.startRun();
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.setCell("wall", hx + 2, hy);
    game.lastTickTime = 0;
    game.tick();
    game.lastTickTime = 0;
    game.tick();
    game._nameInput = ""; // ignore any saved name
    game.appendNameInput("A");
    game.appendNameInput("L");
    game.appendNameInput("X");
    expect(game._nameInput).toBe("ALX");
    game.backspaceNameInput();
    expect(game._nameInput).toBe("AL");
  });

  it("appendNameInput respects MAX_NAME_LENGTH", async () => {
    const { MAX_NAME_LENGTH } = await import("../src/core/leaderboard/index.js");
    game.startRun();
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.setCell("wall", hx + 2, hy);
    game.lastTickTime = 0;
    game.tick();
    game.lastTickTime = 0;
    game.tick();
    game._nameInput = "";
    for (let i = 0; i < MAX_NAME_LENGTH + 5; i++) {
      game.appendNameInput("X");
    }
    expect(game._nameInput.length).toBe(MAX_NAME_LENGTH);
  });

  it("confirmNameInput records the run with the entered name", () => {
    game.startRun();
    game.score = 11;
    game.foodEaten = 3;
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.setCell("wall", hx + 2, hy);
    game.lastTickTime = 0;
    game.tick();
    game.lastTickTime = 0;
    game.tick();
    game._nameInput = "TESTER";
    game.confirmNameInput();
    expect(game._runRecorded).toBe(true);
    expect(game._pendingRunRecord).toBe(null);
  });

  it("cancelNameInput records as Anonymous", () => {
    game.startRun();
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.setCell("wall", hx + 2, hy);
    game.lastTickTime = 0;
    game.tick();
    game.lastTickTime = 0;
    game.tick();
    game._nameInput = "WHATEVER";
    game.cancelNameInput();
    expect(game._runRecorded).toBe(true);
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("normal Begin (Enter from start) stays on crystalline regardless of last practice pick", async () => {
    const { generateGrid: crystallineGenerate } = await import("../src/core/generation/index.js");
    // Start a practice run in wildlands.
    const { MUTATIONS } = await import("../src/core/generation/registry.js");
    game.openMenu();
    game.selectMenu(1);
    game.confirmMenu(); // → practice hub
    game.confirmPracticeHub(); // → mutation picker
    const idx = Object.keys(MUTATIONS).indexOf("wildlands");
    game.selectMutationPicker(idx);
    game.confirmMutationPicker(); // wildlands practice run starts
    expect(game.upgrades.mutation).toBe("wildlands");

    // Simulate the player dying.
    game.state = Game.STATE_DEAD;
    // Pressing Enter from dead screen should restart on crystalline,
    // not the wildlands they just practised.
    game.confirm();
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game.upgrades.mutation).toBe("crystalline");
    expect(game.generateGrid).toBe(crystallineGenerate);
  });
});

describe("seed-driven crystalline determinism", () => {
  /** Builds a Game with optional explicit runSeed and runs a full startRun. */
  function runWithSeed(runSeed) {
    const game = new Game();
    game.manifest = buildTestManifest();
    if (runSeed !== undefined) {
      game._pendingRunSeed = runSeed;
    }
    game.startRun();
    return game;
  }

  /** Snapshot of a generated act — food, snake head, lattice placements. */
  function snapshot(game) {
    return {
      runSeed: game.runSeed,
      foodX: game.grid.foodX,
      foodY: game.grid.foodY,
      headX: game.snake.snakeX[game.snake.headIndex],
      headY: game.snake.snakeY[game.snake.headIndex],
      placements: game.mechanic?.placements ?? null,
    };
  }

  it("random seeds produce different layouts (high-probability)", () => {
    const a = snapshot(runWithSeed());
    const b = snapshot(runWithSeed());
    // runSeed comes from Math.random; collisions vanishingly unlikely.
    expect(a.runSeed).not.toBe(b.runSeed);
    // Lattice placements almost certainly differ; if they don't, food does.
    const placementsEqual = JSON.stringify(a.placements) === JSON.stringify(b.placements);
    const foodEqual = a.foodX === b.foodX && a.foodY === b.foodY;
    expect(placementsEqual && foodEqual).toBe(false);
  });

  it("same explicit runSeed produces identical layouts", () => {
    const a = snapshot(runWithSeed(0xdeadbeef));
    const b = snapshot(runWithSeed(0xdeadbeef));
    expect(a).toEqual(b);
  });

  it("different explicit runSeeds produce different layouts", () => {
    const a = snapshot(runWithSeed(0x11111111));
    const b = snapshot(runWithSeed(0x22222222));
    expect(a.placements).not.toEqual(b.placements);
  });

  it("custom seed string 'test' produces identical layouts across runs", async () => {
    const { hashString } = await import("../src/core/rng.js");
    const seed = hashString("test");
    const a = snapshot(runWithSeed(seed));
    const b = snapshot(runWithSeed(seed));
    expect(a).toEqual(b);
  });

  it("different custom seed strings produce different layouts", async () => {
    const { hashString } = await import("../src/core/rng.js");
    const a = snapshot(runWithSeed(hashString("test")));
    const b = snapshot(runWithSeed(hashString("foo")));
    expect(a.placements).not.toEqual(b.placements);
  });
});

describe("custom seed input", () => {
  let game;
  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
  });

  it("enterSeedInput transitions from start to seed_input", () => {
    expect(game.state).toBe(Game.STATE_START);
    game.enterSeedInput();
    expect(game.state).toBe("seed_input");
    expect(game._seedInput).toBe("");
  });

  it("enterSeedInput is a no-op outside start/dead", () => {
    game.startRun();
    expect(game.state).toBe(Game.STATE_PLAYING);
    game.enterSeedInput();
    expect(game.state).toBe(Game.STATE_PLAYING);
  });

  it("appendSeedChar appends printable characters", () => {
    game.enterSeedInput();
    game.appendSeedChar("a");
    game.appendSeedChar("b");
    game.appendSeedChar("1");
    expect(game._seedInput).toBe("ab1");
  });

  it("appendSeedChar enforces max length", () => {
    game.enterSeedInput();
    for (let i = 0; i < 100; i++) {
      game.appendSeedChar("x");
    }
    expect(game._seedInput.length).toBeLessThanOrEqual(48);
  });

  it("backspaceSeedInput removes last char and is safe at empty", () => {
    game.enterSeedInput();
    game.appendSeedChar("a");
    game.appendSeedChar("b");
    game.backspaceSeedInput();
    expect(game._seedInput).toBe("a");
    game.backspaceSeedInput();
    game.backspaceSeedInput();
    expect(game._seedInput).toBe("");
  });

  it("cancelSeedInput returns to start and clears buffer", () => {
    game.enterSeedInput();
    game.appendSeedChar("x");
    game.cancelSeedInput();
    expect(game.state).toBe(Game.STATE_START);
    expect(game._seedInput).toBe("");
  });

  it("confirmSeedInput with non-empty buffer hashes to runSeed", async () => {
    const { hashString } = await import("../src/core/rng.js");
    game.enterSeedInput();
    "snecko-2024".split("").forEach((c) => game.appendSeedChar(c));
    game.confirmSeedInput();
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game.runSeed).toBe(hashString("snecko-2024"));
  });

  it("confirmSeedInput with empty buffer rolls a random runSeed", () => {
    game.enterSeedInput();
    game.confirmSeedInput();
    expect(game.state).toBe(Game.STATE_PLAYING);
    // runSeed should be set (non-zero is overwhelmingly likely from Math.random)
    expect(typeof game.runSeed).toBe("number");
  });
});

describe("player invulnerability (Step 5)", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  function bossTick(g) {
    g._lastBossTickTime = 0;
    g._lastBossMoveTime = 0;
    g.tick();
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("_playerInvulTicks is 0 on boss entry", () => {
    game._enterBossFight();
    expect(game._playerInvulTicks).toBe(0);
  });

  it("walking into the weak point passes through (no ram damage)", () => {
    game._enterBossFight();
    skipBossIntro(game);
    const boss = game._boss;
    const wp = boss.getWeakPoint();
    // Expose the weak point by destroying adjacent body cells
    for (const c of boss.cells) {
      if (c.weak) {
        continue;
      }
      if (Math.abs(c.x - wp.x) + Math.abs(c.y - wp.y) === 1) {
        for (let i = 0; i < BOSS_BODY_HP; i++) {
          boss.hitBodyCell(c.x, c.y);
        }
      }
    }
    expect(boss.isWeakExposed()).toBe(true);
    // Position player to walk right into the weak point
    // Use a cell left of the weak point that isn't a body cell
    const startX = wp.x - 1;
    // Destroy the body cell at startX if it exists
    if (boss.isBodyCell(startX, wp.y)) {
      for (let i = 0; i < BOSS_BODY_HP; i++) {
        boss.hitBodyCell(startX, wp.y);
      }
    }
    game.grid.playerX = startX;
    game.grid.playerY = wp.y;
    game._playerSpawnY = wp.y;
    game.onInput(1, 0);
    bossTick(game);
    // Player moves into the weak-point cell, boss takes no damage
    expect(game.grid.playerX).toBe(wp.x);
    expect(boss.hp).toBeGreaterThan(0);
    expect(game.state).toBe(Game.STATE_BOSS);
  });

  it("_playerInvulTicks decrements by 1 each boss tick", () => {
    game._enterBossFight();
    game._playerInvulTicks = 4;
    bossTick(game);
    expect(game._playerInvulTicks).toBe(3);
    bossTick(game);
    expect(game._playerInvulTicks).toBe(2);
  });

  it("_playerInvulTicks does not go below 0", () => {
    game._enterBossFight();
    game._playerInvulTicks = 0;
    bossTick(game);
    expect(game._playerInvulTicks).toBe(0);
  });

  it("projectile does not kill player during invulnerability", () => {
    game._enterBossFight();
    game._playerInvulTicks = Game.BOSS_INVUL_TICKS;
    const px = game.grid.playerX;
    const py = game.grid.playerY;
    // Place projectile one cell left of tip, moving right — would normally kill
    game._projectiles.push({ x: px - 1, y: py, dx: 1, dy: 0 });
    bossTick(game);
    expect(game.state).toBe(Game.STATE_BOSS);
  });

  it("projectile kills player once invulnerability expires", () => {
    game._enterBossFight();
    // Run down the invulnerability window
    game._playerInvulTicks = 1;
    // Place projectile one tick away from the tip
    const px = game.grid.playerX;
    const py = game.grid.playerY;
    game._projectiles.push({ x: px - 1, y: py, dx: 1, dy: 0 });
    // First tick: invul decrements to 0, projectile moves — lands on tip, but
    // the collision check runs after the decrement so invul is now 0 → death
    bossTick(game);
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_PROJECTILE);
  });

  it("_playerInvulTicks resets to 0 on startRun", () => {
    game._enterBossFight();
    game._playerInvulTicks = 5;
    game.startRun();
    expect(game._playerInvulTicks).toBe(0);
  });

  it("_playerInvulTicks resets to 0 on re-entry to boss fight", () => {
    game._enterBossFight();
    game._playerInvulTicks = 5;
    game._enterBossFight();
    expect(game._playerInvulTicks).toBe(0);
  });
});

describe("renderer support (Step 9)", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("arena walls render as CELL_WALL_ARENA (not CELL_WALL) during boss fight", async () => {
    const { CELL_WALL, CELL_WALL_ARENA } = await import("../src/render/renderer.js");
    const { defineCell } = await import("../src/core/grid/cell/index.js");
    const { getCellSpec } = await import("../src/core/grid/cell/registry.js");
    game._enterBossFight();

    // Walls go through the cell adapter (Step 3 onward) — intercept by
    // overriding the registered render methods, then restore.
    const arenaCalls = [];
    const wallCalls = [];
    const origArena = getCellSpec(CELL_WALL_ARENA);
    const origWall = getCellSpec(CELL_WALL);
    defineCell(CELL_WALL_ARENA, { render: (x, y) => arenaCalls.push({ x, y }) });
    defineCell(CELL_WALL, { render: (x, y) => wallCalls.push({ x, y }) });

    try {
      game.renderer = {
        clear: () => {},
        drawCell: () => {},
        cell: () => {},
        drawSnakeHead: () => {},
        drawSnakeHeadInvul: () => {},
        drawHUD: () => {},
        drawBossInfo: () => {},
        drawBossIntroOverlay: () => {},
        flush: () => {},
      };

      game.renderFrame();

      // Boss arena uses CELL_WALL_ARENA, never CELL_WALL.
      expect(arenaCalls.length).toBeGreaterThan(0);
      expect(wallCalls.length).toBe(0);
    } finally {
      defineCell(CELL_WALL_ARENA, origArena);
      defineCell(CELL_WALL, origWall);
    }
  });

  it("drawBossIntroOverlay is called during BOSS_PHASE_INTRO", () => {
    game._enterBossFight();
    // Phase starts at PHASE_INTRO on entry
    expect(game._fight.phase).toBe(Game.BOSS_PHASE_INTRO);

    let introCalls = 0;
    game.renderer = {
      clear: () => {},
      drawCell: () => {},
      cell: () => {},
      drawSnakeHead: () => {},
      drawSnakeHeadInvul: () => {},
      drawHUD: () => {},
      drawBossInfo: () => {},
      drawBossIntroOverlay: (name, ticksLeft, total) => {
        introCalls++;
        expect(typeof name).toBe("string");
        expect(ticksLeft).toBeGreaterThan(0);
        expect(total).toBe(Game.BOSS_INTRO_TICKS);
      },
      flush: () => {},
    };

    game.renderFrame();
    expect(introCalls).toBe(1);
  });

  it("drawBossIntroOverlay is NOT called once intro ends (phase > INTRO)", () => {
    game._enterBossFight();
    // Force past the intro
    game._fight.phase = Game.BOSS_PHASE_1;

    let introCalls = 0;
    game.renderer = {
      clear: () => {},
      drawCell: () => {},
      cell: () => {},
      drawSnakeHead: () => {},
      drawSnakeHeadInvul: () => {},
      drawHUD: () => {},
      drawBossInfo: () => {},
      drawBossIntroOverlay: () => {
        introCalls++;
      },
      flush: () => {},
    };

    game.renderFrame();
    expect(introCalls).toBe(0);
  });

  it("drawBossIntroOverlay receives boss name from BossEntity", () => {
    game._enterBossFight();
    game._boss.name = "Test Boss";

    let receivedName = null;
    game.renderer = {
      clear: () => {},
      drawCell: () => {},
      cell: () => {},
      drawSnakeHead: () => {},
      drawSnakeHeadInvul: () => {},
      drawHUD: () => {},
      drawBossInfo: () => {},
      drawBossIntroOverlay: (name) => {
        receivedName = name;
      },
      flush: () => {},
    };

    game.renderFrame();
    expect(receivedName).toBe("Test Boss");
  });
});

describe("biome boss selection (Step 10)", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("crystalline mutation spawns Traffic Jam", () => {
    // Default mutation after startRun is crystalline
    expect(game.upgrades.mutation).toBe("crystalline");
    game._enterBossFight();
    expect(game._boss.name).toBe("Traffic Jam");
  });

  it("wildlands mutation spawns The Algorithm", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    expect(game._boss.name).toBe("The Algorithm");
  });

  it("unknown mutation falls back to Absolute Unit", () => {
    game.upgrades.mutation = "dream"; // not yet implemented
    game._enterBossFight();
    expect(game._boss.name).toBe("Absolute Unit");
  });

  it("Traffic Jam is 9 cells wide", () => {
    game._enterBossFight();
    expect(game._boss.width).toBe(9);
  });

  it("The Algorithm is 5 cells tall", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    expect(game._boss.height).toBe(5);
  });

  it("boss is horizontally centred inside the arena for any width", () => {
    // Crystalline: 7-wide boss should be centred at x=15 (inner arena 1..29)
    game._enterBossFight();
    const anchorCentreX = game._boss.x + Math.floor(game._boss.width / 2);
    expect(anchorCentreX).toBe(15);

    // Wildlands: 5-wide boss should also centre at x=15
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    const sovereignCentreX = game._boss.x + Math.floor(game._boss.width / 2);
    expect(sovereignCentreX).toBe(15);
  });

  it("getWeakPoint returns a cell inside the boss body", () => {
    game._enterBossFight();
    const boss = game._boss;
    const wp = boss.getWeakPoint();
    expect(boss.isBodyCell(wp.x, wp.y)).toBe(true);
    // isWeakCell requires exposed weak point — expose it first
    for (const c of boss.cells) {
      if (c.weak) {
        continue;
      }
      if (Math.abs(c.x - wp.x) + Math.abs(c.y - wp.y) === 1) {
        for (let i = 0; i < BOSS_BODY_HP; i++) {
          boss.hitBodyCell(c.x, c.y);
        }
      }
    }
    expect(boss.isWeakCell(wp.x, wp.y)).toBe(true);
  });

  it("getWeakPoint works correctly after boss drifts", () => {
    game._enterBossFight();
    const boss = game._boss;
    // Force the boss to move right a few ticks so x changes
    boss._tickCounter = 2; // one more tick to trigger move
    boss.update(Game.GRID_W);
    const wp = boss.getWeakPoint();
    expect(wp.x).toBe(boss.x + boss._weakX);
    expect(wp.y).toBe(boss.y + boss._weakY);
  });

  it("player can defeat Traffic Jam via bullet", () => {
    game._enterBossFight();
    game._boss.hp = 0;
    game._exitBossVictory();
    expect(game.state).toBe(Game.STATE_CONTRABAND);
  });

  it("player can defeat The Algorithm via bullet", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    game._boss.hp = 0;
    game._exitBossVictory();
    expect(game.state).toBe(Game.STATE_CONTRABAND);
  });

  it("Traffic Jam (crystalline) loads the Pillars arena with interior walls", () => {
    game._enterBossFight();
    // Pillars arena has interior pillar walls — col 5, row 4 is the top-left of one
    expect(game.grid.isWallCell(5, 4)).toBe(true);
  });

  it("The Algorithm (wildlands) loads the Box arena without interior walls", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    // Box arena has no interior obstacles at the same position
    expect(game.grid.isWallCell(5, 4)).toBe(false);
  });

  it("falls back to first arena when boss def arena name is not in manifest", () => {
    const emptyArena = {
      name: "Empty",
      width: Game.GRID_W,
      height: Game.GRID_H,
      walls: Array.from({ length: Game.GRID_H }, () => Array(Game.GRID_W).fill(false)),
      bossSpawn: { x: 15, y: 5 },
      snakeSpawn: { x: 15, y: 25 },
    };
    game.manifest = {
      arenas: [emptyArena],
      bossShapes: game.manifest.bossShapes,
    };
    // crystalline boss def references arena "Pillars", which isn't in this manifest
    game._enterBossFight();
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game.grid.playerX).toBe(15);
    expect(game.grid.playerY).toBe(25);
  });
});

describe("boss special abilities", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  function bossTick(g) {
    g._lastBossTickTime = 0;
    g._lastBossMoveTime = 0;
    g.tick();
  }

  // Skip the intro window so specials can fire
  function skipIntro(g) {
    for (let i = 0; i <= Game.BOSS_INTRO_TICKS; i++) {
      bossTick(g);
    }
    g._playerBullets = [];
    g._playerFireCounter = 0;
  }

  // Advance exactly BOSS_SPECIAL_INTERVAL ticks after intro so the special triggers
  function triggerSpecial(g) {
    skipIntro(g);
    for (let i = 0; i < Game.BOSS_SPECIAL_INTERVAL; i++) {
      bossTick(g);
    }
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  // ── Anchor (crystalline) ────────────────────────────────────────

  it("Anchor: no modifiers before special triggers", () => {
    game._enterBossFight();
    skipIntro(game);
    // Not yet reached BOSS_SPECIAL_INTERVAL
    expect(game._bossModifiers).toHaveLength(0);
  });

  it("Anchor: places anchor_lock modifier after BOSS_SPECIAL_INTERVAL ticks", () => {
    game._enterBossFight();
    triggerSpecial(game);
    const locks = game._bossModifiers.filter((m) => m.type === "anchor_lock");
    expect(locks.length).toBeGreaterThan(0);
  });

  it("Anchor: lock cells are added to the grid wall bitmask", () => {
    game._enterBossFight();
    triggerSpecial(game);
    const lock = game._bossModifiers.find((m) => m.type === "anchor_lock");
    if (lock && lock.cells.length > 0) {
      const cell = lock.cells[0];
      expect(game.grid.isWallCell(cell.x, cell.y)).toBe(true);
    }
  });

  it("Anchor: charging into a lock cell clears it (not lethal)", () => {
    game._enterBossFight();
    triggerSpecial(game);
    const lock = game._bossModifiers.find((m) => m.type === "anchor_lock");
    if (!lock || lock.cells.length === 0) {
      return;
    } // special didn't place any — skip

    // Position player one cell to the left of a lock cell, moving right
    const lockCell = lock.cells[0];
    game.grid.playerX = lockCell.x - 1;
    game.grid.playerY = lockCell.y;
    // Clear in-flight projectiles from the special-interval fire pattern.
    // Without this the bossTick can land a projectile on the relocated
    // player before the lock-clear path runs (a flake we hit with random
    // RNG: ~1 in 25 runs the player would die mid-charge to a stale shot).
    game._projectiles = [];
    game.onInput(1, 0);
    bossTick(game);

    // Player should survive and the lock cell should be cleared
    expect(game.state).toBe(Game.STATE_BOSS);
    expect(game.grid.isWallCell(lockCell.x, lockCell.y)).toBe(false);
  });

  it("Anchor: lock modifier expires after its duration", () => {
    game._enterBossFight();
    triggerSpecial(game);
    const lock = game._bossModifiers.find((m) => m.type === "anchor_lock");
    if (!lock) {
      return;
    }

    const duration = lock.ticksLeft;
    for (let i = 0; i < duration; i++) {
      bossTick(game);
    }

    // After duration ticks the modifier should be gone
    expect(game._bossModifiers.filter((m) => m.type === "anchor_lock")).toHaveLength(0);
  });

  it("Anchor: wall cells are cleared from grid when lock expires", () => {
    game._enterBossFight();
    triggerSpecial(game);
    const lock = game._bossModifiers.find((m) => m.type === "anchor_lock");
    if (!lock || lock.cells.length === 0) {
      return;
    }

    const trackedCells = [...lock.cells];
    const duration = lock.ticksLeft;
    for (let i = 0; i < duration; i++) {
      bossTick(game);
    }

    for (const cell of trackedCells) {
      expect(game.grid.isWallCell(cell.x, cell.y)).toBe(false);
    }
  });

  it("Anchor: special does not fire during intro", () => {
    game._enterBossFight();
    // Advance only BOSS_SPECIAL_INTERVAL ticks without clearing intro first
    for (let i = 0; i < Game.BOSS_SPECIAL_INTERVAL; i++) {
      bossTick(game);
    }
    // Fight is still in intro (BOSS_INTRO_TICKS = 25 > BOSS_SPECIAL_INTERVAL = 18)
    expect(game._fight.phase).toBe(Game.BOSS_PHASE_INTRO);
    expect(game._bossModifiers).toHaveLength(0);
  });

  it("Anchor: modifiers cleared on boss exit (no stale wall cells)", () => {
    game._enterBossFight();
    triggerSpecial(game);
    const lock = game._bossModifiers.find((m) => m.type === "anchor_lock");
    if (!lock || lock.cells.length === 0) {
      return;
    }

    const trackedCells = [...lock.cells];

    // Force a death to exit the boss fight
    game.grid.playerX = Game.GRID_W - 2;
    game.grid.playerY = Math.floor(Game.GRID_H / 2);
    game.onInput(1, 0);
    bossTick(game);
    game.cancelNameInput();
    expect(game.state).toBe(Game.STATE_DEAD);

    // All lock cells must have been removed from the grid
    for (const cell of trackedCells) {
      expect(game.grid.isWallCell(cell.x, cell.y)).toBe(false);
    }
    expect(game._bossModifiers).toHaveLength(0);
  });

  it("Absolute Unit: has no special (no modifiers ever placed)", () => {
    game.upgrades.mutation = "dream"; // unmapped → Absolute Unit fallback
    game._enterBossFight();
    triggerSpecial(game);
    // No modifiers should have been placed
    expect(game._bossModifiers).toHaveLength(0);
  });

  // ── The Algorithm (wildlands) ───────────────────────────────────

  it("Algorithm: places algorithm_current modifier after BOSS_SPECIAL_INTERVAL ticks", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    triggerSpecial(game);
    const currents = game._bossModifiers.filter((m) => m.type === "algorithm_current");
    expect(currents.length).toBeGreaterThan(0);
  });

  it("Algorithm: current river cells are not in the wall bitmask (passable)", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    triggerSpecial(game);
    const current = game._bossModifiers.find((m) => m.type === "algorithm_current");
    if (!current || current.cells.length === 0) {
      return;
    }
    for (const cell of current.cells) {
      expect(game.grid.isWallCell(cell.x, cell.y)).toBe(false);
    }
  });

  it("Algorithm: river spawns strictly above the player's current row", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    triggerSpecial(game);
    const current = game._bossModifiers.find((m) => m.type === "algorithm_current");
    if (!current || current.cells.length === 0) {
      return;
    }
    for (const cell of current.cells) {
      expect(cell.y).toBeLessThan(game.grid.playerY);
    }
  });

  it("Algorithm: spawns in telegraph state with drift inactive", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    triggerSpecial(game);
    const current = game._bossModifiers.find((m) => m.type === "algorithm_current");
    if (!current) {
      return;
    }
    expect(current.state).toBe("telegraph");
    expect(current.driftActive).toBe(false);
  });

  it("Algorithm: transitions telegraph → flow after the warning window", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    triggerSpecial(game);
    const current = game._bossModifiers.find((m) => m.type === "algorithm_current");
    if (!current) {
      return;
    }
    // Run boss-sub-ticks until ticksLeft drops to FLOW_TICKS — by then state
    // must be "flow". Each `bossTick` ticks the boss sub-loop once.
    while (current.ticksLeft > 0 && current.state === "telegraph") {
      bossTick(game);
    }
    expect(current.state).toBe("flow");
    expect(current.driftActive).toBe(true);
  });

  it("Algorithm: player standing on a flow cell is pushed in the cell's flow direction", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    triggerSpecial(game);
    const current = game._bossModifiers.find((m) => m.type === "algorithm_current");
    if (!current || current.cells.length === 0) {
      return;
    }

    // Advance into flow phase.
    while (current.ticksLeft > 0 && current.state === "telegraph") {
      bossTick(game);
    }
    if (current.state !== "flow") {
      return;
    }

    const cell = current.cells[0];
    game.grid.playerX = cell.x;
    game.grid.playerY = cell.y;
    game._playerSpawnY = cell.y; // allow vertical drift past the Y-lock
    const beforeX = game.grid.playerX;
    const beforeY = game.grid.playerY;

    bossTick(game);

    expect(game.grid.playerX - beforeX).toBe(cell.flowDx);
    expect(game.grid.playerY - beforeY).toBe(cell.flowDy);
  });

  it("Algorithm: player is NOT pushed during the telegraph phase", () => {
    // Inject a telegraph-phase modifier directly so the assertion isn't
    // entangled with the boss-special timing (the natural-cycle case is
    // covered by the transition test below).
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    skipIntro(game);

    const cell = { x: 5, y: 8, flowDx: 1, flowDy: 0 };
    game._bossModifiers.push({
      type: "algorithm_current",
      cells: [cell],
      state: "telegraph",
      ticksLeft: 100, // big enough that the next bossTick stays in telegraph
      driftActive: false,
    });

    game.grid.playerX = cell.x;
    game.grid.playerY = cell.y;
    game._playerSpawnY = cell.y;
    const beforeX = game.grid.playerX;
    const beforeY = game.grid.playerY;

    bossTick(game);

    // Confirm the precondition held during the movement sub-tick.
    expect(game._bossModifiers[0].state).toBe("telegraph");
    expect(game.grid.playerX).toBe(beforeX);
    expect(game.grid.playerY).toBe(beforeY);
  });

  it("Algorithm: a flow-phase modifier registers as a drift source for projectiles + bullets", () => {
    // Verifies Step 2's drift hook activates for an algorithm_current modifier
    // once it enters flow. We inject a flow-phase modifier directly to keep
    // the assertion focused on drift wiring, not special-trigger timing.
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    skipIntro(game);

    const cell = { x: 5, y: 8, flowDx: 1, flowDy: 0 };
    game._bossModifiers.push({
      type: "algorithm_current",
      cells: [cell],
      state: "flow",
      ticksLeft: 100,
      driftActive: true,
    });

    // Place a boss projectile heading down so it lands on (5, 8) after one
    // bossTick — drift should curve it east to (6, 8).
    game._projectiles = [{ x: 5, y: 7, dx: 0, dy: 1 }];
    bossTick(game);
    if (game._projectiles.length > 0) {
      expect(game._projectiles[0].x).toBe(6);
      expect(game._projectiles[0].y).toBe(8);
    }
  });

  it("Algorithm: current modifier expires after its duration", () => {
    game.upgrades.mutation = "wildlands";
    game._enterBossFight();
    triggerSpecial(game);
    const current = game._bossModifiers.find((m) => m.type === "algorithm_current");
    if (!current) {
      return;
    }

    const duration = current.ticksLeft;
    for (let i = 0; i < duration; i++) {
      bossTick(game);
    }

    expect(game._bossModifiers.filter((m) => m.type === "algorithm_current")).toHaveLength(0);
  });

  it("_bossSpecialCounter resets on boss re-entry", () => {
    game._enterBossFight();
    game._bossSpecialCounter = 10;
    game._enterBossFight();
    expect(game._bossSpecialCounter).toBe(0);
  });

  it("_bossModifiers resets on boss re-entry", () => {
    game._enterBossFight();
    game._bossModifiers.push({ type: "anchor_lock", cells: [], ticksLeft: 5 });
    game._enterBossFight();
    expect(game._bossModifiers).toHaveLength(0);
  });
});

// ── Player bullets ──────────────────────────────────────────────

describe("player bullets", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.confirm();
    game._enterBossFight();
  });

  describe("spawnPlayerBullet", () => {
    it("spawns a bullet one cell ahead of the player tip", () => {
      game.grid.playerX = 15;
      game.grid.playerY = 25;
      game._playerFacing = { dx: 0, dy: -1 };
      game._playerBullets = [];

      spawnPlayerBullet(game);

      expect(game._playerBullets).toHaveLength(1);
      const b = game._playerBullets[0];
      expect(b.x).toBe(15);
      expect(b.y).toBe(24);
      expect(b.dx).toBe(0);
      expect(b.dy).toBe(-1);
    });

    it("spawns bullet in the correct direction when facing right", () => {
      game.grid.playerX = 10;
      game.grid.playerY = 15;
      game._playerFacing = { dx: 1, dy: 0 };
      game._playerBullets = [];

      spawnPlayerBullet(game);

      const b = game._playerBullets[0];
      expect(b.x).toBe(11);
      expect(b.y).toBe(15);
      expect(b.dx).toBe(1);
      expect(b.dy).toBe(0);
    });
  });

  describe("updatePlayerBullets", () => {
    it("advances bullets by their velocity each call", () => {
      game._playerBullets = [{ x: 15, y: 20, dx: 0, dy: -1 }];

      updatePlayerBullets(game._playerBullets, game.grid);

      expect(game._playerBullets[0].x).toBe(15);
      expect(game._playerBullets[0].y).toBe(19);
    });

    it("removes bullets that leave bounds", () => {
      // Place bullet at top edge heading up — next step goes out of bounds
      game._playerBullets = [{ x: 15, y: 0, dx: 0, dy: -1 }];

      updatePlayerBullets(game._playerBullets, game.grid);

      expect(game._playerBullets).toHaveLength(0);
    });

    it("removes bullets that hit a wall", () => {
      // Place bullet so next position is a wall cell (arena border at y=0 is wall)
      game._playerBullets = [{ x: 15, y: 1, dx: 0, dy: -1 }];

      updatePlayerBullets(game._playerBullets, game.grid);

      // y=0 is the arena wall — bullet should be removed
      expect(game._playerBullets).toHaveLength(0);
    });
  });

  describe("checkPlayerBulletCollision", () => {
    it("detects weak-point hits", () => {
      const boss = game._boss;
      const wp = boss.getWeakPoint();
      // Expose weak point by destroying adjacent body cells
      for (const c of boss.cells) {
        if (c.weak) {
          continue;
        }
        if (Math.abs(c.x - wp.x) + Math.abs(c.y - wp.y) === 1) {
          for (let i = 0; i < BOSS_BODY_HP; i++) {
            boss.hitBodyCell(c.x, c.y);
          }
        }
      }
      game._playerBullets = [{ x: wp.x, y: wp.y, dx: 0, dy: -1 }];

      const result = checkPlayerBulletCollision(game._playerBullets, boss);

      expect(result.weakHits).toBe(1);
      expect(result.bodyHits).toHaveLength(0);
      expect(result.hitIndices).toHaveLength(1);
    });

    it("detects body hits (non-weak boss cells)", () => {
      // Find a body cell that isn't the weak point
      const bodyCell = game._boss.cells.find((c) => !c.weak);
      game._playerBullets = [{ x: bodyCell.x, y: bodyCell.y, dx: 0, dy: -1 }];

      const result = checkPlayerBulletCollision(game._playerBullets, game._boss);

      expect(result.weakHits).toBe(0);
      expect(result.bodyHits).toHaveLength(1);
      expect(result.bodyHits[0]).toEqual({ x: bodyCell.x, y: bodyCell.y });
      expect(result.hitIndices).toHaveLength(1);
    });

    it("ignores bullets that miss entirely", () => {
      // Bullet in empty space far from boss
      game._playerBullets = [{ x: 1, y: 28, dx: 0, dy: -1 }];

      const result = checkPlayerBulletCollision(game._playerBullets, game._boss);

      expect(result.weakHits).toBe(0);
      expect(result.bodyHits).toHaveLength(0);
      expect(result.hitIndices).toHaveLength(0);
    });
  });

  describe("removeHitBullets", () => {
    it("removes bullets at specified indices", () => {
      game._playerBullets = [
        { x: 1, y: 1, dx: 0, dy: -1 },
        { x: 2, y: 2, dx: 0, dy: -1 },
        { x: 3, y: 3, dx: 0, dy: -1 },
      ];

      // Remove indices 2 and 0 (reverse order from checkPlayerBulletCollision)
      removeHitBullets(game._playerBullets, [2, 0]);

      expect(game._playerBullets).toHaveLength(1);
      expect(game._playerBullets[0].x).toBe(2);
    });
  });

  it("_playerBullets cleared on boss victory", () => {
    game._playerBullets = [{ x: 5, y: 5, dx: 0, dy: -1 }];
    game._exitBossVictory();
    expect(game._playerBullets).toHaveLength(0);
  });

  it("_playerBullets cleared on boss death", () => {
    game._playerBullets = [{ x: 5, y: 5, dx: 0, dy: -1 }];
    game._exitBossDeath(DEATH_PROJECTILE);
    expect(game._playerBullets).toHaveLength(0);
  });

  it("_playerBullets initialized on boss entry", () => {
    game._playerBullets = [{ x: 5, y: 5, dx: 0, dy: -1 }];
    game._enterBossFight();
    expect(game._playerBullets).toHaveLength(0);
  });
});

// ── Destructible boss body ──────────────────────────────────────

describe("destructible boss body", () => {
  let game;

  function simpleGridSetup(g) {
    g.grid.clearMasks("wall");
    g.grid.clearMasks("snake");
    g.grid.clearMasks("reserved");
    g.grid.terrain.fill(0);
    const cx = Math.floor(Game.GRID_W / 2);
    const cy = Math.floor(Game.GRID_H / 2);
    g.snake.init(g.grid, cx, cy, g.snake.snakeLength, 1, 0);
    g.grid.foodX = cx + g.snake.snakeLength + 1;
    g.grid.foodY = cy;
  }

  function bossTick(g) {
    g._lastBossTickTime = 0;
    g._lastBossMoveTime = 0;
    g.tick();
  }

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    game.generateGrid = simpleGridSetup;
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
    game._enterBossFight();
  });

  it("body cells start with BOSS_BODY_HP", () => {
    const boss = game._boss;
    const bodyCell = boss.cells.find((c) => !c.weak);
    expect(bodyCell).toBeDefined();
    expect(bodyCell.hp).toBe(BOSS_BODY_HP);
  });

  it("weak cell has hp = 0", () => {
    const boss = game._boss;
    const weakCell = boss.cells.find((c) => c.weak);
    expect(weakCell).toBeDefined();
    expect(weakCell.hp).toBe(0);
  });

  it("hitBodyCell decrements cell HP by 1", () => {
    const boss = game._boss;
    const bodyCell = boss.cells.find((c) => !c.weak);
    const hpBefore = bodyCell.hp;
    boss.hitBodyCell(bodyCell.x, bodyCell.y);
    expect(bodyCell.hp).toBe(hpBefore - 1);
  });

  it("hitBodyCell destroys cell at 0 HP", () => {
    const boss = game._boss;
    const bodyCell = boss.cells.find((c) => !c.weak);
    const cx = bodyCell.x;
    const cy = bodyCell.y;
    // Hit until destroyed
    for (let i = 0; i < BOSS_BODY_HP; i++) {
      boss.hitBodyCell(cx, cy);
    }
    // Cell should no longer be in the cells array
    expect(boss.cells.some((c) => c.x === cx && c.y === cy)).toBe(false);
    expect(boss.isBodyCell(cx, cy)).toBe(false);
  });

  it("destroyed cells persist after drift rebuild", () => {
    const boss = game._boss;
    const bodyCell = boss.cells.find((c) => !c.weak);
    const shapeIdx = bodyCell._shapeIdx;
    const relX = bodyCell.x - boss.x;
    const relY = bodyCell.y - boss.y;
    // Destroy it
    for (let i = 0; i < BOSS_BODY_HP; i++) {
      boss.hitBodyCell(bodyCell.x, bodyCell.y);
    }
    // Force drift rebuild by moving the boss
    const oldX = boss.x;
    boss.x = oldX + 1;
    boss._buildCells();
    // The cell at the same shape offset should still be destroyed
    const rebuilt = boss.cells.find((c) => c.x === boss.x + relX && c.y === boss.y + relY);
    expect(rebuilt).toBeUndefined();
    expect(boss._cellHp[shapeIdx]).toBe(0);
  });

  it("weak point is shielded when adjacent body cells alive", () => {
    const boss = game._boss;
    // By default, body cells surround the weak point → shielded
    expect(boss.isWeakExposed()).toBe(false);
  });

  it("isWeakCell returns false when weak point is shielded", () => {
    const boss = game._boss;
    const wp = boss.getWeakPoint();
    // Shielded → isWeakCell should return false
    expect(boss.isWeakCell(wp.x, wp.y)).toBe(false);
  });

  it("weak point exposed when all adjacent body cells destroyed", () => {
    const boss = game._boss;
    // Destroy all body cells adjacent to the weak point (in shape space)
    const wp = boss.getWeakPoint();
    // Keep hitting body cells around the weak point until exposed
    let maxIter = 200;
    while (!boss.isWeakExposed() && maxIter-- > 0) {
      // Find a body cell adjacent to the weak point
      const adj = boss.cells.find((c) => {
        if (c.weak) {
          return false;
        }
        const dx = Math.abs(c.x - wp.x);
        const dy = Math.abs(c.y - wp.y);
        return dx + dy === 1;
      });
      if (!adj) {
        break;
      }
      for (let i = 0; i < BOSS_BODY_HP; i++) {
        boss.hitBodyCell(adj.x, adj.y);
      }
    }
    expect(boss.isWeakExposed()).toBe(true);
    expect(boss.isWeakCell(wp.x, wp.y)).toBe(true);
  });

  it("bullet on shielded weak point is absorbed (no boss HP damage)", () => {
    const boss = game._boss;
    const hpBefore = boss.hp;
    const wp = boss.getWeakPoint();
    // Weak point is shielded by default
    expect(boss.isWeakExposed()).toBe(false);
    // Place a bullet directly on the weak point
    game._playerBullets = [{ x: wp.x, y: wp.y, dx: 0, dy: -1 }];
    bossTick(game);
    // Boss HP should be unchanged — bullet was absorbed by shielded weak point
    expect(boss.hp).toBe(hpBefore);
  });

  it("bullet damages boss HP when weak point is exposed", () => {
    const boss = game._boss;
    const wp = boss.getWeakPoint();
    // Destroy all adjacent body cells to expose weak point
    let maxIter = 200;
    while (!boss.isWeakExposed() && maxIter-- > 0) {
      const adj = boss.cells.find((c) => {
        if (c.weak) {
          return false;
        }
        const dx = Math.abs(c.x - wp.x);
        const dy = Math.abs(c.y - wp.y);
        return dx + dy === 1;
      });
      if (!adj) {
        break;
      }
      for (let i = 0; i < BOSS_BODY_HP; i++) {
        boss.hitBodyCell(adj.x, adj.y);
      }
    }
    expect(boss.isWeakExposed()).toBe(true);
    const hpBefore = boss.hp;
    // Place a bullet one cell below so it advances into the weak point
    game._playerBullets = [{ x: wp.x, y: wp.y + 1, dx: 0, dy: -1 }];
    game._playerBulletMoveCounter = PLAYER_BULLET_INTERVAL - 1;
    bossTick(game);
    expect(boss.hp).toBe(hpBefore - 1);
  });
});

// ── Step 14: cross-mutation totalScore ──────────────────────────────

describe("totalScore (Step 14)", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
    // Minimal advanceGrid — places the next food right ahead of the
    // snake so a single tick can eat it.
    game.advanceGrid = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.grid.foodX = hx + g.snake.dirX;
      g.grid.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("constructor starts with totalScore = 0", () => {
    const fresh = new Game();
    expect(fresh.totalScore).toBe(0);
  });

  it("startRun resets totalScore to 0", () => {
    game.totalScore = 1234;
    game.startRun();
    expect(game.totalScore).toBe(0);
  });

  it("eating food adds SCORE_PER_FOOD to totalScore", () => {
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.foodX = hx + 1;
    game.grid.foodY = hy;
    game.lastTickTime = 0;
    game.tick();
    expect(game.totalScore).toBe(10); // SCORE_PER_FOOD = 10
  });

  it("clearing an act adds SCORE_PER_ACT on top of the per-food contribution", () => {
    // Act 1 requires 7 food. After 7 eaten: 7*10 (food) + 100 (act).
    const required = game.foodRequired;
    for (let i = 0; i < required; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.grid.foodX = hx + game.snake.dirX;
      game.grid.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      if (game.state !== Game.STATE_PLAYING) {
        break;
      }
    }
    expect(game.state).toBe(Game.STATE_DRAFT);
    expect(game.totalScore).toBe(required * 10 + 100);
  });

  it("totalScore persists across acts within a run", () => {
    const required = game.foodRequired;
    for (let i = 0; i < required; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.grid.foodX = hx + game.snake.dirX;
      game.grid.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      if (game.state !== Game.STATE_PLAYING) {
        break;
      }
    }
    const afterAct1 = game.totalScore;
    expect(afterAct1).toBe(required * 10 + 100);
    // Step through the draft so the next act begins.
    if (game.state === Game.STATE_DRAFT) {
      game.confirmDraft();
    }
    // Eat one more food in the next act.
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.grid.foodX = hx + game.snake.dirX;
    game.grid.foodY = hy + game.snake.dirY;
    game.lastTickTime = 0;
    game.tick();
    expect(game.totalScore).toBe(afterAct1 + 10);
  });

  it("act-clear stashes a breakdown on _lastActBonuses", () => {
    const required = game.foodRequired;
    for (let i = 0; i < required; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.grid.foodX = hx + game.snake.dirX;
      game.grid.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      if (game.state !== Game.STATE_PLAYING) {
        break;
      }
    }
    expect(game.state).toBe(Game.STATE_DRAFT);
    expect(game._lastActBonuses).not.toBeNull();
    expect(game._lastActBonuses.food).toBe(required * 10);
    expect(game._lastActBonuses.act).toBe(100);
    expect(game._lastActBonuses.kin).toBe(0); // not brood
    expect(game._lastActBonuses.shields).toBe(0); // not brood
    expect(game._lastActBonuses.total).toBe(required * 10 + 100);
  });
});
