// waterfowl.js — Hissalia's Waterfowl special (D9).
//
// Five-beat pattern: 3 jumps with bait-window aim-locks between, plus
// a secondary circle one beat after the last jump. Each landing kicks
// off a 360° glaive swipe so the player can SEE the lethal area; the
// sword cell (handle + tip) is damage-active each tick.
//
//   1. lock_1   — snapshot snake position; hold WATERFOWL_LOCK_TICKS.
//   2. jump_1   — teleport to lock (no immediate AoE — the swipe is).
//   3. swipe_1  — 12-tick 360° glaive rotation; per-tick damage check.
//   4. pause_1  — WATERFOWL_PAUSE_TICKS rest.
//   5. lock_2   — re-snapshot; hold.
//   6. jump_2   — teleport.
//   7. swipe_2  — 360° swipe.
//   8. pause_2  — rest.
//   9. lock_3   — re-snapshot; hold.
//  10. jump_3   — teleport.
//  11. swipe_3  — 360° swipe.
//  12. gap      — 1-tick visible windup for the secondary.
//  13. secondary — secondary circle hit (radius 4).
//
// Bait window: the 8-tick lock holds the boss's *target*, not the
// snake. By moving during the lock the player can shift where the boss
// arrives. Tight timing — rewards reading the pattern.
//
// Triggers (D10):
//   - `pendingSpecial` — set by `phases.js` after a phase transition.
//   - `ticksSinceLastSpecial >= SPECIAL_FORCE_TICKS` — failsafe so a
//     fight without phase crossings still sees a special eventually.
//
// Waterfowl pre-empts `tickBossAttacks`, which gates on
// `waterfowlPhase > 0` and skips. Stagger / phase pauses still pause
// the special (no overlap with player parry-window or transition).

import { takeDamage, pushSnakeOutOfBoss } from "./player.js";
import {
  ARENA_INNER_X0,
  ARENA_INNER_Y0,
  ARENA_INNER_SIZE,
  BOSS_SIZE,
  ATTACK_DAMAGE,
  WATERFOWL_LOCK_TICKS,
  WATERFOWL_PAUSE_TICKS,
  WATERFOWL_DASH_TICKS,
  WATERFOWL_SWIPE_TICKS,
  WATERFOWL_RADIUS_FINAL,
  SPECIAL_FORCE_TICKS,
} from "./constants.js";

// Phase indices — kept here as named exports so tests + future
// renderer hooks can read them without magic numbers.
export const WATERFOWL_PHASE_INACTIVE = 0;
export const WATERFOWL_PHASE_LOCK_1 = 1;
export const WATERFOWL_PHASE_JUMP_1 = 2;
export const WATERFOWL_PHASE_SWIPE_1 = 3;
export const WATERFOWL_PHASE_PAUSE_1 = 4;
export const WATERFOWL_PHASE_LOCK_2 = 5;
export const WATERFOWL_PHASE_JUMP_2 = 6;
export const WATERFOWL_PHASE_SWIPE_2 = 7;
export const WATERFOWL_PHASE_PAUSE_2 = 8;
export const WATERFOWL_PHASE_LOCK_3 = 9;
export const WATERFOWL_PHASE_JUMP_3 = 10;
export const WATERFOWL_PHASE_SWIPE_3 = 11;
export const WATERFOWL_PHASE_GAP = 12;
export const WATERFOWL_PHASE_SECONDARY = 13;

const LAST_PHASE = WATERFOWL_PHASE_SECONDARY;

/**
 * Ring positions for the 360° swipe — 12 cells around a 2×2 boss
 * footprint in clockwise order starting from the upper-left N cell.
 * Each entry is the HANDLE; the TIP extends one cell further out in
 * the radial direction.
 *
 * Offsets are relative to (bx, by) — boss footprint top-left.
 */
