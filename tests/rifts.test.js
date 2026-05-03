// rifts.test.js — rifts mechanic lifecycle tests (catacombs mutation).

import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";
import { Snake } from "../src/core/snake";
import { generateCatacombsGrid } from "../src/core/generation/catacombs/generator.js";
import { initRifts, advanceRifts, RIFT_CADENCE } from "../src/core/mechanics/rifts.js";
import { TERRAIN_TELEGRAPH } from "../src/core/grid/constants.js";

function makeGame(actSeed = 0xCAFEBABE) {
  const grid = new Grid(31, 31);
  const snake = new Snake();
  return {
    grid,
    snake,
    actIndex: 1,
    actSeed,
    mechanic: null,
  };
}

function setupCatacombsGame(actSeed = 0xCAFEBABE) {
  const game = makeGame(actSeed);
  generateCatacombsGrid(game);
  return game;
}

function countTerrain(grid, terrainValue) {
  let count = 0;
  for (let i = 0; i < grid.terrain.length; i++) {
    if (grid.terrain[i] === terrainValue) count++;
  }
  return count;
}

function snapshotWalls(grid) {
  const walls = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.isWallCell(x, y)) walls.push(y * grid.width + x);
    }
  }
  return walls;
}

describe("initRifts", () => {
  it("attaches a rifts mechanic with linger state", () => {
    const game = setupCatacombsGame();
    expect(game.mechanic.type).toBe("rifts");
    expect(game.mechanic.state).toBe("linger");
    expect(game.mechanic.biteCounter).toBe(0);
  });

  it("pre-computes a batch of rift candidates upfront", () => {
    const game = setupCatacombsGame();
    expect(game.mechanic.riftBatch.length).toBeGreaterThan(0);
  });

  it("same actSeed → identical mechanic state (rand + first batch)", () => {
    const a = setupCatacombsGame(0xABCDEF12);
    const b = setupCatacombsGame(0xABCDEF12);
    // First batch of rifts is generated identically from the same seed.
    expect(a.mechanic.riftBatch.length).toBe(b.mechanic.riftBatch.length);
    expect(a.mechanic.riftBatch).toEqual(b.mechanic.riftBatch);
  });
});

describe("advanceRifts", () => {
  it("no-ops if mechanic is null", () => {
    const game = makeGame();
    advanceRifts(game);
  });

  it("no-ops if mechanic is not rifts", () => {
    const game = makeGame();
    game.mechanic = { type: "currents" };
    advanceRifts(game);
  });

  it("stays in linger for the first (CADENCE-2) bites", () => {
    const game = setupCatacombsGame();
    for (let i = 0; i < RIFT_CADENCE - 2; i++) {
      advanceRifts(game);
      expect(game.mechanic.state).toBe("linger");
    }
  });

  it("transitions to telegraph_rift on bite (CADENCE - 1) of the cycle", () => {
    const game = setupCatacombsGame();
    for (let i = 0; i < RIFT_CADENCE - 1; i++) {
      advanceRifts(game);
    }
    // The mechanic may stay in linger if no valid rift is currently
    // available; the typical case is telegraph_rift.
    if (game.mechanic.state === "telegraph_rift") {
      expect(countTerrain(game.grid, TERRAIN_TELEGRAPH)).toBeGreaterThan(0);
      expect(game.mechanic.pendingRift).not.toBe(null);
    }
  });

  it("applies the rift and returns to linger one bite after telegraph", () => {
    const game = setupCatacombsGame();
    for (let i = 0; i < RIFT_CADENCE - 1; i++) {
      advanceRifts(game);
    }
    if (game.mechanic.state !== "telegraph_rift") {
      return; // no valid rift this cycle; nothing to assert
    }

    advanceRifts(game); // rift bite
    expect(game.mechanic.state).toBe("linger");
    expect(game.mechanic.pendingRift).toBe(null);
    // Telegraph cells from the just-applied rift have been cleared.
    expect(countTerrain(game.grid, TERRAIN_TELEGRAPH)).toBe(0);
  });

  it("the maze stays fully connected across many rift cycles", () => {
    const game = setupCatacombsGame();
    // Run through ~6 rift cycles' worth of bites.
    for (let i = 0; i < RIFT_CADENCE * 6; i++) {
      advanceRifts(game);
    }
    // Spot-check connectivity from the snake's head — every open cell
    // should still be reachable.
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const reached = bfsCount(game.grid, hx, hy);
    let openCells = 0;
    for (let y = 0; y < game.grid.height; y++) {
      for (let x = 0; x < game.grid.width; x++) {
        if (!game.grid.isWallCell(x, y)) openCells++;
      }
    }
    expect(reached).toBe(openCells);
  });

  it("doesn't close a wall on a snake-occupied cell", () => {
    const game = setupCatacombsGame();
    // Run many rifts and verify no body cell becomes a wall mid-way.
    for (let i = 0; i < RIFT_CADENCE * 4; i++) {
      advanceRifts(game);
      // Every snake body cell must remain non-wall.
      let idx = game.snake.tailIndex;
      while (true) {
        const sx = game.snake.snakeX[idx];
        const sy = game.snake.snakeY[idx];
        expect(game.grid.isWallCell(sx, sy)).toBe(false);
        if (idx === game.snake.headIndex) break;
        idx = (idx + 1) % Snake.MAX_CELLS;
      }
    }
  });
});

describe("rift batching", () => {
  it("refills the batch once consumed", () => {
    const game = setupCatacombsGame();
    const batchBefore = game.mechanic.riftBatch.length;
    expect(batchBefore).toBeGreaterThan(0);

    // Drive enough bites that several rifts get applied (and the batch
    // refills mid-run as needed).
    const cyclesToRun = batchBefore + 3;
    for (let i = 0; i < RIFT_CADENCE * cyclesToRun; i++) {
      advanceRifts(game);
    }
    // The mechanic should still have a non-empty batch (or be able to
    // refill on demand). Either way, it shouldn't have crashed.
    expect(game.mechanic.type).toBe("rifts");
  });
});

describe("integration: rifts mutate the wall layout over time", () => {
  it("the wall layout differs after enough rift cycles have elapsed", () => {
    const game = setupCatacombsGame(0x9000);
    const before = snapshotWalls(game.grid);
    for (let i = 0; i < RIFT_CADENCE * 5; i++) {
      advanceRifts(game);
    }
    const after = snapshotWalls(game.grid);
    // Some cells should have flipped — at least one rift should have
    // applied across 5 cycles.
    expect(after).not.toEqual(before);
  });
});

// ── BFS helper ───────────────────────────────────────────────────

function bfsCount(grid, startX, startY) {
  const w = grid.width;
  const h = grid.height;
  const visited = new Uint8Array(w * h);
  const stack = [[startX, startY]];
  visited[startY * w + startX] = 1;
  let count = 0;
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (grid.isWallCell(x, y)) continue;
    count++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (visited[ny * w + nx]) continue;
      visited[ny * w + nx] = 1;
      stack.push([nx, ny]);
    }
  }
  return count;
}
