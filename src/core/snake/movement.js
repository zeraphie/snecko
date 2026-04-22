// movement.js — Direction setting and step logic

import { MAX_CELLS } from "./constants.js";
import { DEATH_WALL, DEATH_SELF } from "../game/constants.js";

/**
 * Queues a direction change for the next tick. Ignores reversals and zero vectors.
 *
 * @param {number} dx
 * @param {number} dy
 */
export function setNextDirection(dx, dy) {
  if (dx === -this.dirX && dy === -this.dirY) {
    return;
  }
  if (dx === 0 && dy === 0) {
    return;
  }
  this.nextDirX = dx;
  this.nextDirY = dy;
}

/**
 * Advances the snake one cell in the current direction. Handles wrapping,
 * collision detection, food consumption, and growth.
 *
 * @param {import('../board/index.js').Board} board
 * @returns {"ok"|"food"|"boss-food"|"wall"|"self"|"dead"} — outcome of the step
 */
export function step(board) {
  if (!this.alive) {
    return "dead";
  }

  this.dirX = this.nextDirX;
  this.dirY = this.nextDirY;

  const hx = this.snakeX[this.headIndex];
  const hy = this.snakeY[this.headIndex];
  let nx = hx + this.dirX;
  let ny = hy + this.dirY;

  // Wrap around edges
  if (nx < 0) {
    nx = board.width - 1;
  } else if (nx >= board.width) {
    nx = 0;
  }
  if (ny < 0) {
    ny = board.height - 1;
  } else if (ny >= board.height) {
    ny = 0;
  }

  if (board.isWallCell(nx, ny)) {
    this.alive = false;
    this.deathCause = DEATH_WALL;
    return "wall";
  }

  const tailX = this.snakeX[this.tailIndex];
  const tailY = this.snakeY[this.tailIndex];
  const tailWillVacate = !this.growing && nx === tailX && ny === tailY;

  if (board.isSnakeCell(nx, ny) && !tailWillVacate) {
    this.alive = false;
    this.deathCause = DEATH_SELF;
    return "self";
  }

  const ateFood = nx === board.foodX && ny === board.foodY;
  const ateBossFood = nx === board.bossFoodX && ny === board.bossFoodY;

  this.headIndex = (this.headIndex + 1) % MAX_CELLS;
  this.snakeX[this.headIndex] = nx;
  this.snakeY[this.headIndex] = ny;
  board.setCell("snake", nx, ny);

  if (this.growing) {
    this.growing = false;
    this.snakeLength++;
  } else {
    board.clearCell("snake", tailX, tailY);
    this.tailIndex = (this.tailIndex + 1) % MAX_CELLS;
  }

  if (ateBossFood) {
    board.bossFoodX = -1;
    board.bossFoodY = -1;
    return "boss-food";
  }

  if (ateFood) {
    this.growing = true;
    board.foodX = -1;
    board.foodY = -1;
    return "food";
  }

  return "ok";
}
