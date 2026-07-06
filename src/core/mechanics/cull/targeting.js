// cull/targeting.js — Sir Reginald's AI target picker.
//
// Three modes, evaluated in priority order:
//
//   1. Pity        — fires when `missStreak >= pityThreshold` (threshold
//                    is re-rolled per throw in [PITY_MIN, PITY_MAX]).
//                    Picks a random alive-kin cell. Pity ⇒ guaranteed
//                    hit; the streak resets.
//   2. Hunt        — entered after any kill; picks a random non-memorial,
//                    non-snake cell orthogonally adjacent to the last
//                    kill. Reverts to search if no eligible neighbours
//                    remain or if a hunt throw misses.
//   3. Search      — random non-snake, non-memorial cell. The default.
//
// `pickTarget` is the only export `tickCull` calls; it rolls the per-
// throw pity threshold, picks the target, sets the `forcedPity` flag on
// the mechanic state (Step 12 reads it for the pity taunt), and writes
// the chosen `targetingMode` so the rest of the state machine reads off
// a single source of truth.

import {
  TERRAIN_MEMORIAL_HEAD,
  TERRAIN_MEMORIAL_BODY,
  TERRAIN_CATACOMB,
} from "../../grid/constants.js";
import { PITY_THRESHOLD_MIN, PITY_THRESHOLD_MAX } from "./constants.js";

// Matches `cellKey` in ./index.js — kept inline to avoid the circular
// import (index.js imports `pickTarget` from this file).
function huntKey(x, y) {
  return x + "," + y;
}

/**
 * Rolls a fresh per-throw pity threshold uniformly in
 * `[PITY_THRESHOLD_MIN, PITY_THRESHOLD_MAX]` (inclusive).
 *
 * @param {() => number} rand
 * @returns {number}
 */
export function rollPityThreshold(rand) {
  const span = PITY_THRESHOLD_MAX - PITY_THRESHOLD_MIN + 1;
  return PITY_THRESHOLD_MIN + Math.floor(rand() * span);
}

/**
 * Picks the next throw's target. Mutates `game.mechanic` to record the
 * per-throw `pityThreshold`, the resolved `targetingMode`, and the
 * `forcedPity` flag (true when the pity timer overrode the regular
 * mode).
 *
 * Falls back gracefully:
 *   - Pity with no alive kin (shouldn't happen — game-over fires first)
 *     drops to hunt/search.
 *   - Hunt with no eligible adjacents reverts the persistent mode to
 *     search and picks via search.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {() => number} rand
 * @returns {{ x: number, y: number }}
 */
export function pickTarget(game, rand) {
  const m = game.mechanic;
  m.pityThreshold = rollPityThreshold(rand);
  m.forcedPity = false;

  if (m.missStreak >= m.pityThreshold) {
    const pity = pickPityTarget(game, rand);
    if (pity) {
      m.forcedPity = true;
      // Mode stays whatever it was — the kill in `resolveImpact` will
      // flip it to hunt. Keeping mode untouched here means a pity throw
      // that follows search keeps `targetingMode === "search"` until the
      // kill lands, which matches the spec ("pity overrides for one
      // throw").
      return pity;
    }
    // No alive kin at all — fall through.
  }

  if (m.targetingMode === "hunt") {
    const hunt = pickHuntTarget(game, rand);
    if (hunt) {
      // Record the target so it isn't probed twice in the same hunt.
      // The resolver accumulates on every hit; this only adds on picks
      // (mostly misses — the no-op same-pick add on a hit is harmless).
      m.huntTriedCells.add(huntKey(hunt.x, hunt.y));
      return hunt;
    }
    // Hunt has run out of eligible neighbours across all its pivots —
    // drop back to search and clear both hunt sets so the next hunt
    // starts fresh.
    m.targetingMode = "search";
    m.huntHitCells = new Set();
    m.huntTriedCells = new Set();
  }

  return pickSearchTarget(game, rand);
}

/**
 * Random cell that isn't snake and isn't a memorial. Used by the
 * default search mode and as the hunt fallback.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {() => number} rand
 * @returns {{ x: number, y: number }}
 */
export function pickSearchTarget(game, rand) {
  const grid = game.grid;
  const w = grid.width;
  const h = grid.height;
  for (let attempts = 0; attempts < 200; attempts++) {
    const x = Math.floor(rand() * w);
    const y = Math.floor(rand() * h);
    if (isSearchEligible(grid, x, y)) {
      return { x, y };
    }
  }
  // Fallback — exhaustive scan. Snake + memorials together still leave
  // the bulk of the board open in any reachable state, but defending
  // against a stuck RNG is cheap.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isSearchEligible(grid, x, y)) {
        return { x, y };
      }
    }
  }
  return { x: -1, y: -1 };
}

/**
 * Multi-pivot hunt: gather cardinals of every hit cell in the current
 * hunt sequence (`huntHitCells`), filter out ineligible ones (snake,
 * memorial, already-tried, out of bounds), then prefer candidates that
 * extend a line of ≥2 aligned hits ("battleship" behaviour). Returns
 * null when nothing eligible remains — caller reverts to search.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {() => number} rand
 * @returns {{ x: number, y: number } | null}
 */
