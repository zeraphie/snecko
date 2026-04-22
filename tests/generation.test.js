// generation.test.js — tests for board generation, shape placement, and food spawning

import { describe, it, expect } from "vitest";
import { Board } from "../src/core/board";
import { Snake } from "../src/core/snake";
import {
  buildReservedSpawnZone,
  buildReservedAroundSnake,
  generateInfluenceMap,
  pickShapesForBoard,
  placeFood,
  generateBoard,
  advanceBoard,
} from "../src/core/generation";
import { TERRAIN_TELEGRAPH, TERRAIN_CURRENT } from "../src/core/board/constants.js";

// Minimal game-like object for generateBoard/advanceBoard
function makeGame() {
  const board = new Board(21, 21);
  const snake = new Snake();
  return { board, snake, score: 0, boardIndex: 1 };
}

describe("buildReservedSpawnZone", () => {
  it("marks cells around spawn as reserved", () => {
    const board = new Board(21, 21);
    buildReservedSpawnZone(board, 10, 10, 3, 1, 0);

    expect(board.isReservedCell(10, 10)).toBe(true);
    expect(board.isReservedCell(11, 10)).toBe(true);
    expect(board.isReservedCell(12, 10)).toBe(true);
  });

  it("does not go out of bounds", () => {
    const board = new Board(21, 21);
    buildReservedSpawnZone(board, 1, 1, 3, -1, 0);
    expect(board.isReservedCell(0, 1)).toBe(true);
  });
});

describe("generateInfluenceMap", () => {
  it("returns normalized values in [0, 1]", () => {
    const board = new Board(21, 21);
    const map = generateInfluenceMap(board);

    expect(map.length).toBe(21 * 21);
    for (let i = 0; i < map.length; i++) {
      expect(map[i]).toBeGreaterThanOrEqual(0);
      expect(map[i]).toBeLessThanOrEqual(1);
    }
  });

  it("contains at least one cell with value 1", () => {
    const board = new Board(21, 21);
    const map = generateInfluenceMap(board);
    let hasMax = false;
    for (let i = 0; i < map.length; i++) {
      if (Math.abs(map[i] - 1) < 0.001) {
        hasMax = true;
      }
    }
    expect(hasMax).toBe(true);
  });
});

describe("pickShapesForBoard", () => {
  it("returns 1 shape for boards 1-3", () => {
    for (let b = 1; b <= 3; b++) {
      expect(pickShapesForBoard(b).length).toBe(1);
    }
  });

  it("returns 2 shapes for boards 4-8", () => {
    for (let b = 4; b <= 8; b++) {
      expect(pickShapesForBoard(b).length).toBe(2);
    }
  });

  it("returns 3+ shapes for boards 9+", () => {
    expect(pickShapesForBoard(9).length).toBe(3);
    expect(pickShapesForBoard(13).length).toBe(4);
  });
});

describe("placeFood", () => {
  it("places food on an unblocked cell", () => {
    const board = new Board(21, 21);
    const snake = new Snake();
    snake.init(board, 10, 10, 3, 1, 0);
    placeFood(board);

    expect(board.foodX).toBeGreaterThanOrEqual(0);
    expect(board.foodY).toBeGreaterThanOrEqual(0);
    expect(board.isBlockedCell(board.foodX, board.foodY)).toBe(false);
  });
});

describe("buildReservedAroundSnake", () => {
  it("reserves cells around snake body", () => {
    const board = new Board(21, 21);
    const snake = new Snake();
    snake.init(board, 10, 10, 3, 1, 0);
    buildReservedAroundSnake(board, snake);

    expect(board.isReservedCell(10, 10)).toBe(true);
    expect(board.isReservedCell(9, 10)).toBe(true);
    expect(board.isReservedCell(10, 12)).toBe(true);
    expect(board.isReservedCell(12, 10)).toBe(true);
  });

  it("reserves cells ahead of head", () => {
    const board = new Board(21, 21);
    const snake = new Snake();
    snake.init(board, 10, 10, 3, 1, 0);
    buildReservedAroundSnake(board, snake);

    expect(board.isReservedCell(11, 10)).toBe(true);
    expect(board.isReservedCell(12, 10)).toBe(true);
    expect(board.isReservedCell(13, 10)).toBe(true);
  });
});

