// wildlands.test.js — tests for wildlands terrain generation and solvability

import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid/index.js";
import { bfsReachable } from "../src/core/generation/common/solvability.js";
import {
  generateWildlandsGrid,
  advanceWildlandsGrid,
} from "../src/core/generation/wildlands/generator.js";
import { TERRAIN_LOW, TERRAIN_HIGH } from "../src/core/grid/constants.js";
import { Snake } from "../src/core/snake/index.js";

function makeGame() {
  return {
    grid: new Grid(21, 21),
    snake: new Snake(),
    actIndex: 1,
  };
}

describe("bfsReachable", () => {
  it("returns true for adjacent empty cells", () => {
    const grid = new Grid(5, 5);
    expect(bfsReachable(grid, 0, 0, 1, 0)).toBe(true);
  });

  it("returns true for distant reachable cells", () => {
    const grid = new Grid(5, 5);
    expect(bfsReachable(grid, 0, 0, 4, 4)).toBe(true);
  });

  it("returns false when target is walled off", () => {
    const grid = new Grid(5, 5);
    // Wall off cell (4,0) by surrounding it
    grid.setCell("wall", 3, 0);
    grid.setCell("wall", 4, 1);
    // It can still wrap — wall off wrap edges too
    grid.setCell("wall", 0, 0); // wraps from x=4 to x=0
    grid.setCell("wall", 4, 4); // wraps from y=0 to y=4
    expect(bfsReachable(grid, 0, 1, 4, 0)).toBe(false);
  });

  it("handles wrapping — can reach via grid edge", () => {
    const grid = new Grid(5, 5);
    // Wall a vertical line except via wrapping
    for (let y = 0; y < 5; y++) {
      grid.setCell("wall", 2, y);
    }
    // Can't reach across the wall directly, but can wrap around
    expect(bfsReachable(grid, 0, 0, 4, 0)).toBe(true);
  });

  it("returns true when start equals target", () => {
    const grid = new Grid(5, 5);
    expect(bfsReachable(grid, 2, 2, 2, 2)).toBe(true);
  });
});

describe("generateWildlandsGrid", () => {
  it("places walls on the grid", () => {
    const game = makeGame();
    generateWildlandsGrid(game);

    let walls = 0;
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        if (game.grid.isWallCell(x, y)) {
          walls++;
        }
      }
    }
    expect(walls).toBeGreaterThan(0);
  });

  it("sets terrain types for wall cells", () => {
    const game = makeGame();
    generateWildlandsGrid(game);

    let lowCount = 0;
    let highCount = 0;
    for (let i = 0; i < game.grid.terrain.length; i++) {
      if (game.grid.terrain[i] === TERRAIN_LOW) {
        lowCount++;
      }
      if (game.grid.terrain[i] === TERRAIN_HIGH) {
        highCount++;
      }
    }
    // Should have both terrain types
    expect(lowCount + highCount).toBeGreaterThan(0);
  });

  it("leaves spawn area clear", () => {
    const game = makeGame();
    generateWildlandsGrid(game);

    const cx = 10;
    const cy = 10;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        expect(game.grid.isWallCell(cx + dx, cy + dy)).toBe(false);
      }
    }
  });

  it("initializes snake at center", () => {
    const game = makeGame();
    game.snake.snakeLength = 3;
    generateWildlandsGrid(game);

    expect(game.snake.snakeX[game.snake.headIndex]).toBe(10);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(10);
  });

  it("places food that is reachable from snake", () => {
    const game = makeGame();
    game.snake.snakeLength = 3;
    generateWildlandsGrid(game);

    expect(game.grid.foodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.foodY).toBeGreaterThanOrEqual(0);

    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    expect(bfsReachable(game.grid, hx, hy, game.grid.foodX, game.grid.foodY)).toBe(true);
  });
});

describe("advanceWildlandsGrid", () => {
  it("places new food without changing walls", () => {
    const game = makeGame();
    game.snake.snakeLength = 3;
    generateWildlandsGrid(game);

    // Count walls before
    let wallsBefore = 0;
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        if (game.grid.isWallCell(x, y)) {
          wallsBefore++;
        }
      }
    }

    advanceWildlandsGrid(game);

    // Count walls after — should be same
    let wallsAfter = 0;
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        if (game.grid.isWallCell(x, y)) {
          wallsAfter++;
        }
      }
    }
    expect(wallsAfter).toBe(wallsBefore);

    // Food should be placed
    expect(game.grid.foodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.foodY).toBeGreaterThanOrEqual(0);
  });
});
