// shield.test.js — Brood shield consumable (Step 13).

import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";
import { Snake } from "../src/core/snake";
import { UpgradeState } from "../src/core/upgrades/state.js";
import { initCull } from "../src/core/mechanics/cull/index.js";
import {
  enterShieldPlacement,
  moveShieldCursor,
  confirmShieldPlacement,
  cancelShieldPlacement,
  shieldTargetKin,
} from "../src/core/upgrades/consumables/shield.js";
import { generateBroodGrid } from "../src/core/generation/brood/generator.js";
import { SHIELDS_PER_ACT } from "../src/core/mechanics/cull/constants.js";
import { STATE_PLAYING, STATE_SHIELD_PLACEMENT } from "../src/core/game/constants.js";
import { TERRAIN_KIN_HEAD, TERRAIN_KIN_BODY } from "../src/core/grid/constants.js";

function makeGame() {
  const grid = new Grid(31, 31);
  const snake = new Snake();
  snake.init(grid, 15, 15, 3, 1, 0);
  return {
    grid,
    snake,
    actIndex: 0,
    actSeed: 0xfeedbeef,
    mechanic: null,
    foodRand: Math.random,
    upgrades: new UpgradeState(),
    state: STATE_PLAYING,
    lastTickTime: 0,
    _shieldCursor: null,
  };
}

function placeKin(game, cells, name = "Testling") {
  const grid = game.grid;
  const w = grid.width;
  for (let i = 0; i < cells.length; i++) {
    const [x, y] = cells[i];
    grid.setCell("wall", x, y);
    grid.terrain[y * w + x] = i === 0 ? TERRAIN_KIN_HEAD : TERRAIN_KIN_BODY;
  }
  const kin = {
    cells,
    name,
    alive: true,
    shielded: false,
  };
  game.mechanic.kin.push(kin);
  return kin;
}

describe("enterShieldPlacement", () => {
  it("flips state to STATE_SHIELD_PLACEMENT with cursor at the snake head", () => {
    const game = makeGame();
    initCull(game);
    enterShieldPlacement(game);
    expect(game.state).toBe(STATE_SHIELD_PLACEMENT);
    expect(game._shieldCursor).toEqual({ x: 15, y: 15 });
  });
});

describe("moveShieldCursor", () => {
  it("moves by the given delta", () => {
    const game = makeGame();
    initCull(game);
    enterShieldPlacement(game);
    moveShieldCursor(game, 1, 0);
    expect(game._shieldCursor.x).toBe(16);
    moveShieldCursor(game, 0, -1);
    expect(game._shieldCursor.y).toBe(14);
  });

  it("wraps at grid edges", () => {
    const game = makeGame();
    initCull(game);
    enterShieldPlacement(game);
    game._shieldCursor.x = 0;
    moveShieldCursor(game, -1, 0);
    expect(game._shieldCursor.x).toBe(30);
    game._shieldCursor.x = 30;
    moveShieldCursor(game, 1, 0);
    expect(game._shieldCursor.x).toBe(0);
  });

  it("is a no-op outside STATE_SHIELD_PLACEMENT", () => {
    const game = makeGame();
    initCull(game);
    game._shieldCursor = { x: 5, y: 5 };
    // state is STATE_PLAYING — move should not fire.
    moveShieldCursor(game, 1, 0);
    expect(game._shieldCursor.x).toBe(5);
  });
});

describe("shieldTargetKin", () => {
  it("returns the kin under the cursor when alive and unshielded", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[10, 10]]);
    enterShieldPlacement(game);
    game._shieldCursor = { x: 10, y: 10 };
    expect(shieldTargetKin(game)).toBe(kin);
  });

  it("returns null when the cursor is on an empty cell", () => {
    const game = makeGame();
    initCull(game);
    enterShieldPlacement(game);
    game._shieldCursor = { x: 0, y: 0 };
    expect(shieldTargetKin(game)).toBeNull();
  });

  it("returns null when the kin is already shielded", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[10, 10]]);
    kin.shielded = true;
    enterShieldPlacement(game);
    game._shieldCursor = { x: 10, y: 10 };
    expect(shieldTargetKin(game)).toBeNull();
  });
});

describe("confirmShieldPlacement", () => {
  it("shields the kin and returns to play", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[10, 10]]);
    enterShieldPlacement(game);
    game._shieldCursor = { x: 10, y: 10 };
    const placed = confirmShieldPlacement(game);
    expect(placed).toBe(true);
    expect(kin.shielded).toBe(true);
    expect(game.state).toBe(STATE_PLAYING);
    expect(game._shieldCursor).toBeNull();
    // Cull clock is re-anchored so the paused interval isn't replayed.
    expect(game.mechanic.lastTickAt).toBeNull();
  });

  it("is a no-op when the cursor isn't on an eligible kin", () => {
    const game = makeGame();
    initCull(game);
    enterShieldPlacement(game);
    game._shieldCursor = { x: 0, y: 0 };
    const placed = confirmShieldPlacement(game);
    expect(placed).toBe(false);
    expect(game.state).toBe(STATE_SHIELD_PLACEMENT);
  });

  it("blocks re-shielding an already-shielded kin", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[10, 10]]);
    kin.shielded = true;
    enterShieldPlacement(game);
    game._shieldCursor = { x: 10, y: 10 };
    const placed = confirmShieldPlacement(game);
    expect(placed).toBe(false);
    expect(game.state).toBe(STATE_SHIELD_PLACEMENT);
  });
});

describe("cancelShieldPlacement", () => {
  it("refunds the spent charge and returns to play", () => {
    const game = makeGame();
    initCull(game);
    // Simulate the upgrades system after a charge has been spent — the
    // dispatcher in `useConsumable` deducts before calling enter.
    game.upgrades.addConsumable("shield", 4);
    enterShieldPlacement(game);
    cancelShieldPlacement(game);
    expect(game.state).toBe(STATE_PLAYING);
    expect(game._shieldCursor).toBeNull();
    expect(game.upgrades.getConsumable("shield")?.charges).toBe(5);
  });
});

describe("generateBroodGrid → auto-granted shields", () => {
  it("grants SHIELDS_PER_ACT charges of the shield consumable at act start", () => {
    const game = makeGame();
    game._lastSnake = null;
    generateBroodGrid(game);
    expect(game.upgrades.getConsumable("shield")?.charges).toBe(SHIELDS_PER_ACT);
  });

  it("resets shield charges per act (no accumulation from a prior act)", () => {
    const game = makeGame();
    // Simulate leftover charges from a previous act.
    game.upgrades.addConsumable("shield", 2);
    generateBroodGrid(game);
    expect(game.upgrades.getConsumable("shield")?.charges).toBe(SHIELDS_PER_ACT);
  });
});
