// movement.js — Direction setting and step logic

import { MAX_CELLS } from "./constants.js";
import { DEATH_WALL, DEATH_SELF } from "../game/constants.js";

/** Maximum entries beyond `nextDirX/Y` allowed in the buffered direction queue. */
const DIR_QUEUE_DEPTH = 1;

/**
 * Queues a direction change for an upcoming tick. The snake holds a
 * single-tick "next direction" (`nextDirX/Y`) plus a small follow-up queue
 * (`dirQueue`), so rapid input bursts (zigzags through tight corridors)
 * aren't collapsed by latest-wins overwrites. Effective depth is 2 — one
 * pre-loaded turn plus one buffered follow-up.
 *
 * Drops zero vectors, 180° reversals against the *effective last queued
 * direction* (so a reversal can't sneak in between two queued turns), and
 * same-direction repeats. Drops the new input on overflow rather than
 * evicting an earlier one — players overshoot, they don't change their
 * minds at the back of the queue.
 *
 * @param {number} dx
 * @param {number} dy
 */
export function setNextDirection(dx, dy) {
  if (dx === 0 && dy === 0) {
    return;
  }

  // Effective last direction the snake will be facing when this new input
  // would actually be consumed. Walks the queue tail-first.
  let lastDx;
  let lastDy;
  if (this.dirQueue.length > 0) {
    const tail = this.dirQueue[this.dirQueue.length - 1];
    lastDx = tail.dx;
    lastDy = tail.dy;
  } else {
    lastDx = this.nextDirX;
    lastDy = this.nextDirY;
  }

  // 180° reversal against the effective last direction → would self-collide.
  if (dx === -lastDx && dy === -lastDy) {
    return;
  }
  // Same as the effective last direction → nothing new to record.
  if (dx === lastDx && dy === lastDy) {
    return;
  }

  // `nextDirX/Y` is "stale" when it still equals the just-executed direction
  // (queue was empty going into the last tick). In that case we can land
  // the new input directly there instead of using a queue slot.
  const nextIsStale =
    this.dirQueue.length === 0 && this.nextDirX === this.dirX && this.nextDirY === this.dirY;
  if (nextIsStale) {
    this.nextDirX = dx;
    this.nextDirY = dy;
    return;
  }

  // `nextDirX/Y` already holds a pending change. Append to the queue.
  if (this.dirQueue.length >= DIR_QUEUE_DEPTH) {
    return; // overflow — drop the new input
  }
  this.dirQueue.push({ dx, dy });
}

/**
 * Advances the snake one cell in the current direction. Handles wrapping,
 * collision detection, food consumption, and growth.
 *
 * @param {import('../grid/index.js').Grid} grid
 * @returns {"ok"|"food"|"boss-food"|"wall"|"self"|"dead"} — outcome of the step
 */
export function step(grid) {
  if (!this.alive) {
    return "dead";
  }

  this.dirX = this.nextDirX;
  this.dirY = this.nextDirY;

  // Drain one buffered entry into `nextDirX/Y` so the upcoming tick
  // consumes it. If the queue is empty `nextDirX/Y` stays equal to
  // `dirX/Y` — i.e., the snake continues straight.
  if (this.dirQueue.length > 0) {
    const next = this.dirQueue.shift();
    this.nextDirX = next.dx;
    this.nextDirY = next.dy;
  }

  const hx = this.snakeX[this.headIndex];
  const hy = this.snakeY[this.headIndex];
  let nx = hx + this.dirX;
  let ny = hy + this.dirY;

  // Wrap around edges
  if (nx < 0) {
    nx = grid.width - 1;
  } else if (nx >= grid.width) {
    nx = 0;
  }
  if (ny < 0) {
    ny = grid.height - 1;
  } else if (ny >= grid.height) {
    ny = 0;
  }

  if (grid.isWallCell(nx, ny)) {
    this.alive = false;
    this.deathCause = DEATH_WALL;
    return "wall";
  }

  const tailX = this.snakeX[this.tailIndex];
  const tailY = this.snakeY[this.tailIndex];
  const tailWillVacate = !this.growing && nx === tailX && ny === tailY;

  if (grid.isSnakeCell(nx, ny) && !tailWillVacate) {
    this.alive = false;
    this.deathCause = DEATH_SELF;
    return "self";
  }

  const ateFood = nx === grid.foodX && ny === grid.foodY;
  const ateBossFood = nx === grid.bossFoodX && ny === grid.bossFoodY;

  this.headIndex = (this.headIndex + 1) % MAX_CELLS;
  this.snakeX[this.headIndex] = nx;
  this.snakeY[this.headIndex] = ny;
  grid.setCell("snake", nx, ny);

  if (this.growing) {
    this.growing = false;
    this.snakeLength++;
  } else {
    grid.clearCell("snake", tailX, tailY);
    this.tailIndex = (this.tailIndex + 1) % MAX_CELLS;
  }

  if (ateBossFood) {
    grid.bossFoodX = -1;
    grid.bossFoodY = -1;
    return "boss-food";
  }

  if (ateFood) {
    this.growing = true;
    grid.foodX = -1;
    grid.foodY = -1;
    return "food";
  }

  return "ok";
}
