// snake.js — Ring-buffer snake with movement and collision

import { MAX_CELLS } from './constants.js';
import { setNextDirection, step } from './movement.js';

// ── Snake class ────────────────────────────────────────

/**
 * Ring-buffer snake with fixed-size Int16Array storage.
 * Movement and growth are handled via prototype methods from movement.js.
 */
export class Snake {
  constructor() {
    this.snakeX = new Int16Array(MAX_CELLS);
    this.snakeY = new Int16Array(MAX_CELLS);
    this.headIndex = 0;
    this.tailIndex = 0;
    this.snakeLength = 0;
    this.dirX = 1;
    this.dirY = 0;
    this.nextDirX = 1;
    this.nextDirY = 0;
    this.growing = false;
    this.alive = true;
    this.deathCause = null;
  }

  /**
   * Places the snake on the board at the given spawn point.
   *
   * @param {import('../board/index.js').Board} board
   * @param {number} spawnX
   * @param {number} spawnY
   * @param {number} length — initial body length
   * @param {number} dx — initial direction X
   * @param {number} dy — initial direction Y
   */
  init(board, spawnX, spawnY, length, dx, dy) {
    this.dirX = dx;
    this.dirY = dy;
    this.nextDirX = dx;
    this.nextDirY = dy;
    this.snakeLength = length;
    this.growing = false;
    this.alive = true;
    this.deathCause = null;

    this.headIndex = length - 1;
    this.tailIndex = 0;

    for (let i = 0; i < length; i++) {
      const x = spawnX - dx * (length - 1 - i);
      const y = spawnY - dy * (length - 1 - i);
      this.snakeX[i] = x;
      this.snakeY[i] = y;
      board.setCell('snake', x, y);
    }
  }
}

// ── Prototype methods ──────────────────────────────────
Snake.prototype.setNextDirection = setNextDirection;
Snake.prototype.step = step;

Snake.MAX_CELLS = MAX_CELLS;