describe("advanceBoard", () => {
  it("preserves existing walls", () => {
    const game = makeGame();
    generateBoard(game);

    let wallsBefore = 0;
    for (let y = 0; y < game.board.height; y++) {
      for (let x = 0; x < game.board.width; x++) {
        if (game.board.isWallCell(x, y)) {
          wallsBefore++;
        }
      }
    }

    game.boardIndex = 2;
    advanceBoard(game);

    let wallsAfter = 0;
    for (let y = 0; y < game.board.height; y++) {
      for (let x = 0; x < game.board.width; x++) {
        if (game.board.isWallCell(x, y)) {
          wallsAfter++;
        }
      }
    }

    expect(wallsAfter).toBeGreaterThanOrEqual(wallsBefore);
  });

  it("preserves snake position", () => {
    const game = makeGame();
    generateBoard(game);

    const headBefore = {
      x: game.snake.snakeX[game.snake.headIndex],
      y: game.snake.snakeY[game.snake.headIndex],
    };

    game.boardIndex = 2;
    advanceBoard(game);

    expect(game.snake.snakeX[game.snake.headIndex]).toBe(headBefore.x);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(headBefore.y);
  });

  it("places new food on unblocked cell", () => {
    const game = makeGame();
    generateBoard(game);
    game.boardIndex = 2;
    advanceBoard(game);

    expect(game.board.foodX).toBeGreaterThanOrEqual(0);
    expect(game.board.foodY).toBeGreaterThanOrEqual(0);
    expect(game.board.isBlockedCell(game.board.foodX, game.board.foodY)).toBe(false);
  });

  it("does not place walls on snake", () => {
    for (let i = 0; i < 30; i++) {
      const game = makeGame();
      generateBoard(game);
      game.boardIndex = 2;
      advanceBoard(game);

      let idx = game.snake.tailIndex;
      while (true) {
        const sx = game.snake.snakeX[idx];
        const sy = game.snake.snakeY[idx];
        expect(game.board.isWallCell(sx, sy)).toBe(false);
        if (idx === game.snake.headIndex) {
          break;
        }
        idx = (idx + 1) % Snake.MAX_CELLS;
      }
    }
  });
});

describe("generateBoard", () => {
  it("produces a valid board with snake and food", () => {
    const game = makeGame();
    generateBoard(game);

    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];

    expect(game.board.isWallCell(hx, hy)).toBe(false);
    expect(game.board.foodX).toBeGreaterThanOrEqual(0);
    expect(game.board.foodY).toBeGreaterThanOrEqual(0);
    expect(game.board.isWallCell(game.board.foodX, game.board.foodY)).toBe(false);
    expect(game.board.isSnakeCell(game.board.foodX, game.board.foodY)).toBe(false);
  });

  it("is safe across 50 random boards", () => {
    for (let i = 0; i < 50; i++) {
      const game = makeGame();
      game.boardIndex = 1 + Math.floor(Math.random() * 15);
      game.snake.snakeLength = 3 + Math.floor(Math.random() * 8);
      generateBoard(game);

      const hx = game.snake.snakeX[game.snake.headIndex];
      const hy = game.snake.snakeY[game.snake.headIndex];
      expect(game.board.isWallCell(hx, hy)).toBe(false);
      expect(game.board.isBlockedCell(game.board.foodX, game.board.foodY)).toBe(false);
    }
  });
});

describe("placeFood avoids terrain", () => {
  it("does not place food on telegraph cells", () => {
    const board = new Board(21, 21);
    // Fill most of the board with telegraph terrain, leaving a few cells open
    const w = board.width;
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        board.terrain[y * w + x] = TERRAIN_TELEGRAPH;
      }
    }
    // Clear a small area
    // oxlint-disable-next-line oxc/erasing-op
    board.terrain[0 * w + 0] = 0;
    // oxlint-disable-next-line oxc/erasing-op
    board.terrain[0 * w + 1] = 0;

    placeFood(board);
    const t = board.terrain[board.foodY * w + board.foodX];
    expect(t).not.toBe(TERRAIN_TELEGRAPH);
  });

  it("does not place food on current cells", () => {
    const board = new Board(21, 21);
    const w = board.width;
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        board.terrain[y * w + x] = TERRAIN_CURRENT;
      }
    }
    // Clear a small area
    // oxlint-disable-next-line oxc/erasing-op
    board.terrain[0 * w + 0] = 0;

    placeFood(board);
    const t = board.terrain[board.foodY * w + board.foodX];
    expect(t).not.toBe(TERRAIN_CURRENT);
  });
});
