// constants.js — v1 starting numbers for the cull mechanic.
//
// Tunables here, not inlined at call sites, so playtest iteration is
// cheap (edit one file, no chasing). See PLAN.brood-adr.md "Numbers"
// section for the rationale of each value.

// ── Cull cadence ─────────────────────────────────────────────────

/** Real-time interval between Reginald's throws (ms). */
export const THROW_INTERVAL_MS = 4000;
/** Real-time telegraph fuse before impact (ms). Tight by design. */
export const TELEGRAPH_FUSE_MS = 1000;
/** Telegraph fuse for the plus-bomb (5 cells: centre + 4 cardinals). */
export const PLUS_TELEGRAPH_FUSE_MS = 1250;
/** Telegraph fuse for the line-bomb (full row or column). */
export const LINE_TELEGRAPH_FUSE_MS = 1500;
/** How long the cell-local impact flash lingers after a throw lands (ms). */
export const IMPACT_FLASH_MS = 220;
/**
 * Maximum dt the predator clock advances in a single tick (ms). The cull
 * is the engine's first real-time mechanic; clamping the per-tick delta
 * keeps a pause or a backgrounded tab from lurching the throw timer
 * forward (the gap is absorbed instead of fired as a burst). See
 * PLAN.brood-update.md "Notes".
 */
export const MAX_CULL_DT_MS = 250;

// ── Idle taunts ──────────────────────────────────────────────────

/** Lower bound of the idle-taunt random interval (ms). */
export const IDLE_TAUNT_MIN_MS = 10_000;
/** Upper bound of the idle-taunt random interval (ms). */
export const IDLE_TAUNT_MAX_MS = 20_000;

// ── Pity timer ───────────────────────────────────────────────────

/** Inclusive lower bound of the per-throw pity threshold roll. */
export const PITY_THRESHOLD_MIN = 3;
/** Inclusive upper bound of the per-throw pity threshold roll. */
export const PITY_THRESHOLD_MAX = 5;

// ── Shields ──────────────────────────────────────────────────────

/** Shields the player starts each act with. Resets per act. */
export const SHIELDS_PER_ACT = 5;

// ── Mines (Phase 3) ──────────────────────────────────────────────
//
// Player-placed traps. Reginald doesn't see them; a throw that lands on
// a mine detonates it, stunning his throw timer and leaving the mine
// cell as a "hit" from the AI's POV — his hunt cycle now probes cells
// around the mine's empty neighbourhood, wasting throws far from
// actual kin. Placed during the brood placement phase.

/** Mines granted to the player per brood act (placed at start). */
export const MINES_PER_ACT = 3;
/**
 * Duration of the throw-timer stun after a mine detonates (ms). Matched
 * to `THROW_INTERVAL_MS` so a mine "costs Reginald a throw" — the
 * player buys back one full regular cadence per trap. Re-derive if the
 * throw cadence changes.
 */
export const MINE_STUN_MS = THROW_INTERVAL_MS;

// ── Brood-specific scoring (Step 15) ─────────────────────────────
//
// Layered on top of the cross-mutation per-food + per-act-clear
// contributions from `core/score/constants.js`. Survived kin matter
// most; unused shields are a smaller efficiency bonus so the optimal
// play isn't "stockpile every shield". V1 placeholders — re-balance
// after playtest (PLAN.brood-update.md Q4).
//
// Invariant (D22): SCORE_PER_KIN > SCORE_PER_UNUSED_SHIELD > 0.

/** Points per kin still alive at brood act-clear. */
export const SCORE_PER_KIN = 50;
/** Points per shield charge unused at brood act-clear. */
export const SCORE_PER_UNUSED_SHIELD = 20;