const SWIPE_RING = [
  { handle: { dx: 0, dy: -1 }, tip: { dx: 0, dy: -2 } }, // N-left
  { handle: { dx: 1, dy: -1 }, tip: { dx: 1, dy: -2 } }, // N-right
  { handle: { dx: 2, dy: -1 }, tip: { dx: 3, dy: -2 } }, // NE
  { handle: { dx: 2, dy: 0 }, tip: { dx: 3, dy: 0 } }, // E-top
  { handle: { dx: 2, dy: 1 }, tip: { dx: 3, dy: 1 } }, // E-bottom
  { handle: { dx: 2, dy: 2 }, tip: { dx: 3, dy: 3 } }, // SE
  { handle: { dx: 1, dy: 2 }, tip: { dx: 1, dy: 3 } }, // S-right
  { handle: { dx: 0, dy: 2 }, tip: { dx: 0, dy: 3 } }, // S-left
  { handle: { dx: -1, dy: 2 }, tip: { dx: -2, dy: 3 } }, // SW
  { handle: { dx: -1, dy: 1 }, tip: { dx: -2, dy: 1 } }, // W-bottom
  { handle: { dx: -1, dy: 0 }, tip: { dx: -2, dy: 0 } }, // W-top
  { handle: { dx: -1, dy: -1 }, tip: { dx: -2, dy: -2 } }, // NW
];

const SWIPE_PHASES = new Set([
  WATERFOWL_PHASE_SWIPE_1,
  WATERFOWL_PHASE_SWIPE_2,
  WATERFOWL_PHASE_SWIPE_3,
]);

const JUMP_PHASES = new Set([
  WATERFOWL_PHASE_JUMP_1,
  WATERFOWL_PHASE_JUMP_2,
  WATERFOWL_PHASE_JUMP_3,
]);

/** @param {number} phase */
export function isWaterfowlSwipePhase(phase) {
  return SWIPE_PHASES.has(phase);
}

/** @param {number} phase */
export function isWaterfowlJumpPhase(phase) {
  return JUMP_PHASES.has(phase);
}

/**
 * Returns the glaive pose for the current swipe tick (called by the
 * renderer via `glaivePose`). Steps through the 12-cell ring in CW
 * order. Returns `null` if not in a swipe phase.
 *
 * @param {object} sl
 * @returns {{ handle: {x:number,y:number}, tip: {x:number,y:number} } | null}
 */
export function waterfowlSwipePose(sl) {
  if (!isWaterfowlSwipePhase(sl.waterfowlPhase)) {
    return null;
  }
  const step = swipeStep(sl);
  const ring = SWIPE_RING[step];
  return {
    handle: { x: sl.bossX + ring.handle.dx, y: sl.bossY + ring.handle.dy },
    tip: { x: sl.bossX + ring.tip.dx, y: sl.bossY + ring.tip.dy },
  };
}

/** Current swipe ring index (0..SWIPE_RING.length-1). */
function swipeStep(sl) {
  // waterfowlTicks counts DOWN from WATERFOWL_SWIPE_TICKS; tick 0 is
  // the last sub-tick (boundary case after decrement). Clamp so we
  // never index past the end of the ring.
  const elapsed = WATERFOWL_SWIPE_TICKS - sl.waterfowlTicks;
  return Math.max(0, Math.min(SWIPE_RING.length - 1, elapsed));
}

