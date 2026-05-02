// generation.test.js — tests for grid generation, shape placement, and food spawning

import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";
import { Snake } from "../src/core/snake";
import {
  buildReservedSpawnZone,
  buildReservedAroundSnake,
  generateInfluenceMap,
  pickShapesForAct,
  placeFood,
  generateGrid,
  advanceGrid,
} from "../src/core/generation";
import { TERRAIN_TELEGRAPH, TERRAIN_CURRENT } from "../src/core/grid/constants.js";

// Minimal game-like object for generateGrid/advanceGrid
function makeGame() {
  const grid = new Grid(21, 21);
  const snake = new Snake();
  return { grid, snake, score: 0, actIndex: 1 };
}

describe("buildReservedSpawnZone", () => {
  it("marks cells around spawn as reserved", () => {
    const grid = new Grid(21, 21);
    buildReservedSpawnZone(grid, 10, 10, 3, 1, 0);

    expect(grid.isReservedCell(10, 10)).toBe(true);
    expect(grid.isReservedCell(11, 10)).toBe(true);
    expect(grid.isReservedCell(12, 10)).toBe(true);
  });

  it("does not go out of bounds", () => {
    const grid = new Grid(21, 21);
    buildReservedSpawnZone(grid, 1, 1, 3, -1, 0);
    expect(grid.isReservedCell(0, 1)).toBe(true);
  });
});

describe("generateInfluenceMap", () => {
  it("returns normalized values in [0, 1]", () => {
    const grid = new Grid(21, 21);
    const map = generateInfluenceMap(grid);

    expect(map.length).toBe(21 * 21);
    for (let i = 0; i < map.length; i++) {
      expect(map[i]).toBeGreaterThanOrEqual(0);
      expect(map[i]).toBeLessThanOrEqual(1);
    }
  });

  it("contains at least one cell with value 1", () => {
    const grid = new Grid(21, 21);
    const map = generateInfluenceMap(grid);
    let hasMax = false;
    for (let i = 0; i < map.length; i++) {
      if (Math.abs(map[i] - 1) < 0.001) {
        hasMax = true;
      }
    }
    expect(hasMax).toBe(true);
  });
});

describe("pickShapesForAct", () => {
  it("returns 1 shape for boards 1-3", () => {
    for (let b = 1; b <= 3; b++) {
      expect(pickShapesForAct(b).length).toBe(1);
    }
  });

  it("returns 2 shapes for boards 4-8", () => {
    for (let b = 4; b <= 8; b++) {
      expect(pickShapesForAct(b).length).toBe(2);
    }
  });

  it("returns 3+ shapes for boards 9+", () => {
    expect(pickShapesForAct(9).length).toBe(3);
    expect(pickShapesForAct(13).length).toBe(4);
  });
});

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

describe("buildReservedAroundSnake", () => {
  it("reserves cells around snake body", () => {
    const grid = new Grid(21, 21);
    const snake = new Snake();
    snake.init(grid, 10, 10, 3, 1, 0);
    buildReservedAroundSnake(grid, snake);

    expect(grid.isReservedCell(10, 10)).toBe(true);
    expect(grid.isReservedCell(9, 10)).toBe(true);
    expect(grid.isReservedCell(10, 12)).toBe(true);
    expect(grid.isReservedCell(12, 10)).toBe(true);
  });

  it("reserves cells ahead of head", () => {
    const grid = new Grid(21, 21);
    const snake = new Snake();
    snake.init(grid, 10, 10, 3, 1, 0);
    buildReservedAroundSnake(grid, snake);

    expect(grid.isReservedCell(11, 10)).toBe(true);
    expect(grid.isReservedCell(12, 10)).toBe(true);
    expect(grid.isReservedCell(13, 10)).toBe(true);
  });
});

describe("advanceGrid", () => {
  it("preserves existing walls", () => {
    const game = makeGame();
    generateGrid(game);

    let wallsBefore = 0;
    for (let y = 0; y < game.grid.height; y++) {
      for (let x = 0; x < game.grid.width; x++) {
        if (game.grid.isWallCell(x, y)) {
          wallsBefore++;
        }
      }
    }

    game.actIndex = 2;
    advanceGrid(game);

    let wallsAfter = 0;
    for (let y = 0; y < game.grid.height; y++) {
      for (let x = 0; x < game.grid.width; x++) {
        if (game.grid.isWallCell(x, y)) {
          wallsAfter++;
        }
      }
    }

    expect(wallsAfter).toBeGreaterThanOrEqual(wallsBefore);
  });

  it("preserves snake position", () => {
    const game = makeGame();
    generateGrid(game);

    const headBefore = {
      x: game.snake.snakeX[game.snake.headIndex],
      y: game.snake.snakeY[game.snake.headIndex],
    };

    game.actIndex = 2;
    advanceGrid(game);

    expect(game.snake.snakeX[game.snake.headIndex]).toBe(headBefore.x);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(headBefore.y);
  });

  it("places new food on unblocked cell", () => {
    const game = makeGame();
    generateGrid(game);
    game.actIndex = 2;
    advanceGrid(game);

    expect(game.grid.foodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.foodY).toBeGreaterThanOrEqual(0);
    expect(game.grid.isBlockedCell(game.grid.foodX, game.grid.foodY)).toBe(false);
  });

  it("does not place walls on snake", () => {
    for (let i = 0; i < 30; i++) {
      const game = makeGame();
      generateGrid(game);
      game.actIndex = 2;
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
  });
});

describe("generateGrid", () => {
  it("produces a valid grid with snake and food", () => {
    const game = makeGame();
    generateGrid(game);

    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];

    expect(game.grid.isWallCell(hx, hy)).toBe(false);
    expect(game.grid.foodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.foodY).toBeGreaterThanOrEqual(0);
    expect(game.grid.isWallCell(game.grid.foodX, game.grid.foodY)).toBe(false);
    expect(game.grid.isSnakeCell(game.grid.foodX, game.grid.foodY)).toBe(false);
  });

  it("is safe across 50 random boards", () => {
    for (let i = 0; i < 50; i++) {
      const game = makeGame();
      game.actIndex = 1 + Math.floor(Math.random() * 15);
      game.snake.snakeLength = 3 + Math.floor(Math.random() * 8);
      generateGrid(game);

      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      expect(game.grid.isWallCell(hx, hy)).toBe(false);
      expect(game.grid.isBlockedCell(game.grid.foodX, game.grid.foodY)).toBe(false);
    }
  });
});

describe("placeFood avoids terrain", () => {
  it("does not place food on telegraph cells", () => {
    const grid = new Grid(21, 21);
    // Fill most of the grid with telegraph terrain, leaving a few cells open
    const w = grid.width;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        grid.terrain[y * w + x] = TERRAIN_TELEGRAPH;
      }
    }
    // Clear a small area
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
    // Clear a small area
    // oxlint-disable-next-line oxc/erasing-op
    grid.terrain[0 * w + 0] = 0;

    placeFood(grid);
    const t = grid.terrain[grid.foodY * w + grid.foodX];
    expect(t).not.toBe(TERRAIN_CURRENT);
  });
});
