// stamina.js — Soulslike stamina pool: cost gate + delayed regen.
//
// Per D4: hard-block when insufficient (the consumer no-ops, the
// player has to wait). Post-action delay (`STAMINA_REGEN_DELAY_TICKS`)
// before regen resumes — without it, regen starts mid-attack and
// the resource feels too cheap. Both timers tick on the boss
// sub-tick (120 ms), so a 6-tick delay ≈ 720 ms and a 10-tick regen
// step ≈ 1.2 s per pip.

import { STAMINA_REGEN_TICKS, STAMINA_REGEN_DELAY_TICKS } from "./constants.js";

/**
 * Consume `cost` stamina if available. Arms the post-action regen
 * delay and resets the partial-regen counter on success. On failure
 * (insufficient stamina) the state is untouched and the caller
 * should treat the action as a no-op.
 *
 * @param {import('../../../game/index.js').Game} game
 * @param {number} cost
 * @returns {boolean} true if consumed, false if insufficient
 */
export function tryConsume(game, cost) {
  const sl = game._soulslike;
  if (!sl) {
    return false;
  }
  if (sl.stamina < cost) {
    return false;
  }
  sl.stamina -= cost;
  sl.staminaDelayCounter = STAMINA_REGEN_DELAY_TICKS;
  // Reset partial regen so consume mid-accrual doesn't carry leftover
  // ticks into the next regen interval.
  sl.staminaRegenCounter = 0;
  return true;
}

/**
 * Boss sub-tick callback: tick down the post-action delay first,
 * then accrue regen ticks. When the regen counter hits the
 * threshold, +1 stamina (capped at max).
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function regenStamina(game) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  if (sl.staminaDelayCounter > 0) {
    sl.staminaDelayCounter--;
    return;
  }
  if (sl.stamina >= sl.staminaMax) {
    return;
  }
  sl.staminaRegenCounter++;
  if (sl.staminaRegenCounter >= STAMINA_REGEN_TICKS) {
    sl.staminaRegenCounter = 0;
    sl.stamina = Math.min(sl.staminaMax, sl.stamina + 1);
  }
}
