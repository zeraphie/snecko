// tick.js — Tick loop, food handling, tick speed calculation

import { generateDraftPool } from "../upgrades/draft.js";
import { applySlowTime } from "../upgrades/passives/slow-time.js";
import { applyIronJaw } from "../upgrades/bites/iron-jaw.js";
import { applyWormholeTeleport } from "../upgrades/consumables/wormhole.js";
import { applyCurrentDrift } from "../mechanics/currents.js";
import {
  STATE_PLAYING,
  STATE_DRAFT,
  STATE_DEAD,
  STATE_BOSS,
  BASE_TICK_MS,
  MIN_TICK_MS,
  TICK_DECREASE_PER_ACT,
  BOSS_FOOD_INTERVAL,
} from "./constants.js";

// Note: _bossTick is attached to Game.prototype in index.js

/** Runs one game tick if enough time has elapsed. Handles movement, food, drift, and death. */
export function tick() {
  if (this.state === STATE_BOSS) {
    return this._bossTick();
  }

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

  const result = this.snake.step(this.grid);

  if (result === "boss-food") {
    this.bossFoodCharge = 0;
    this._enterBossFight();
    return;
  }

  if (result === "food") {
    applyWormholeTeleport(this);
    this._handleFoodEaten();
    applyCurrentDrift(this);
  } else if (result === "ok") {
    applyWormholeTeleport(this);
    applyCurrentDrift(this);
  } else {
    this.state = STATE_DEAD;
  }
}

/** Increments score, ticks passives, and transitions to draft or advances the grid. */
export function _handleFoodEaten() {
  this.score++;
  this.foodEaten++;
  this.bossFoodCharge++;

  // Eating regular food while boss food is on the grid → boss food despawns,
  // charge resets so the next cycle starts fresh.
  const bossFoodWasPresent = this.grid.bossFoodX !== -1;
  if (bossFoodWasPresent) {
    this.grid.bossFoodX = -1;
    this.grid.bossFoodY = -1;
    this.bossFoodCharge = 0;
  }

  this.upgrades.tickBites();
  if (this.foodEaten >= this.foodRequired) {
    this._draftPool = generateDraftPool(this.upgrades, Math.random, this._draftsSinceMutation);
    if (this._draftPool.mutation) {
      this._draftsSinceMutation = 0;
    } else {
      this._draftsSinceMutation++;
    }
    this._draftSelection = 0;
    this._draftMutationAccepted = false;
    this.state = STATE_DRAFT;
    return;
  }

  if (this.advanceGrid) {
    this.advanceGrid(this);
  } else {
    this._placeRandomFood();
  }

  if (this.bossFoodCharge >= BOSS_FOOD_INTERVAL) {
    this._placeBossFood();
    this.bossFoodCharge = 0;
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
  if (nx < 0) {
    nx = this.grid.width - 1;
  } else if (nx >= this.grid.width) {
    nx = 0;
  }
  if (ny < 0) {
    ny = this.grid.height - 1;
  } else if (ny >= this.grid.height) {
    ny = 0;
  }
  return { x: nx, y: ny };
}

/** Recalculates tick interval based on grid index and slow-time passive. */
export function _recalcTickMs() {
  let ms = Math.max(MIN_TICK_MS, BASE_TICK_MS - (this.actIndex - 1) * TICK_DECREASE_PER_ACT);
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
    x = Math.floor(Math.random() * this.grid.width);
    y = Math.floor(Math.random() * this.grid.height);
  } while (this.grid.isBlockedCell(x, y));
  this.grid.foodX = x;
  this.grid.foodY = y;
}

/**
 * Places boss food at a random unblocked cell whose BFS distance from the
 * snake head is at least the regular food's. Re-rolls so the red food is
 * never the easier pick — going for it must be a deliberate choice.
 *
 * Skips snake/wall/regular-food cells. Falls back to any reachable cell if
 * no farther-or-equal cell exists.
 */
export function _placeBossFood() {
  const grid = this.grid;
  const w = grid.width;
  const h = grid.height;
  const hx = this.snake.snakeX[this.snake.headIndex];
  const hy = this.snake.snakeY[this.snake.headIndex];

  // BFS distance from head to every cell, treating walls/snake as impassable.
  const dist = new Int16Array(w * h).fill(-1);
  const queue = [hy * w + hx];
  dist[hy * w + hx] = 0;
  let qhead = 0;
  while (qhead < queue.length) {
    const pos = queue[qhead++];
    const x = pos % w;
    const y = (pos / w) | 0;
    const d = dist[pos];
    const neighbors = [
      [x + 1 >= w ? 0 : x + 1, y],
      [x - 1 < 0 ? w - 1 : x - 1, y],
      [x, y + 1 >= h ? 0 : y + 1],
      [x, y - 1 < 0 ? h - 1 : y - 1],
    ];
    for (let i = 0; i < 4; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];
      const ni = ny * w + nx;
      if (dist[ni] !== -1) {
        continue;
      }
      if (grid.isBlockedCell(nx, ny)) {
        continue;
      }
      dist[ni] = d + 1;
      queue.push(ni);
    }
  }

  const regularDist = dist[grid.foodY * w + grid.foodX];
  const candidates = [];
  const fallback = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === grid.foodX && y === grid.foodY) {
        continue;
      }
      if (grid.isBlockedCell(x, y)) {
        continue;
      }
      const d = dist[y * w + x];
      if (d === -1) {
        continue;
      }
      fallback.push([x, y]);
      if (regularDist === -1 || d >= regularDist) {
        candidates.push([x, y]);
      }
    }
  }

  const pool = candidates.length > 0 ? candidates : fallback;
  if (pool.length === 0) {
    return;
  }
  const [x, y] = pool[Math.floor(Math.random() * pool.length)];
  grid.bossFoodX = x;
  grid.bossFoodY = y;
}