export function pickHuntTarget(game, rand) {
  const m = game.mechanic;
  const grid = game.grid;
  const w = grid.width;
  const h = grid.height;
  const hits = m.huntHitCells;
  if (!hits || hits.size === 0) {
    return null;
  }
  const tried = m.huntTriedCells ?? new Set();
  // Deduplicated pool of eligible candidates keyed by "x,y".
  const candidates = new Map();
  for (const key of hits) {
    const [hx, hy] = key.split(",").map(Number);
    // The hit cell itself is also a candidate — normally filtered out
    // by `tried`, since a real hit adds to both sets. Blocked cells are
    // absent from `tried` and thus re-picked here, which lets Reginald
    // re-target a still-alive kin cell after a shield eats one throw.
    const neighbours = [
      [hx, hy],
      [hx + 1, hy],
      [hx - 1, hy],
      [hx, hy + 1],
      [hx, hy - 1],
    ];
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        continue;
      }
      if (grid.isSnakeCell(nx, ny)) {
        continue;
      }
      if (isMemorialCell(grid, nx, ny)) {
        continue;
      }
      if (isSparseWallCell(grid, nx, ny)) {
        continue;
      }
      const nkey = huntKey(nx, ny);
      if (tried.has(nkey)) {
        continue;
      }
      if (candidates.has(nkey)) {
        continue;
      }
      candidates.set(nkey, { x: nx, y: ny, score: scoreLineExtending(nx, ny, hits) });
    }
  }
  if (candidates.size === 0) {
    return null;
  }
  // Battleship prior — if any candidate extends a confirmed line
  // (score > 0), pick from the highest-scored subset. Otherwise fall
  // back to a uniform random over all candidates (the "just probe
  // around" behaviour, used for the first hit and when the confirmed
  // line has exhausted).
  let maxScore = 0;
  for (const c of candidates.values()) {
    if (c.score > maxScore) {
      maxScore = c.score;
    }
  }
  const pool = [];
  for (const c of candidates.values()) {
    if (c.score === maxScore) {
      pool.push(c);
    }
  }
  const pick = pool[Math.floor(rand() * pool.length)];
  return { x: pick.x, y: pick.y };
}

/**
 * Battleship-style line-extension score for a candidate cell against
 * the current hit set. Returns the axis-hit count when the candidate
 * is directly adjacent to an aligned hit AND at least two hits share
 * that axis (so a single hit alone doesn't bias — the AI only prefers
 * an axis once it has evidence of one). Returns 0 for candidates that
 * don't extend a confirmed line.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {Set<string>} hits
 * @returns {number}
 */
export function scoreLineExtending(cx, cy, hits) {
  let hCount = 0;
  let vCount = 0;
  let hAdjacent = false;
  let vAdjacent = false;
  for (const key of hits) {
    const [hx, hy] = key.split(",").map(Number);
    if (hy === cy) {
      hCount++;
      if (Math.abs(hx - cx) === 1) {
        hAdjacent = true;
      }
    }
    if (hx === cx) {
      vCount++;
      if (Math.abs(hy - cy) === 1) {
        vAdjacent = true;
      }
    }
  }
  let score = 0;
  if (hCount >= 2 && hAdjacent) {
    score = Math.max(score, hCount);
  }
  if (vCount >= 2 && vAdjacent) {
    score = Math.max(score, vCount);
  }
  return score;
}

/**
 * Random alive-kin cell across all alive kin. Returns null when there
 * are no alive kin (caller falls through to hunt/search).
 *
 * @param {import('../../game/index.js').Game} game
 * @param {() => number} rand
 * @returns {{ x: number, y: number } | null}
 */
export function pickPityTarget(game, rand) {
  const kinList = game.mechanic?.kin ?? [];
  const cells = [];
  for (const k of kinList) {
    if (!k.alive) {
      continue;
    }
    for (const [x, y] of k.cells) {
      cells.push([x, y]);
    }
  }
  if (cells.length === 0) {
    return null;
  }
  const [x, y] = cells[Math.floor(rand() * cells.length)];
  return { x, y };
}

function isSearchEligible(grid, x, y) {
  if (grid.isSnakeCell(x, y)) {
    return false;
  }
  if (isMemorialCell(grid, x, y)) {
    return false;
  }
  if (isSparseWallCell(grid, x, y)) {
    return false;
  }
  return true;
}

function isMemorialCell(grid, x, y) {
  const t = grid.terrain[y * grid.width + x];
  return t === TERRAIN_MEMORIAL_HEAD || t === TERRAIN_MEMORIAL_BODY;
}

/**
 * True for sparse wall cells (the `TERRAIN_CATACOMB` obstacles
 * scattered by the brood generator). The AI treats these like visible
 * obstacles — a player would see them and skip them, so we do too.
 * Kin walls and memorials are handled by their own terrain markers
 * and don't fall through to this check.
 */
function isSparseWallCell(grid, x, y) {
  return grid.terrain[y * grid.width + x] === TERRAIN_CATACOMB;
}
