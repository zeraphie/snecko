// catacombs.test.js — tests for the catacombs maze generator (Step 1).

import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";
import { Snake } from "../src/core/snake";
import {
  generateCatacombsGrid,
  advanceCatacombsGrid,
} from "../src/core/generation/catacombs/generator.js";
import { TERRAIN_CATACOMB, TERRAIN_NONE } from "../src/core/grid/constants.js";

function makeGame(actSeed = 0xcafebabe) {
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

function snapshotWalls(grid) {
  const walls = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.isWallCell(x, y)) {
        walls.push(y * grid.width + x);
      }
    }
  }
  return walls;
}

function bfsReachableCells(grid, startX, startY) {
  const w = grid.width;
  const h = grid.height;
  const visited = new Uint8Array(w * h);
  const stack = [[startX, startY]];
  visited[startY * w + startX] = 1;
  let count = 0;
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (grid.isWallCell(x, y)) {
      continue;
    }
    count++;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        continue;
      }
      if (visited[ny * w + nx]) {
        continue;
      }
      visited[ny * w + nx] = 1;
      stack.push([nx, ny]);
    }
  }
  return count;
}

describe("generateCatacombsGrid", () => {
  it("produces a valid 31×31 grid with the snake placed", () => {
    const game = makeGame();
    generateCatacombsGrid(game);

    expect(game.grid.width).toBe(31);
    expect(game.grid.height).toBe(31);

    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    expect(game.grid.isWallCell(hx, hy)).toBe(false);
  });

  it("places food on a non-wall cell", () => {
    const game = makeGame();
    generateCatacombsGrid(game);
    expect(game.grid.foodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.foodY).toBeGreaterThanOrEqual(0);
    expect(game.grid.isWallCell(game.grid.foodX, game.grid.foodY)).toBe(false);
  });

  it("outer border is fully walled (no edge wrap)", () => {
    const game = makeGame();
    generateCatacombsGrid(game);
    const w = game.grid.width;
    const h = game.grid.height;
    for (let x = 0; x < w; x++) {
      expect(game.grid.isWallCell(x, 0)).toBe(true);
      expect(game.grid.isWallCell(x, h - 1)).toBe(true);
    }
    for (let y = 0; y < h; y++) {
      expect(game.grid.isWallCell(0, y)).toBe(true);
      expect(game.grid.isWallCell(w - 1, y)).toBe(true);
    }
  });

  it("every corridor cell is reachable from the snake's head", () => {
    const game = makeGame();
    generateCatacombsGrid(game);
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const reachable = bfsReachableCells(game.grid, hx, hy);

    // Count total non-wall cells in the grid.
    let openCells = 0;
    for (let y = 0; y < game.grid.height; y++) {
      for (let x = 0; x < game.grid.width; x++) {
        if (!game.grid.isWallCell(x, y)) {
          openCells++;
        }
      }
    }
    expect(reachable).toBe(openCells);
  });

  it("snake spawn satisfies the ≥4-straight rule (4 cells forward open)", () => {
    const game = makeGame();
    generateCatacombsGrid(game);

    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    const dx = game.snake.dirX;
    const dy = game.snake.dirY;

    for (let k = 1; k <= 4; k++) {
      const fx = hx + dx * k;
      const fy = hy + dy * k;
      expect(game.grid.isWallCell(fx, fy)).toBe(false);
    }
  });

  it("snake body fits behind the head (no walls underneath the body)", () => {
    const game = makeGame();
    generateCatacombsGrid(game);

    const snake = game.snake;
    let idx = snake.tailIndex;
    while (true) {
      const sx = snake.snakeX[idx];
      const sy = snake.snakeY[idx];
      expect(game.grid.isWallCell(sx, sy)).toBe(false);
      if (idx === snake.headIndex) {
        break;
      }
      idx = (idx + 1) % Snake.MAX_CELLS;
    }
  });

  it("same actSeed produces identical mazes", () => {
    const a = makeGame(0xabcdef12);
    const b = makeGame(0xabcdef12);
    generateCatacombsGrid(a);
    generateCatacombsGrid(b);
    expect(snapshotWalls(a.grid)).toEqual(snapshotWalls(b.grid));
  });

  it("different actSeeds produce different mazes", () => {
    const a = makeGame(0x11111111);
    const b = makeGame(0x22222222);
    generateCatacombsGrid(a);
    generateCatacombsGrid(b);
    expect(snapshotWalls(a.grid)).not.toEqual(snapshotWalls(b.grid));
  });

  it("generator is safe across 30 random actSeeds", () => {
    for (let i = 0; i < 30; i++) {
      const game = makeGame((Math.random() * 0x7fffffff) | 0);
      generateCatacombsGrid(game);

      // Always places snake on a non-wall cell.
      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      expect(game.grid.isWallCell(hx, hy)).toBe(false);
      // Always places food on a non-wall cell.
      expect(game.grid.isWallCell(game.grid.foodX, game.grid.foodY)).toBe(false);
    }
  });
});

