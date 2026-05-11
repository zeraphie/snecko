// index.js — Boss registry and factory
//
// Each mutation maps to a dedicated boss file.  Adding a new biome boss is
// as simple as creating a new file alongside these and registering it below.

import trafficJam from "./traffic-jam.js";
import theAlgorithm from "./the-algorithm.js";
import absoluteUnit from "./absolute-unit.js";
import catacombsChaser from "./catacombs-chaser.js";
import hissalia from "./hissalia.js";

// ── Type ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} BossDef
 * @property {string} id           — stable identifier (used by future save/analytics)
 * @property {string} [style]      — boss style key (e.g. "bullet_hell", "survival"). Defaults to "bullet_hell" if unset.
 * @property {string} name         — display name shown in the HUD and intro card
 * @property {number} [maxHp]      — bullet-hell only: hit points required to defeat
 * @property {number} [bodyHp]     — bullet-hell only: HP per destructible body cell (default 3)
 * @property {number} [width]      — bullet-hell only: horizontal cell count
 * @property {number} [height]     — bullet-hell only: vertical cell count
 * @property {number} [weakX]      — bullet-hell only: weak-point column offset from top-left (0-indexed)
 * @property {number} [weakY]      — bullet-hell only: weak-point row offset from top-left (0-indexed)
 * @property {object} [shape]      — bullet-hell only: parsed .boss shape (cells, width, height)
 * @property {string} [arena]      — bullet-hell only: arena name from .arena file (e.g. "Box", "Pillars")
 * @property {string} [shapeFile]  — bullet-hell only: .boss filename stem (e.g. "traffic-jam")
 * @property {((game: object) => void) | null} [special]
 *   Bullet-hell only: called every BOSS_SPECIAL_INTERVAL ticks after the intro window ends.
 *   Null means no special ability (Absolute Unit / future stubs).
 * @property {((game: object) => void)} [bootGrid]
 *   Style-agnostic: called by the style's setup when the grid/snake are
 *   uninitialised (e.g. practice mode entered via the boss picker, where
 *   `_enterPracticeBossFight` builds a fresh Snake). Should leave the
 *   grid in a playable state and spawn the snake at a valid cell.
 *   Skipped in normal play because the run's `generateGrid` already ran.
 */

// ── Registry ──────────────────────────────────────────────────────

/** @type {Record<string, BossDef>} */
const BOSS_DEFS = {
  crystalline: trafficJam,
  wildlands: theAlgorithm,
  catacombs: catacombsChaser,
};

// ── Fallback ──────────────────────────────────────────────────────

/**
 * Fallback boss used when the mutation has no dedicated entry yet.
 * Points at Absolute Unit so unimplemented biomes still get a functional fight.
 *
 * @type {BossDef}
 */
export const DEFAULT_BOSS_DEF = absoluteUnit;

// ── Factory ───────────────────────────────────────────────────────

/**
 * Returns the boss definition for the given mutation, falling back to
 * DEFAULT_BOSS_DEF if no specific entry exists.
 *
 * @param {string} mutation — e.g. 'crystalline', 'wildlands', 'catacombs'
 * @returns {BossDef}
 */
export function getBossDef(mutation) {
  return BOSS_DEFS[mutation] ?? DEFAULT_BOSS_DEF;
}

/**
 * Stable list of every boss definition the game knows about, including the
 * fallback. Used by the practice screen to enumerate bosses by name.
 *
 * @type {ReadonlyArray<BossDef>}
 */
export const ALL_BOSS_DEFS = [trafficJam, theAlgorithm, absoluteUnit, catacombsChaser, hissalia];

/**
 * Returns the boss definition matching `id`, or null if no boss exists with
 * that id. Used by practice mode to spawn a specific boss without going
 * through mutation lookup.
 *
 * @param {string} id — boss def `id` field (e.g. 'traffic_jam', 'absolute_unit')
 * @returns {BossDef | null}
 */
export function getBossDefById(id) {
  return ALL_BOSS_DEFS.find((d) => d.id === id) ?? null;
}
