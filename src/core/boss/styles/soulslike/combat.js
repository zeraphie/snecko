// combat.js — Soulslike player combat actions.
//
// Step 5 ships **stab**. Steps 6-7 add dodge and parry to this same
// file (they share the cost-then-state-machine pattern).
//
// Knife geometry (D3): the snake is a 1×1 fighter with a knife held
// at facing+1 (handle, visual) and facing+right (tip, damaging).
// "Right" is perpendicular-clockwise of facing, so the knife sits
// to the snake's right hand regardless of which way it's pointing.
//
// Action lifecycle: input → `stab(game)` consumes 1 stamina and arms
// `snakeAnim.state = "stab_active"`. The next boss sub-tick runs
// `tickStab(game)` which checks the knife tip vs the boss footprint,
// applies damage on hit, then ends the animation. Step 7 will hook
// staggered-boss damage scaling here; the rest is already in place.

import { tryConsume } from "./stamina.js";
import { tryMoveSnake } from "./player.js";
import { recordBossHit } from "./movement.js";
import {
  BOSS_SIZE,
  DODGE_COST,
  DODGE_DISTANCE,
  DODGE_IFRAMES,
  DODGE_RECOVERY_TICKS,
  PARRY_COST,
  PARRY_WINDOW_TICKS,
  STAGGER_MULTIPLIER,
} from "./constants.js";

const STAB_COST = 1;
const STAB_DAMAGE = 1;

/**
 * True iff the player can take an action right now. Dodge iframes,
 * dodge recovery, and the parry window all block — during any of
 * those the snake is committed and can't stab/dodge/parry. Used as
 * a hard gate at the top of every player action.
 *
 * @param {object} sl — `game._soulslike` slot
 */
export function canAct(sl) {
  return sl.dodgeIframes === 0 && sl.dodgeRecovery === 0 && sl.parryWindow === 0;
}

/**
 * Perpendicular-right of (dx, dy) — clockwise rotation in screen
 * space (y-down). Used to compute the knife tip from facing.
 *
 *   east   (1, 0)  → south (0, 1)
 *   south  (0, 1)  → west  (-1, 0)
 *   west   (-1, 0) → north (0, -1)
 *   north  (0, -1) → east  (1, 0)
 *
 * @param {number} dx
 * @param {number} dy
 * @returns {{ rx: number, ry: number }}
 */
export function rightOf(dx, dy) {
  return { rx: -dy, ry: dx };
}

/**
 * Knife position from snake position + facing + stab state.
 *
 * The fighter is right-handed: at rest the knife sits 1 cell to the
 * player's right. When the stab fires the knife jumps 1 cell forward
 * from there — a clean "thrust" motion. Single cell either way (the
 * knife is 1 cell shorter than the glaive).
 *
 * @param {number} sx
 * @param {number} sy
 * @param {number} fx
 * @param {number} fy
 * @param {boolean} stabActive — true when `snakeAnim.state === "stab_active"`
 * @returns {{ x: number, y: number }}
 */
export function knifePosition(sx, sy, fx, fy, stabActive) {
  const { rx, ry } = rightOf(fx, fy);
  const baseX = sx + rx;
  const baseY = sy + ry;
  if (stabActive) {
    return { x: baseX + fx, y: baseY + fy };
  }
  return { x: baseX, y: baseY };
}

/**
 * Stab action. Consumes 1 stamina; on success arms the
 * `stab_active` animation state for resolution on the next boss
 * sub-tick.
 *
 * @param {import('../../../game/index.js').Game} game
 * @returns {boolean} true if the stab fired, false if blocked
 */
export function stab(game) {
  const sl = game._soulslike;
  if (!sl || !canAct(sl)) {
    return false;
  }
  if (!tryConsume(game, STAB_COST)) {
    return false;
  }
  sl.snakeAnim = { state: "stab_active", framesIn: 0 };
  return true;
}

