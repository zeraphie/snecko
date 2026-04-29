// slow-time.js — Slow Time passive: multiply tick interval when active

const SLOW_TIME_MULTIPLIER = 1.5;

/**
 * Returns the tick multiplier if slow-time is active, or null otherwise.
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {number|null}
 */
export function applySlowTime(game) {
  if (game.upgrades.hasPassive("slow_time")) {
    return SLOW_TIME_MULTIPLIER;
  }
  return null;
}

export { SLOW_TIME_MULTIPLIER };
