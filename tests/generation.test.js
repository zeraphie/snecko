// generation.test.js — tests for grid generation, food placement, and the
// lattice hand-off. The grid starts empty of walls; crystals arrive via the
// lattice lifecycle, not via initial layout.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";
import { Snake } from "../src/core/snake";
import { placeFood, generateGrid, advanceGrid } from "../src/core/generation";
import { buildCrystals } from "../src/core/generation/crystalline/crystals.js";
import { TERRAIN_TELEGRAPH, TERRAIN_CURRENT } from "../src/core/grid/constants.js";

const SHAPES_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/core/generation/crystalline/crystals.shapes"
);
const CRYSTALS = buildCrystals(readFileSync(SHAPES_PATH, "utf-8"));

function makeGame() {
  const grid = new Grid(21, 21);
  const snake = new Snake();
  return {
    grid,
    snake,
    score: 0,
    actIndex: 1,
    actSeed: 0xcafebabe,
    manifest: { crystals: CRYSTALS },
  };
}

describe("placeFood", () => {
  it("places food on an unblocked cell", () => {
    const grid = new Grid(21, 21);
    const snake = new Snake();
    snake.init(grid, 10, 10, 3, 1, 0);
    placeFood(grid);

    expect(grid.foodX).toBeGreaterThanOrEqual(0);
    expect(grid.foodY).toBeGreaterThanOrEqual(0);
    expect(grid.isBlockedCell(grid.foodX, grid.foodY)).toBe(false);
  });
});

describe("generateGrid", () => {
  it("produces a valid grid with snake and food and no initial walls", () => {
    const game = makeGame();
    generateGrid(game);

    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];

    expect(game.grid.isWallCell(hx, hy)).toBe(false);
    expect(game.grid.foodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.foodY).toBeGreaterThanOrEqual(0);
    expect(game.grid.isWallCell(game.grid.foodX, game.grid.foodY)).toBe(false);
    expect(game.grid.isSnakeCell(game.grid.foodX, game.grid.foodY)).toBe(false);

    let wallCount = 0;
    for (let y = 0; y < game.grid.height; y++) {
      for (let x = 0; x < game.grid.width; x++) {
        if (game.grid.isWallCell(x, y)) {
          wallCount++;
        }
      }
    }
    expect(wallCount).toBe(0);
  });

  it("hands off to the lattice with no active crystals yet", () => {
    const game = makeGame();
    generateGrid(game);
    expect(game.mechanic.type).toBe("lattice");
    expect(game.mechanic.crystals).toEqual([]);
  });

  it("is safe across 50 random configurations", () => {
    for (let i = 0; i < 50; i++) {
      const game = makeGame();
      game.actIndex = 1 + Math.floor(Math.random() * 15);
      game.actSeed = (Math.random() * 0x7fffffff) | 0;
      game.snake.snakeLength = 3 + Math.floor(Math.random() * 8);
      generateGrid(game);

      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      expect(game.grid.isWallCell(hx, hy)).toBe(false);
      expect(game.grid.isBlockedCell(game.grid.foodX, game.grid.foodY)).toBe(false);
    }
  });
});

describe("advanceGrid", () => {
  it("does not destroy snake position", () => {
    const game = makeGame();
    generateGrid(game);

    const headBefore = {
      x: game.snake.snakeX[game.snake.headIndex],
      y: game.snake.snakeY[game.snake.headIndex],
    };

    advanceGrid(game);

    expect(game.snake.snakeX[game.snake.headIndex]).toBe(headBefore.x);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(headBefore.y);
  });

  it("places food on an unblocked cell each call", () => {
    const game = makeGame();
    generateGrid(game);
    advanceGrid(game);

    expect(game.grid.foodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.foodY).toBeGreaterThanOrEqual(0);
    expect(game.grid.isBlockedCell(game.grid.foodX, game.grid.foodY)).toBe(false);
  });

  it("never stamps a wall on a snake cell across many advances", () => {
    // Drives 10 lifecycles' worth of advances; the lattice's place + grow
    // steps must skip cells the snake currently occupies.
    for (let trial = 0; trial < 10; trial++) {
      const game = makeGame();
      game.actSeed = 0x10000 + trial;
      generateGrid(game);

      for (let i = 0; i < 14; i++) {
        advanceGrid(game);
        let idx = game.snake.tailIndex;
        while (true) {
          const sx = game.snake.snakeX[idx];
          const sy = game.snake.snakeY[idx];
          expect(game.grid.isWallCell(sx, sy)).toBe(false);
          if (idx === game.snake.headIndex) {
            break;
          }
          idx = (idx + 1) % Snake.MAX_CELLS;
        }
      }
    }
  });
});

describe("placeFood avoids terrain", () => {
  it("does not place food on telegraph cells", () => {
    const grid = new Grid(21, 21);
    const w = grid.width;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        grid.terrain[y * w + x] = TERRAIN_TELEGRAPH;
      }
    }
    // oxlint-disable-next-line oxc/erasing-op
    grid.terrain[0 * w + 0] = 0;
    // oxlint-disable-next-line oxc/erasing-op
    grid.terrain[0 * w + 1] = 0;

    placeFood(grid);
    const t = grid.terrain[grid.foodY * w + grid.foodX];
    expect(t).not.toBe(TERRAIN_TELEGRAPH);
  });

  it("does not place food on current cells", () => {
    const grid = new Grid(21, 21);
    const w = grid.width;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        grid.terrain[y * w + x] = TERRAIN_CURRENT;
      }
    }
    // oxlint-disable-next-line oxc/erasing-op
    grid.terrain[0 * w + 0] = 0;

    placeFood(grid);
    const t = grid.terrain[grid.foodY * w + grid.foodX];
    expect(t).not.toBe(TERRAIN_CURRENT);
  });
});