describe("extra-loop pass", () => {
  // Counts inter-cell wall openings on a 10×10 cell, period-3 maze.
  // A perfect tree on V=100 vertices has V-1=99 edges. More edges = cycles.
  function countOpenInterCellWalls(grid) {
    const CELLS = 10;
    const PERIOD = 3;
    let count = 0;
    // Vertical inter-cell walls (between (cx,*) and (cx+1,*))
    for (let cy = 0; cy < CELLS; cy++) {
      for (let cx = 0; cx < CELLS - 1; cx++) {
        const wallX = PERIOD * cx + PERIOD;
        if (!grid.isWallCell(wallX, PERIOD * cy + 1) && !grid.isWallCell(wallX, PERIOD * cy + 2)) {
          count++;
        }
      }
    }
    // Horizontal inter-cell walls
    for (let cy = 0; cy < CELLS - 1; cy++) {
      for (let cx = 0; cx < CELLS; cx++) {
        const wallY = PERIOD * cy + PERIOD;
        if (!grid.isWallCell(PERIOD * cx + 1, wallY) && !grid.isWallCell(PERIOD * cx + 2, wallY)) {
          count++;
        }
      }
    }
    return count;
  }

  it("the maze has more open connections than a perfect tree (cycles exist)", () => {
    const game = makeGame();
    generateCatacombsGrid(game);
    const open = countOpenInterCellWalls(game.grid);
    // 10×10 tree = 99 edges. EXTRA_LOOPS = 3 → expect ~102.
    expect(open).toBeGreaterThan(99);
  });

  it("extra-loop count is consistent across actSeeds (close to EXTRA_LOOPS)", () => {
    // Smoke test: across many seeds the count should sit just above 99
    // (tree) + the constant EXTRA_LOOPS, allowing for the rare case where
    // a punched candidate was already open.
    for (let i = 0; i < 5; i++) {
      const game = makeGame((Math.random() * 0x7fffffff) | 0);
      generateCatacombsGrid(game);
      const open = countOpenInterCellWalls(game.grid);
      expect(open).toBeGreaterThanOrEqual(100);
      expect(open).toBeLessThanOrEqual(99 + 3 + 1);
    }
  });
});

describe("spawn polish", () => {
  function forwardRunFromSnake(grid, snake) {
    const hx = snake.snakeX[snake.headIndex];
    const hy = snake.snakeY[snake.headIndex];
    let count = 0;
    for (let i = 1; ; i++) {
      const nx = hx + snake.dirX * i;
      const ny = hy + snake.dirY * i;
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) {
        break;
      }
      if (grid.isWallCell(nx, ny)) {
        break;
      }
      count++;
    }
    return count;
  }

  it("spawn picks among the longest available straight runs across many seeds", () => {
    // Sample 20 seeds and track average forward run. With the polish step
    // the average should comfortably beat the 4-cell floor, since long
    // corridors are common in 10×10 BT mazes.
    let total = 0;
    const n = 20;
    for (let i = 0; i < n; i++) {
      const game = makeGame(0x10000 + i);
      generateCatacombsGrid(game);
      total += forwardRunFromSnake(game.grid, game.snake);
    }
    const avg = total / n;
    expect(avg).toBeGreaterThan(4);
  });
});

describe("advanceCatacombsGrid", () => {
  it("re-places food without crashing", () => {
    const game = makeGame();
    generateCatacombsGrid(game);
    const beforeFoodX = game.grid.foodX;
    const beforeFoodY = game.grid.foodY;

    // Force a different food location by clearing and re-running.
    game.grid.foodX = -1;
    game.grid.foodY = -1;
    advanceCatacombsGrid(game);
    expect(game.grid.foodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.foodY).toBeGreaterThanOrEqual(0);
    expect(game.grid.isWallCell(game.grid.foodX, game.grid.foodY)).toBe(false);

    // Original food position was on a non-wall cell too (sanity).
    expect(game.grid.isWallCell(beforeFoodX, beforeFoodY)).toBe(false);
  });
});

describe("catacomb cobble terrain marker", () => {
  it("paints TERRAIN_CATACOMB on every wall after generate", () => {
    const game = makeGame();
    generateCatacombsGrid(game);
    const grid = game.grid;
    let walls = 0;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.isWallCell(x, y)) {
          walls++;
          expect(grid.terrain[y * grid.width + x]).toBe(TERRAIN_CATACOMB);
        }
      }
    }
    // Sanity — the maze should produce a non-trivial number of walls.
    expect(walls).toBeGreaterThan(50);
  });

  it("leaves corridors at TERRAIN_NONE (catacomb marker is wall-only)", () => {
    const game = makeGame();
    generateCatacombsGrid(game);
    const grid = game.grid;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!grid.isWallCell(x, y)) {
          expect(grid.terrain[y * grid.width + x]).toBe(TERRAIN_NONE);
        }
      }
    }
  });

  it("re-paints walls after advance so rifts-added stamps inherit the marker", () => {
    const game = makeGame();
    generateCatacombsGrid(game);
    // Stale the terrain on every wall to prove `advanceCatacombsGrid`
    // re-paints, not just leaves old values.
    const grid = game.grid;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.isWallCell(x, y)) {
          grid.terrain[y * grid.width + x] = TERRAIN_NONE;
        }
      }
    }
    advanceCatacombsGrid(game);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.isWallCell(x, y)) {
          expect(grid.terrain[y * grid.width + x]).toBe(TERRAIN_CATACOMB);
        }
      }
    }
  });
});
