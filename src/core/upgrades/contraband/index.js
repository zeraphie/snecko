// index.js — Contraband pool: all available boss-fight upgrades
//
// Contraband items are persistent boss-only upgrades that carry between
// encounters within a run.  Each is defined in its own file for easy
// extension.  The pool is shuffled and sliced at draft time so the player
// always sees exactly 3 random choices.

import dangerNoodle from "./danger-noodle.js";
import getOutOfJailFree from "./get-out-of-jail-free.js";
import snakeHungry from "./snake-hungry.js";
import doubleSnake from "./double-snake.js";
import gomuGomu from "./gomu-gomu.js";
import collateralHissage from "./collateral-hissage.js";

// ── Type ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} ContrabandDef
 * @property {string} id    — stable identifier
 * @property {string} name  — display name shown in the Contraband draft screen
 * @property {string} desc  — one-line flavour description
 * @property {(game: object) => void} apply
 *   Called when the item is picked.  No-op until the mechanic is wired in.
 */

// ── Pool ─────────────────────────────────────────────────────────

/** @type {ContrabandDef[]} */
export const CONTRABAND_DEFS = [
  dangerNoodle,
  getOutOfJailFree,
  snakeHungry,
  doubleSnake,
  gomuGomu,
  collateralHissage,
];

// ── Generator ────────────────────────────────────────────────────

/**
 * Picks 3 unique Contraband items at random from the full pool.
 * Uses a Fisher-Yates shuffle so every combination is equally likely.
 *
 * @param {() => number} rng — zero-argument function returning [0, 1)
 * @returns {ContrabandDef[]}
 */
export function generateContrabandPool(rng) {
  const pool = [...CONTRABAND_DEFS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, Math.min(3, pool.length));
}