/**
 * Boss sub-tick callback. When inactive, checks the trigger conditions
 * and arms phase 1. When active, counts down the current beat and
 * advances to the next on expiry. During swipe phases, also runs a
 * per-tick damage check before the decrement (so the damage zone
 * matches what the renderer is showing this tick).
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function tickWaterfowl(game) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  if (sl.bossHp <= 0) {
    return;
  }
  // Stagger and phase-transition pauses freeze the entire boss; the
  // special waits its turn behind them.
  if (sl.staggerTicks > 0 || sl.phaseTransitionTicks > 0) {
    return;
  }

  if (sl.waterfowlPhase === WATERFOWL_PHASE_INACTIVE) {
    sl.ticksSinceLastSpecial++;
    if (shouldTrigger(sl)) {
      enterPhase(game, WATERFOWL_PHASE_LOCK_1);
    }
    return;
  }

  // Swipe phases damage on the current ring position before the
  // counter decrement (so step 0 is checked when the player sees the
  // sword at step 0).
  if (isWaterfowlSwipePhase(sl.waterfowlPhase)) {
    swipeHit(game);
  }

  // Jump (dash) phases interpolate the boss between dashStart and
  // dashTarget one fraction per tick. The final tick lands exactly on
  // the target before advancing to SWIPE. If the dash crosses the
  // snake's cell, damage + shove them out — the snake shouldn't be
  // able to "hide" inside the boss footprint.
  if (isWaterfowlJumpPhase(sl.waterfowlPhase)) {
    dashStep(sl);
    settleDashCollision(game);
  }

  // Active — count down the current beat.
  sl.waterfowlTicks--;
  if (sl.waterfowlTicks > 0) {
    return;
  }
  const next = sl.waterfowlPhase + 1;
  if (next > LAST_PHASE) {
    finishWaterfowl(sl);
    return;
  }
  enterPhase(game, next);
}

/**
 * @param {object} sl
 * @returns {boolean}
 */
function shouldTrigger(sl) {
  if (sl.pendingSpecial) {
    return true;
  }
  return sl.ticksSinceLastSpecial >= SPECIAL_FORCE_TICKS;
}

function enterPhase(game, phase) {
  const sl = game._soulslike;
  sl.waterfowlPhase = phase;
  switch (phase) {
    case WATERFOWL_PHASE_LOCK_1:
    case WATERFOWL_PHASE_LOCK_2:
    case WATERFOWL_PHASE_LOCK_3:
      lockAim(game);
      sl.waterfowlTicks = WATERFOWL_LOCK_TICKS;
      sl.bossAnim = { state: "waterfowl_lock", framesIn: 0 };
      break;
    case WATERFOWL_PHASE_JUMP_1:
    case WATERFOWL_PHASE_JUMP_2:
    case WATERFOWL_PHASE_JUMP_3:
      startDash(sl);
      sl.waterfowlTicks = WATERFOWL_DASH_TICKS;
      sl.bossAnim = { state: "waterfowl_jump", framesIn: 0 };
      break;
    case WATERFOWL_PHASE_SWIPE_1:
    case WATERFOWL_PHASE_SWIPE_2:
    case WATERFOWL_PHASE_SWIPE_3:
      sl.waterfowlTicks = WATERFOWL_SWIPE_TICKS;
      sl.bossAnim = { state: "waterfowl_swipe", framesIn: 0 };
      break;
    case WATERFOWL_PHASE_PAUSE_1:
    case WATERFOWL_PHASE_PAUSE_2:
      sl.waterfowlTicks = WATERFOWL_PAUSE_TICKS;
      sl.bossAnim = { state: "waterfowl_pause", framesIn: 0 };
      break;
    case WATERFOWL_PHASE_GAP:
      // Visible 1-tick windup for the secondary — reads as "and there's
      // one more coming". Telegraphs the larger radius.
      sl.waterfowlTicks = 1;
      sl.bossAnim = { state: "waterfowl_secondary_telegraph", framesIn: 0 };
      break;
    case WATERFOWL_PHASE_SECONDARY:
      circleHit(game, WATERFOWL_RADIUS_FINAL);
      sl.waterfowlTicks = 1;
      sl.bossAnim = { state: "waterfowl_secondary", framesIn: 0 };
      break;
  }
}

function lockAim(game) {
  const sl = game._soulslike;
  const headIdx = game.snake.headIndex;
  sl.waterfowlLockX = game.snake.snakeX[headIdx];
  sl.waterfowlLockY = game.snake.snakeY[headIdx];
}

