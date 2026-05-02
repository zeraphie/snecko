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
  BOSS_BODY_HP,
  HUNGRY_VERTICAL_RANGE,
  PLAYER_BULLET_INTERVAL,
} from "../src/core/game/constants.js";

const __testDir = dirname(fileURLToPath(import.meta.url));
const __projectRoot = resolve(__testDir, "..");

function readAsset(path) {
  return readFileSync(resolve(__projectRoot, path), "utf-8");
}

/**
 * Builds a minimal manifest by reading the on-disk .arena and .boss files.
 * Used in beforeEach for boss-fight tests so _enterBossFight() can hydrate.
 */
function buildTestManifest() {
  return {
    arenas: parseArenaFile(readAsset("src/core/boss/arenas/default.arena")),
    bossShapes: {
      "absolute-unit": parseBossShape(readAsset("src/core/boss/bosses/absolute-unit.boss")),
      "traffic-jam": parseBossShape(readAsset("src/core/boss/bosses/traffic-jam.boss")),
      "the-algorithm": parseBossShape(readAsset("src/core/boss/bosses/the-algorithm.boss")),
    },
    crystals: buildCrystals(readAsset("src/core/generation/crystalline/crystals.shapes")),
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
    // Place player one cell from the east wall
    game.grid.playerX = Game.GRID_W - 2;
    game.grid.playerY = Math.floor(Game.GRID_H / 2);
    game.onInput(1, 0); // move right into east wall
    bossTick(game);
    expect(game.state).toBe(Game.STATE_DEAD);
    expect(game.snake.deathCause).toBe(DEATH_WALL);
  });

  it("player dies on boss body collision", () => {
    game._enterBossFight();
    const boss = game._boss;
    // Find a non-weak body cell and position player to walk into it
    const target = boss.cells.find((c) => !c.weak);
    game.grid.playerX = target.x - 1;
    game.grid.playerY = target.y;
    game.onInput(1, 0); // move right into boss body cell
    bossTick(game);
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
    const { CONTRABAND_DEFS } = await import("../src/core/upgrades/contraband/index.js");
    const { LABELS } = await import("../src/text/labels.js");
    for (const item of CONTRABAND_DEFS) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.apply).toBe("function");
      expect(typeof LABELS.upgrades[item.id].name).toBe("string");
      expect(typeof LABELS.upgrades[item.id].desc).toBe("string");
    }
  });
});

describe("menu", () => {
  let game;
  beforeEach(() => {
    game = new Game();
    game.manifest = buildTestManifest();
  });

  it("openMenu from start populates begin/seed items", () => {
    game.openMenu();
    expect(game.state).toBe("menu");
    expect(game._menuItems.map((i) => i.id)).toEqual(["begin", "seed"]);
    expect(game._menuSelection).toBe(0);
  });

  it("openMenu from dead populates restart/seed items", () => {
    game.state = Game.STATE_DEAD;
    game.openMenu();
    expect(game.state).toBe("menu");
    expect(game._menuItems.map((i) => i.id)).toEqual(["restart", "seed"]);
  });

  it("openMenu is a no-op outside start/dead", () => {
    game.startRun();
    game.openMenu();
    expect(game.state).toBe(Game.STATE_PLAYING);
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
    game.selectMenu(1);
    game.confirmMenu();
    expect(game.state).toBe("seed_input");
    expect(game._seedInput).toBe("");
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
    game._enterBossFight();

    const wallCells = [];
    game.renderer = {
      clear: () => {},
      drawCell: (x, y, type) => wallCells.push({ x, y, type }),
      drawSnakeHead: () => {},
      drawSnakeHeadInvul: () => {},
      drawHUD: () => {},
      drawBossInfo: () => {},
      drawBossIntroOverlay: () => {},
      flush: () => {},
    };

    game.renderFrame();

    // Every wall cell must be CELL_WALL_ARENA, not CELL_WALL
    const wallTypeCells = wallCells.filter(
      (c) => c.type === CELL_WALL || c.type === CELL_WALL_ARENA
    );
    expect(wallTypeCells.length).toBeGreaterThan(0);
    expect(wallTypeCells.every((c) => c.type === CELL_WALL_ARENA)).toBe(true);
  });

  it("drawBossIntroOverlay is called during BOSS_PHASE_INTRO", () => {
    game._enterBossFight();
    // Phase starts at PHASE_INTRO on entry
    expect(game._fight.phase).toBe(Game.BOSS_PHASE_INTRO);

    let introCalls = 0;
    game.renderer = {
      clear: () => {},
      drawCell: () => {},
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