/**
 * Boss sub-tick callback for the active stab. Checks the knife tip
 * against the 2×2 boss footprint; on overlap, deals damage. Then
 * reverts to idle so the next stab can re-trigger the state.
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function tickStab(game) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  if (sl.snakeAnim.state !== "stab_active") {
    return;
  }

  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  const facing = game._playerFacing;
  // Hit detection on the active stab cell (right + forward of player).
  const tip = knifePosition(sx, sy, facing.dx, facing.dy, true);

  const insideX = tip.x >= sl.bossX && tip.x < sl.bossX + BOSS_SIZE;
  const insideY = tip.y >= sl.bossY && tip.y < sl.bossY + BOSS_SIZE;
  // Phase transition pause: boss is immune to all damage. Stab still
  // resolves the animation but lands no damage.
  if (insideX && insideY && sl.phaseTransitionTicks === 0) {
    // Stagger amplifies stab damage (D5: parry → free hit at higher
    // damage). Step 8 will use the same multiplier on any future
    // player attacks.
    const damage = sl.staggerTicks > 0 ? STAB_DAMAGE * STAGGER_MULTIPLIER : STAB_DAMAGE;
    sl.bossHp = Math.max(0, sl.bossHp - damage);
    // Feed the defensive-mode trigger — accumulated hits push the
    // boss into a retreat to break the player's pressure.
    recordBossHit(sl);
  }

  sl.snakeAnim = { state: "idle", framesIn: 0 };
}

/**
 * Dodge action. Consumes 2 stamina; on success, moves the snake up
 * to DODGE_DISTANCE cells in the held direction (or facing if no
 * input is held), bounded by walls. Sets iframes for damage
 * immunity and recovery for action lockout, then arms the
 * `dodge_active` animation state.
 *
 * @param {import('../../../game/index.js').Game} game
 * @returns {boolean} true if the dodge fired, false if blocked
 */
export function dodge(game) {
  const sl = game._soulslike;
  if (!sl || !canAct(sl)) {
    return false;
  }

  // Held direction wins; falls back to facing so a dodge with no
  // movement key still goes "forward".
  const dx = game._heldDirection?.dx ?? game._playerFacing.dx;
  const dy = game._heldDirection?.dy ?? game._playerFacing.dy;
  if (dx === 0 && dy === 0) {
    return false;
  }

  if (!tryConsume(game, DODGE_COST)) {
    return false;
  }

  // Travel up to DODGE_DISTANCE cells, stopping at walls.
  for (let i = 0; i < DODGE_DISTANCE; i++) {
    if (!tryMoveSnake(game, dx, dy)) {
      break;
    }
  }
  game._playerFacing = { dx, dy };

  sl.dodgeIframes = DODGE_IFRAMES;
  sl.dodgeRecovery = DODGE_RECOVERY_TICKS;
  sl.snakeAnim = { state: "dodge_active", framesIn: 0 };
  return true;
}

/**
 * Boss sub-tick callback: ticks down dodge iframes first, then
 * recovery. Animation transitions: `dodge_active` → `dodge_recovery`
 * (when iframes hit 0) → `idle` (when recovery hits 0). Recovery
 * is held back until iframes finish — the two phases are sequential,
 * not concurrent.
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function tickDodge(game) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  if (sl.dodgeIframes > 0) {
    sl.dodgeIframes--;
    if (sl.dodgeIframes === 0) {
      sl.snakeAnim = { state: "dodge_recovery", framesIn: 0 };
    }
    return;
  }
  if (sl.dodgeRecovery > 0) {
    sl.dodgeRecovery--;
    if (sl.dodgeRecovery === 0) {
      sl.snakeAnim = { state: "idle", framesIn: 0 };
    }
  }
}

/**
 * Parry action. Consumes 1 stamina; on success arms a 2-tick parry
 * window. While the window is open, the next parryable boss attack
 * (Step 8 attack-node `parryable: true`) converts to a boss stagger
 * instead of dealing damage — see `takeDamage` in `player.js`.
 *
 * @param {import('../../../game/index.js').Game} game
 * @returns {boolean} true if the parry fired, false if blocked
 */
export function parry(game) {
  const sl = game._soulslike;
  if (!sl || !canAct(sl)) {
    return false;
  }
  if (!tryConsume(game, PARRY_COST)) {
    return false;
  }
  sl.parryWindow = PARRY_WINDOW_TICKS;
  sl.snakeAnim = { state: "parry_active", framesIn: 0 };
  return true;
}

/**
 * Boss sub-tick callback: counts down the parry window. When the
 * window closes naturally (no parryable hit caught), reverts the
 * snake animation to idle. Successful parries (in `takeDamage`)
 * end the window early and revert anim there.
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function tickParry(game) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  if (sl.parryWindow > 0) {
    sl.parryWindow--;
    if (sl.parryWindow === 0 && sl.snakeAnim.state === "parry_active") {
      sl.snakeAnim = { state: "idle", framesIn: 0 };
    }
  }
}

/**
 * Boss sub-tick callback: counts down the stagger window. While
 * stagger is active the boss is frozen (Step 8 will gate attack
 * advancement on this) and player hits land at amplified damage
 * (already applied in `tickStab`).
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function tickStagger(game) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  if (sl.staggerTicks > 0) {
    sl.staggerTicks--;
    if (sl.staggerTicks === 0 && sl.bossAnim.state === "stagger") {
      sl.bossAnim = { state: "idle", framesIn: 0 };
    }
  }
}
