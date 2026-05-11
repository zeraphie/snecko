// phases.js — Boss phase escalation + transition pauses (D10).
//
// HP-threshold model: phase 1 (≥60%), phase 2 (60% > HP ≥ 30%),
// phase 3 (HP < 30%). On crossing a threshold mid-fight the boss
// pauses (`PHASE_PAUSE_TICKS`), is immune to damage during the
// pause (gated in `tickStab`, `tickBossAttacks`), and at the end
// of the pause flags `pendingSpecial` for Step 10's Waterfowl
// pipeline to consume.
//
// Phase transitions cancel any in-progress attack — the boss
// freezes at the threshold rather than completing the swing.

import { PHASE_2_HP_RATIO, PHASE_3_HP_RATIO, PHASE_PAUSE_TICKS } from "./constants.js";

/**
 * Boss sub-tick callback. Counts down an active phase transition
 * pause; on expiry, signals `pendingSpecial`. Otherwise checks for
 * HP threshold crossings and arms a transition.
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function tickPhases(game) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }

  if (sl.phaseTransitionTicks > 0) {
    sl.phaseTransitionTicks--;
    if (sl.phaseTransitionTicks === 0) {
      sl.bossAnim = { state: "idle", framesIn: 0 };
      sl.pendingSpecial = true;
    }
    return;
  }

  // No active transition — check thresholds.
  const hpRatio = sl.bossHpMax > 0 ? sl.bossHp / sl.bossHpMax : 0;
  if (sl.bossPhase === 1 && hpRatio <= PHASE_2_HP_RATIO) {
    enterPhaseTransition(sl, 2);
  } else if (sl.bossPhase === 2 && hpRatio <= PHASE_3_HP_RATIO) {
    enterPhaseTransition(sl, 3);
  }
}

function enterPhaseTransition(sl, newPhase) {
  sl.bossPhase = newPhase;
  sl.phaseTransitionTicks = PHASE_PAUSE_TICKS;
  sl.bossAnim = { state: "phase_pause", framesIn: 0 };
  // Cancel any in-progress attack — boss freezes at the threshold,
  // doesn't complete the swing.
  sl.bossAttackId = null;
  sl.bossAttackPhase = null;
  sl.bossAttackTicks = 0;
  sl.bossAttackAim = null;
  // Reset the kick gate's recency counter — phase pause counts as a
  // hard reset of the attack flow.
  sl.ticksSinceLastAttack = 0;
}
