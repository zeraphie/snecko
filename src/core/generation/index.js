// generation.js — Grid generation: food placement and lattice hand-off.
// Initial layout is empty — every crystal arrives via the lattice's
// bloom-and-decay lifecycle (see `mechanics/lattice.js`).

import { initLattice, advanceLattice } from "../mechanics/lattice.js";
import {
  TERRAIN_TELEGRAPH,
  TERRAIN_CURRENT,
  TERRAIN_INTERIOR,
  TERRAIN_CRYSTAL_TELEGRAPH,
} from "../grid/constants.js";

// ── Food placement ────────────────────────────────────────────────

/**
 * True if (x, y) is unsuitable for food placement. Filters both the
 * blocking-cell layer (walls + snake) and the terrain layer — food
 * must never land on a telegraph, a current flow, or the hollow
 * interior of a crystal facet (which would render the food visibly
 * inside the crystal silhouette).
 *
 * Exported so `tick.js`'s `_placeRandomFood` / `_placeBossFood`
 * paths can share the exact same filter (they previously only
 * checked `isBlockedCell`, which let boss food land inside crystals).
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {number} x
 * @param {number} y
 */
export function isFoodBlocked(grid, x, y) {
  if (grid.isBlockedCell(x, y)) {
    return true;
  }
  const t = grid.terrain[y * grid.width + x];
  return (
    t === TERRAIN_TELEGRAPH ||
    t === TERRAIN_CRYSTAL_TELEGRAPH ||
    t === TERRAIN_CURRENT ||
    t === TERRAIN_INTERIOR
  );
}

/**
 * True if (x, y) is a one-cell dead-end pocket — fewer than two
 * non-wall neighbours. Eating food in such a cell traps the snake:
 * it just grew, can't reverse, and every forward / perpendicular cell
 * is a wall. Out-of-bounds neighbours count as walls so corner cells
 * with two open neighbours still pass.
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {number} x
 * @param {number} y
 */
export function isDeadEndCell(grid, x, y) {
  const w = grid.width;
  const h = grid.height;
  let open = 0;
  if (x + 1 < w && !grid.isWallCell(x + 1, y)) {
    open++;
  }
  if (x - 1 >= 0 && !grid.isWallCell(x - 1, y)) {
    open++;
  }
  if (y + 1 < h && !grid.isWallCell(x, y + 1)) {
    open++;
  }
  if (y - 1 >= 0 && !grid.isWallCell(x, y - 1)) {
    open++;
  }
  return open < 2;
}

/**
 * Places food at a random unblocked, non-terrain cell (with fallback full scan).
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {() => number} [rand=Math.random]
 */
export function placeFood(grid, rand = Math.random) {
  // First pass — prefer cells that aren't dead-end pockets so the
  // snake has an exit after eating + growing.
  for (let attempts = 0; attempts < 200; attempts++) {
    const x = Math.floor(rand() * grid.width);
    const y = Math.floor(rand() * grid.height);
    if (!isFoodBlocked(grid, x, y) && !isDeadEndCell(grid, x, y)) {
      grid.foodX = x;
      grid.foodY = y;
      return;
    }
  }
  // Fallback — any non-blocked cell, even a pocket. Better than no
  // food at all if the layout has no pass-through cells available.
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!isFoodBlocked(grid, x, y)) {
        grid.foodX = x;
        grid.foodY = y;
        return;
      }
    }
  }
}

// ── Grid generation ──────────────────────────────────────────────

/**
 * Generates a fresh crystalline grid: clears masks, spawns the snake and
 * food, and hands off to the lattice. The grid starts empty of walls —
 * crystals arrive over time via the lattice's `telegraph_place → place →
 * grow → linger → decay → disappear` lifecycle.
 *
 * @param {import('../game/index.js').Game} game
 */
export function generateGrid(game) {
  const grid = game.grid;

  grid.clearMasks("wall");
  grid.clearMasks("snake");
  grid.clearMasks("reserved");
  grid.terrain.fill(0);

  const spawnX = Math.floor(grid.width / 2);
  const spawnY = Math.floor(grid.height / 2);
  const dx = 1;
  const dy = 0;

  const snakeLen = game.snake.snakeLength > 0 ? game.snake.snakeLength : 3;

  game.snake.init(grid, spawnX, spawnY, snakeLen, dx, dy);

  placeFood(grid, game.foodRand ?? Math.random);

  initLattice(game);
}

/**
 * Advances the crystalline grid by one step (lattice growth + food placement).
 *
 * @param {import('../game/index.js').Game} game
 */
export function advanceGrid(game) {
  const grid = game.grid;

  advanceLattice(game);

  placeFood(grid, game.foodRand ?? Math.random);
}
