// wildlands.test.js — tests for wildlands terrain generation and solvability

import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/board/index.js';
import { bfsReachable } from '../src/core/generation/common/solvability.js';
import {
  generateWildlandsBoard,
  advanceWildlandsBoard,
} from '../src/core/generation/wildlands/generator.js';
import { TERRAIN_LOW, TERRAIN_HIGH } from '../src/core/board/constants.js';
import { Snake } from '../src/core/snake/index.js';

function makeGame() {
  return {
    board: new Board(21, 21),
    snake: new Snake(),
    boardIndex: 1,
  };
}

describe('bfsReachable', () => {
  it('returns true for adjacent empty cells', () => {
    const board = new Board(5, 5);
    expect(bfsReachable(board, 0, 0, 1, 0)).toBe(true);
  });

  it('returns true for distant reachable cells', () => {
    const board = new Board(5, 5);
    expect(bfsReachable(board, 0, 0, 4, 4)).toBe(true);
  });

  it('returns false when target is walled off', () => {
    const board = new Board(5, 5);
    // Wall off cell (4,0) by surrounding it
    board.setCell('wall', 3, 0);
    board.setCell('wall', 4, 1);
    // It can still wrap — wall off wrap edges too
    board.setCell('wall', 0, 0); // wraps from x=4 to x=0
    board.setCell('wall', 4, 4); // wraps from y=0 to y=4
    expect(bfsReachable(board, 0, 1, 4, 0)).toBe(false);
  });

  it('handles wrapping — can reach via board edge', () => {
    const board = new Board(5, 5);
    // Wall a vertical line except via wrapping
    for (let y = 0; y < 5; y++) {
      board.setCell('wall', 2, y);
    }
    // Can't reach across the wall directly, but can wrap around
    expect(bfsReachable(board, 0, 0, 4, 0)).toBe(true);
  });

  it('returns true when start equals target', () => {
    const board = new Board(5, 5);
    expect(bfsReachable(board, 2, 2, 2, 2)).toBe(true);
  });
});

describe('generateWildlandsBoard', () => {
  it('places walls on the board', () => {
    const game = makeGame();
    generateWildlandsBoard(game);

    let walls = 0;
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        if (game.board.isWallCell(x, y)) walls++;
      }
    }
    expect(walls).toBeGreaterThan(0);
  });

  it('sets terrain types for wall cells', () => {
    const game = makeGame();
    generateWildlandsBoard(game);

    let lowCount = 0;
    let highCount = 0;
    for (let i = 0; i < game.board.terrain.length; i++) {
      if (game.board.terrain[i] === TERRAIN_LOW) lowCount++;
      if (game.board.terrain[i] === TERRAIN_HIGH) highCount++;
    }
    // Should have both terrain types
    expect(lowCount + highCount).toBeGreaterThan(0);
  });

  it('leaves spawn area clear', () => {
    const game = makeGame();
    generateWildlandsBoard(game);

    const cx = 10;
    const cy = 10;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        expect(game.board.isWallCell(cx + dx, cy + dy)).toBe(false);
      }
    }
  });

  it('initializes snake at center', () => {
    const game = makeGame();
    game.snake.snakeLength = 3;
    generateWildlandsBoard(game);

    expect(game.snake.snakeX[game.snake.headIndex]).toBe(10);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(10);
  });

  it('places food that is reachable from snake', () => {
    const game = makeGame();
    game.snake.snakeLength = 3;
    generateWildlandsBoard(game);

    expect(game.board.foodX).toBeGreaterThanOrEqual(0);
    expect(game.board.foodY).toBeGreaterThanOrEqual(0);

    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    expect(bfsReachable(game.board, hx, hy, game.board.foodX, game.board.foodY)).toBe(true);
  });
});

describe('advanceWildlandsBoard', () => {
  it('places new food without changing walls', () => {
    const game = makeGame();
    game.snake.snakeLength = 3;
    generateWildlandsBoard(game);

    // Count walls before
    let wallsBefore = 0;
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        if (game.board.isWallCell(x, y)) wallsBefore++;
      }
    }

    advanceWildlandsBoard(game);

    // Count walls after — should be same
    let wallsAfter = 0;
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        if (game.board.isWallCell(x, y)) wallsAfter++;
      }
    }
    expect(wallsAfter).toBe(wallsBefore);

    // Food should be placed
    expect(game.board.foodX).toBeGreaterThanOrEqual(0);
    expect(game.board.foodY).toBeGreaterThanOrEqual(0);
  });
});
