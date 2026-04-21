// tick.js — Tick loop, food handling, tick speed calculation

import { generateDraftPool } from '../upgrades/draft.js';
import { applySlowTime } from '../upgrades/passives/slow-time.js';
import { applyIronJaw } from '../upgrades/passives/iron-jaw.js';
import { applyWormholeTeleport } from '../upgrades/consumables/wormhole.js';
import { applyCurrentDrift } from '../mechanics/currents.js';
import {
  STATE_PLAYING,
  STATE_DRAFT,
  STATE_DEAD,
  BASE_TICK_MS,
  MIN_TICK_MS,
  TICK_DECREASE_PER_BOARD,
} from './constants.js';

/** Runs one game tick if enough time has elapsed. Handles movement, food, drift, and death. */
export function tick() {
  if (this.state !== STATE_PLAYING) {
    return;
  }

  const now = Date.now();
  if (now - this.lastTickTime < this.tickMs) {
    return;
  }
  this.lastTickTime = now;
  this.runTime = (now - this.startTime) / 1000;

  applyIronJaw(this);

  const result = this.snake.step(this.board);

  if (result === 'food') {
    applyWormholeTeleport(this);
    this._handleFoodEaten();
    applyCurrentDrift(this);
  } else if (result === 'ok') {
    applyWormholeTeleport(this);
    applyCurrentDrift(this);
  } else {
    this.state = STATE_DEAD;
  }
}

/** Increments score, ticks passives, and transitions to draft or advances the board. */
export function _handleFoodEaten() {
  this.score++;
  this.foodEaten++;
  this.upgrades.tickFoodPassives();
  if (this.foodEaten >= this.foodRequired) {
    this.upgrades.tickPassives();
    this._draftPool = generateDraftPool(this.upgrades, Math.random, this._draftsSinceMutation);
    if (this._draftPool.mutation) {
      this._draftsSinceMutation = 0;
    } else {
      this._draftsSinceMutation++;
    }
    this._draftSelection = 0;
    this._draftMutationAccepted = false;
    this.state = STATE_DRAFT;
  } else if (this.advanceBoard) {
    this.advanceBoard(this);
  } else {
    this._placeRandomFood();
  }
}

/**
 * Returns the wrapped coordinates of the cell the snake will move into next.
 *
 * @returns {{ x: number, y: number }}
 */
export function _peekNextCell() {
  const hx = this.snake.snakeX[this.snake.headIndex];
  const hy = this.snake.snakeY[this.snake.headIndex];
  const dx = this.snake.nextDirX;
  const dy = this.snake.nextDirY;
  let nx = hx + dx;
  let ny = hy + dy;
  if (nx < 0) nx = this.board.width - 1;
  else if (nx >= this.board.width) nx = 0;
  if (ny < 0) ny = this.board.height - 1;
  else if (ny >= this.board.height) ny = 0;
  return { x: nx, y: ny };
}

/** Recalculates tick interval based on board index and slow-time passive. */
export function _recalcTickMs() {
  let ms = Math.max(MIN_TICK_MS, BASE_TICK_MS - (this.boardIndex - 1) * TICK_DECREASE_PER_BOARD);
  const mult = applySlowTime(this);
  if (mult !== null) {
    ms = Math.round(ms * mult);
  }
  this.tickMs = ms;
}

/** Places food at a random unblocked cell (simple fallback, no influence map). */
export function _placeRandomFood() {
  let x, y;
  do {
    x = Math.floor(Math.random() * this.board.width);
    y = Math.floor(Math.random() * this.board.height);
  } while (this.board.isBlockedCell(x, y));
  this.board.foodX = x;
  this.board.foodY = y;
}
