// slow-time.js — Slow Time passive: multiply tick interval when active

const SLOW_TIME_MULTIPLIER = 1.5;

export function applySlowTime(game) {
  if (game.upgrades.hasPassive("slow_time")) {
    return SLOW_TIME_MULTIPLIER;
  }
  return null;
}

export { SLOW_TIME_MULTIPLIER };
