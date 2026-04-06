import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../src/core/game";

describe("Game constructor", () => {
  it("starts in START state", () => {
    const game = new Game();
    expect(game.state).toBe(Game.STATE_START);
    expect(game.score).toBe(0);
    expect(game.boardIndex).toBe(1);
  });
});

describe("state transitions", () => {
  let game;

  beforeEach(() => {
    game = new Game();
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
    game.board.setCell("wall", hx + 2, hy);

    game.lastTickTime = 0;
    game.tick(); // step 1 — ok
    game.lastTickTime = 0;
    game.tick(); // step 2 — hits wall
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("resets snake length on restart", () => {
    // Use advanceBoard that places food ahead so snake can eat and grow
    game.advanceBoard = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.board.foodX = hx + g.snake.dirX;
      g.board.foodY = hy + g.snake.dirY;
    };
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.board.foodX = hx + 1;
    game.board.foodY = hy;
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
    // Use a minimal advanceBoard that just places new food ahead
    game.advanceBoard = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.board.foodX = hx + g.snake.dirX;
      g.board.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("increments score and foodEaten on food", () => {
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.board.foodX = hx + 1;
    game.board.foodY = hy;

    game.lastTickTime = 0;
    game.tick();

    expect(game.score).toBe(1);
    expect(game.foodEaten).toBe(1);
    expect(game.boardIndex).toBe(1); // no level-up yet
    expect(game.snake.growing).toBe(true);
  });

  it("does not level up before threshold", () => {
    // Level 1 requires 7 food (5 + 1*2)
    expect(game.foodRequired).toBe(7);

    for (let i = 0; i < 3; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.board.foodX = hx + game.snake.dirX;
      game.board.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      if (game.state !== Game.STATE_PLAYING) break;
    }

    expect(game.level).toBe(1);
    expect(game.foodEaten).toBe(3);
  });
});

describe("level-up + draft", () => {
  /**
   * Feed the snake n times. If a draft screen appears, confirm it
   * so feeding can continue across levels.
   */
  function feedSnake(game, n) {
    for (let i = 0; i < n; i++) {
      if (game.state === Game.STATE_DRAFT) {
        game.confirmDraft();
      }
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.board.foodX = hx + game.snake.dirX;
      game.board.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
    }
    // Confirm any trailing draft
    if (game.state === Game.STATE_DRAFT) {
      game.confirmDraft();
    }
  }

  let game;

  beforeEach(() => {
    game = new Game();
    game.generateBoard = (g) => {
      g.board.clearMasks("wall");
      g.board.clearMasks("snake");
      g.board.clearMasks("reserved");
      const cx = Math.floor(Game.BOARD_W / 2);
      const cy = Math.floor(Game.BOARD_H / 2);
      g.snake.init(g.board, cx, cy, g.snake.snakeLength, 1, 0);
      g.board.foodX = cx + g.snake.snakeLength + 1;
      g.board.foodY = cy;
    };
    game.advanceBoard = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.board.foodX = hx + g.snake.dirX;
      g.board.foodY = hy + g.snake.dirY;
    };
    game.startRun();
  });

  it("enters DRAFT state at food threshold", () => {
    // Feed 7 food without confirming
    for (let i = 0; i < 7; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.board.foodX = hx + game.snake.dirX;
      game.board.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      if (game.state !== Game.STATE_PLAYING) break;
    }
    expect(game.state).toBe(Game.STATE_DRAFT);
    // Level hasn't been applied yet
    expect(game.level).toBe(1);
  });

  it("tick is no-op in DRAFT state", () => {
    game.state = Game.STATE_DRAFT;
    const levelBefore = game.level;
    game.lastTickTime = 0;
    game.tick();
    expect(game.level).toBe(levelBefore);
  });

  it("confirmDraft applies level-up and returns to PLAYING", () => {
    game.state = Game.STATE_DRAFT;
    game.foodEaten = game.foodRequired; // simulate threshold reached
    game.confirmDraft();
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game.level).toBe(2);
    expect(game.foodEaten).toBe(0);
    expect(game.boardIndex).toBe(2);
  });

  it("confirmDraft resets snake length", () => {
    game.state = Game.STATE_DRAFT;
    game.snake.snakeLength = 10;
    game.confirmDraft();
    expect(game.snake.snakeLength).toBe(Game.INITIAL_SNAKE_LENGTH);
  });

  it("confirmDraft is no-op outside DRAFT state", () => {
    const levelBefore = game.level;
    game.confirmDraft(); // state is PLAYING
    expect(game.level).toBe(levelBefore);
  });

  it("triggers level-up at food threshold (full flow)", () => {
    expect(game.foodRequired).toBe(7);
    feedSnake(game, 7);
    expect(game.level).toBe(2);
    expect(game.foodEaten).toBe(0);
    expect(game.boardIndex).toBe(2);
  });

  it("increases foodRequired each level", () => {
    feedSnake(game, 7);
    expect(game.foodRequired).toBe(9); // 5 + 2*2
  });

  it("recalculates tickMs on level-up", () => {
    feedSnake(game, 7);
    // boardIndex is now 2, base formula: 150 - 8 = 142 (possibly * 1.5 if slow_time drafted)
    const baseMs = 150 - (game.boardIndex - 1) * 8;
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
      game.board.foodX = hx + game.snake.dirX;
      game.board.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
      if (game.state !== Game.STATE_PLAYING) break;
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
    game._draftPool = { choices: [{}, {}, {}], mutation: { id: "wildlands", type: "mutation" } };
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
    expect(game.upgrades.worldMode).toBe("wildlands");
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
    expect(game.upgrades.worldMode).toBe("crystalline");
  });
});

describe("Slow Time passive", () => {
  let game;

  beforeEach(() => {
    game = new Game();
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
    game.upgrades.tickPassives();
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
    // After level-up, boardIndex is 2, so base = 150 - 8 = 142, slowed = 213
    const baseMs = 150 - (game.boardIndex - 1) * 8;
    expect(game.tickMs).toBe(Math.round(baseMs * 1.5));
  });
});

describe("Iron Jaw passive", () => {
  let game;

  beforeEach(() => {
    game = new Game();
    game.startRun();
  });

  it("eats wall ahead when iron_jaw is active", () => {
    game.upgrades.addPassive("iron_jaw", 3, "food");
    // Place wall directly ahead of snake
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const nx = hx + game.snake.dirX;
    const ny = hy + game.snake.dirY;
    game.board.setCell("wall", nx, ny);
    expect(game.board.isWallCell(nx, ny)).toBe(true);

    game.lastTickTime = 0;
    game.tick();

    // Wall should be cleared, snake alive and moved into that cell
    expect(game.board.isWallCell(nx, ny)).toBe(false);
    expect(game.state).toBe(Game.STATE_PLAYING);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(nx);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(ny);
  });

  it("dies on wall without iron_jaw", () => {
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const nx = hx + game.snake.dirX;
    const ny = hy + game.snake.dirY;
    game.board.setCell("wall", nx, ny);

    game.lastTickTime = 0;
    game.tick();

    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("expires after 3 food eaten", () => {
    game.upgrades.addPassive("iron_jaw", 3, "food");
    game.advanceBoard = (g) => {
      const hx = g.snake.snakeX[g.snake.headIndex];
      const hy = g.snake.snakeY[g.snake.headIndex];
      g.board.foodX = hx + g.snake.dirX;
      g.board.foodY = hy + g.snake.dirY;
    };

    // Eat 3 food to expire iron jaw
    for (let i = 0; i < 3; i++) {
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      game.board.foodX = hx + game.snake.dirX;
      game.board.foodY = hy + game.snake.dirY;
      game.lastTickTime = 0;
      game.tick();
    }

    expect(game.upgrades.hasPassive("iron_jaw")).toBe(false);

    // Now hitting a wall should kill
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    game.board.setCell("wall", hx + game.snake.dirX, hy + game.snake.dirY);
    game.lastTickTime = 0;
    game.tick();
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("does not expire from level-based tickPassives", () => {
    game.upgrades.addPassive("iron_jaw", 3, "food");
    game.upgrades.tickPassives(); // level-based tick should not affect food-based
    expect(game.upgrades.hasPassive("iron_jaw")).toBe(true);
  });

  it("_peekNextCell wraps around edges", () => {
    // Move snake to right edge facing right
    const rightEdge = game.board.width - 1;
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
    game.board.setCell("wall", hx + dx, hy + dy);
    game.board.setCell("wall", hx + dx * 2, hy + dy * 2);
    game.useConsumable();
    expect(game.board.isWallCell(hx + dx, hy + dy)).toBe(false);
    expect(game.board.isWallCell(hx + dx * 2, hy + dy * 2)).toBe(false);
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
    game.board.setCell("snake", hx + dx * 2, hy + dy * 2);
    game.useConsumable();
    expect(game.state).toBe(Game.STATE_DEAD);
  });

  it("collects food during dash", () => {
    game.upgrades.addConsumable("dash", 2);
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const dx = game.snake.dirX;
    const dy = game.snake.dirY;
    game.board.foodX = hx + dx;
    game.board.foodY = hy + dy;
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
    game._wormholeCursor.x = Game.BOARD_W - 1;
    game.onInput(1, 0);
    expect(game._wormholeCursor.x).toBe(0);
  });

  it("places portal A on first confirm, moves to phase 2", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    game._wormholeCursor.x = 0;
    game._wormholeCursor.y = 0;
    // Clear any walls at target
    game.board.clearCell("wall", 0, 0);
    game.board.clearCell("snake", 0, 0);
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
    game.board.clearCell("wall", 0, 0);
    game.board.clearCell("snake", 0, 0);
    game.confirm();
    // Place B
    game._wormholeCursor.x = 5;
    game._wormholeCursor.y = 5;
    game.board.clearCell("wall", 5, 5);
    game.board.clearCell("snake", 5, 5);
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
    game.board.setCell("wall", 2, 2);
    game.confirm();
    expect(game._wormholePhase).toBe(1); // still phase 1, placement rejected
  });

  it("cannot place portal B on same cell as A", () => {
    game.upgrades.addConsumable("wormhole", 1);
    game.useConsumable();
    game._wormholeCursor.x = 0;
    game._wormholeCursor.y = 0;
    game.board.clearCell("wall", 0, 0);
    game.board.clearCell("snake", 0, 0);
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
    game.board.foodX = 0;
    game.board.foodY = 0;
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
    game.board.foodX = 0;
    game.board.foodY = 0;

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
    game._bombCursor.x = Game.BOARD_W - 1;
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
        const bx = (0 + dx + Game.BOARD_W) % Game.BOARD_W;
        const by = (0 + dy + Game.BOARD_H) % Game.BOARD_H;
        game.board.clearCell("wall", bx, by);
        game.board.clearCell("snake", bx, by);
      }
    }
    // Place walls around cursor
    game.board.setCell("wall", 1, 0);
    game.board.setCell("wall", 0, 1);
    game.board.setCell("wall", 1, 1);
    game.confirm();
    expect(game.board.isWallCell(1, 0)).toBe(false);
    expect(game.board.isWallCell(0, 1)).toBe(false);
    expect(game.board.isWallCell(1, 1)).toBe(false);
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
    expect(game.snake.deathCause).toBe("bomb");
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
    game.startRun();
    expect(game.mechanic).not.toBe(null);
    expect(game.mechanic.type).toBe("lattice");
  });

  it("mechanic is reset to null on startRun", () => {
    const game = new Game();
    game.startRun();
    game.mechanic = { type: "fake" };
    game.startRun();
    // startRun sets mechanic to null, then generateBoard sets it to lattice
    expect(game.mechanic.type).toBe("lattice");
  });

  it("mechanic is reset on confirmDraft", () => {
    const game = new Game();
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
    // confirmDraft sets mechanic to null, then generateBoard re-inits it
    expect(game.mechanic.type).toBe("lattice");
  });
});
