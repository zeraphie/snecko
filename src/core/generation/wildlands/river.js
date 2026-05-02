// river.js — FBM-driven winding river generator.
//
// A river is a connected line of cells walking along a primary axis, with
// perpendicular wobble sampled from a 2D FBM noise field. Used both by the
// wildlands stage mechanic (full-grid currents) and by The Algorithm boss
// (a constrained band above the player).
//
// The caller owns the seeded RNG so determinism stays explicit. Pass the
// same `seed` and `rand` (from `splitmix32(seed)`) and any pre-rolls done
// before calling stay in the caller's chain.

import { createPermTable, fbm2 } from "./noise.js";

/**
 * Walks a winding river of cells along an axis, returning the cells with
 * their flow direction.
 *
 * @param {object} options
 * @param {import('../../grid/index.js').Grid} options.grid — used for bounds and to skip walls / snake cells
 * @param {0 | 1} options.axis — 0 = walks along x (river flows horizontally), 1 = walks along y
 * @param {number} options.seed — integer seed; controls perm table + noise y-offset
 * @param {() => number} options.rand — caller-owned RNG; one draw is consumed for the start lateral
 * @param {number} [options.minLateral] — clamp lateral position low end (inclusive); defaults to 0
 * @param {number} [options.maxLateral] — clamp lateral position high end (inclusive); defaults to grid edge
 * @param {number} [options.minStep] — first step index along the primary axis (inclusive); defaults to 0
 * @param {number} [options.maxStep] — exclusive upper bound for step; defaults to grid edge
 * @returns {Array<{ x: number, y: number, flowDx: number, flowDy: number }>}
 */
export function generateRiver({
  grid,
  axis,
  seed,
  rand,
  minLateral,
  maxLateral,
  minStep,
  maxStep,
}) {
  const w = grid.width;
  const h = grid.height;
  const perm = createPermTable(seed);

  const flowDx = axis === 0 ? 1 : 0;
  const flowDy = axis === 1 ? 1 : 0;

  const lateralAxisSize = axis === 0 ? h : w;
  const lateralLo = minLateral ?? 0;
  const lateralHi = maxLateral ?? lateralAxisSize - 1;
  const lateralRange = Math.max(1, lateralHi - lateralLo + 1);

  const stepAxisSize = axis === 0 ? w : h;
  const stepLo = minStep ?? 0;
  const stepHi = maxStep ?? stepAxisSize;

  const startLateral = lateralLo + Math.floor(rand() * lateralRange);
  const amplitude = lateralRange * 0.4;

  const clampLateral = (value) => Math.max(lateralLo, Math.min(lateralHi, value));

  const cells = [];
  const visited = new Set();

  const tryPush = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const key = x + "," + y;
    if (visited.has(key)) return;
    if (grid.isWallCell(x, y)) return;
    if (grid.isSnakeCell(x, y)) return;
    visited.add(key);
    cells.push({ x, y, flowDx, flowDy });
  };

  for (let step = stepLo; step < stepHi; step++) {
    const n = fbm2(step * 0.15, seed * 0.017, 3, 2.0, 0.5, perm);
    const lateral = clampLateral(Math.round(startLateral + n * amplitude));

    if (axis === 0) {
      tryPush(step, lateral);
    } else {
      tryPush(lateral, step);
    }

    // Fill gaps when lateral jumps by more than one cell between steps so
    // the river stays 4-connected.
    if (step > stepLo) {
      const prevN = fbm2((step - 1) * 0.15, seed * 0.017, 3, 2.0, 0.5, perm);
      const prevLateral = clampLateral(Math.round(startLateral + prevN * amplitude));
      const diff = lateral - prevLateral;
      if (Math.abs(diff) > 1) {
        const dir = diff > 0 ? 1 : -1;
        for (let l = prevLateral + dir; l !== lateral; l += dir) {
          if (axis === 0) {
            tryPush(step, l);
          } else {
            tryPush(l, step);
          }
        }
      }
    }
  }

  return cells;
}