/**
 * Captures the boss's current position and the (clamped) lock target.
 * The dash interpolates between these endpoints over WATERFOWL_DASH_TICKS
 * frames. The boss footprint top-left is clamped inside the inner
 * playable area so the 2×2 doesn't poke through the wall ring on a
 * corner-bait.
 */
function startDash(sl) {
  const minX = ARENA_INNER_X0;
  const maxX = ARENA_INNER_X0 + ARENA_INNER_SIZE - BOSS_SIZE;
  const minY = ARENA_INNER_Y0;
  const maxY = ARENA_INNER_Y0 + ARENA_INNER_SIZE - BOSS_SIZE;
  sl.dashStartX = sl.bossX;
  sl.dashStartY = sl.bossY;
  sl.dashTargetX = Math.max(minX, Math.min(maxX, sl.waterfowlLockX));
  sl.dashTargetY = Math.max(minY, Math.min(maxY, sl.waterfowlLockY));
}

/**
 * Advances the boss one dash-fraction toward the target. The final
 * sub-tick lands exactly on the target (no rounding drift) because
 * progress hits 1.0 on the last tick.
 */
function dashStep(sl) {
  const elapsed = WATERFOWL_DASH_TICKS - sl.waterfowlTicks + 1;
  const progress = elapsed / WATERFOWL_DASH_TICKS;
  if (progress >= 1) {
    sl.bossX = sl.dashTargetX;
    sl.bossY = sl.dashTargetY;
    return;
  }
  sl.bossX = Math.round(sl.dashStartX + (sl.dashTargetX - sl.dashStartX) * progress);
  sl.bossY = Math.round(sl.dashStartY + (sl.dashTargetY - sl.dashStartY) * progress);
}

/**
 * If the boss's dash has landed on the snake's cell, deal damage and
 * shove the snake out along the dash direction. Iframes still gate
 * the damage via `takeDamage` (dodging through the dash absorbs the
 * hit), but the snake is always pushed out so the boss can finish
 * its dash without overlapping.
 */
function settleDashCollision(game) {
  const sl = game._soulslike;
  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  if (sx < sl.bossX || sx >= sl.bossX + BOSS_SIZE || sy < sl.bossY || sy >= sl.bossY + BOSS_SIZE) {
    return;
  }
  takeDamage(game, ATTACK_DAMAGE, "waterfowl", false);
  const pref = {
    dx: Math.sign(sl.dashTargetX - sl.dashStartX),
    dy: Math.sign(sl.dashTargetY - sl.dashStartY),
  };
  pushSnakeOutOfBoss(game, pref);
}

/**
 * Damages the snake if its head is at the sword's current handle or
 * tip cell for this swipe tick. Goes through `takeDamage` so iframes
 * still apply (waterfowl is dodgeable). Not parryable.
 */
function swipeHit(game) {
  const sl = game._soulslike;
  const pose = waterfowlSwipePose(sl);
  if (!pose) {
    return;
  }
  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  if ((sx === pose.handle.x && sy === pose.handle.y) || (sx === pose.tip.x && sy === pose.tip.y)) {
    takeDamage(game, ATTACK_DAMAGE, "waterfowl", false);
  }
}

/**
 * Damages the snake if its head is within `radius` cells of the boss's
 * footprint center (Euclidean). Used by the secondary beat only.
 */
function circleHit(game, radius) {
  const sl = game._soulslike;
  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  const cx = sl.bossX + BOSS_SIZE / 2 - 0.5;
  const cy = sl.bossY + BOSS_SIZE / 2 - 0.5;
  const dx = sx - cx;
  const dy = sy - cy;
  if (dx * dx + dy * dy <= radius * radius) {
    takeDamage(game, ATTACK_DAMAGE, "waterfowl", false);
  }
}

function finishWaterfowl(sl) {
  sl.waterfowlPhase = WATERFOWL_PHASE_INACTIVE;
  sl.waterfowlTicks = 0;
  sl.pendingSpecial = false;
  sl.ticksSinceLastSpecial = 0;
  sl.bossAnim = { state: "idle", framesIn: 0 };
}
