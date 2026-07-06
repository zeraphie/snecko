// score/constants.js — Cross-mutation score values.
//
// `totalScore` accumulates points from every contributing event;
// per-mutation rewards (kin survival, unused shields, etc.) layer on
// top in their own constants files. Numbers here are v1 placeholders —
// re-balance after playtest. See PLAN.brood-update.md "Resolved
// questions" Q4.

/** Points awarded per food bite (cross-mutation). */
export const SCORE_PER_FOOD = 10;
/** Points awarded when an act is cleared (food requirement met). */
export const SCORE_PER_ACT = 100;
