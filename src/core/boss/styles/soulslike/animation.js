// animation.js — State-machine → render wiring.
//
// The soulslike fight's animation = discrete cell-state changes, not
// per-frame interpolation (matches the cell-adapter convention in
// `docs/mechanics.md`). Each player / boss action mutates
// `_soulslike.snakeAnim.state` / `bossAnim.state`, and the screen
// render path translates those state strings into the cell types
// registered in `cell/soulslike/`.
//
// This module owns the translation table and the glaive pose lookup.
// `screens/boss.js`'s `drawSoulslikeScreen` consumes it; the cell
// files don't need to know which animation state they correspond to.

import {
  CELL_FIGHTER_IDLE,
  CELL_FIGHTER_STAB_ACTIVE,
  CELL_FIGHTER_DODGE_ACTIVE,
  CELL_FIGHTER_DODGE_RECOVERY,
  CELL_FIGHTER_PARRY_ACTIVE,
} from "../../../../render/renderer.js";
import { ATTACK_NODES, defaultGlaivePose } from "./attacks.js";
import { waterfowlSwipePose } from "./waterfowl.js";

const FIGHTER_CELL_BY_ANIM = {
  idle: CELL_FIGHTER_IDLE,
  stab_active: CELL_FIGHTER_STAB_ACTIVE,
  dodge_active: CELL_FIGHTER_DODGE_ACTIVE,
  dodge_recovery: CELL_FIGHTER_DODGE_RECOVERY,
  parry_active: CELL_FIGHTER_PARRY_ACTIVE,
};

/**
 * Maps `_soulslike.snakeAnim.state` to the registered fighter cell
 * type. Unknown / unhandled states fall back to idle so the renderer
 * can't crash on an unmapped state — but lint/dev should treat that
 * as a missing-case bug.
 *
 * @param {string} animState
 * @returns {number} CELL_FIGHTER_* constant
 */
export function fighterCellByAnim(animState) {
  return FIGHTER_CELL_BY_ANIM[animState] ?? CELL_FIGHTER_IDLE;
}

/**
 * Computes the current glaive pose from soulslike state. Idle /
 * recovery use the default forward pose. Windup uses the attack's
 * unique telegraph pose. Execute uses the swing pose at the current
 * execute tick.
 *
 * Also surfaces an `isSignifier` flag during the final tick of windup
 * — the "the strike is now" cue the cells can flash on.
 *
 * @param {object} sl — `game._soulslike` slot
 * @returns {{ handle: {x:number,y:number}, tip: {x:number,y:number}, isSignifier: boolean }}
 */
export function glaivePose(sl) {
  const facing = sl.bossFacing;
  const bx = sl.bossX;
  const by = sl.bossY;

  // Waterfowl 360° swipe owns the glaive while it's rotating.
  const swipe = waterfowlSwipePose(sl);
  if (swipe) {
    return { ...swipe, isSignifier: false };
  }

  if (sl.bossAttackId === null || sl.bossAttackPhase === null) {
    return { ...defaultGlaivePose(bx, by, facing), isSignifier: false };
  }
  const node = ATTACK_NODES.get(sl.bossAttackId);
  if (!node) {
    return { ...defaultGlaivePose(bx, by, facing), isSignifier: false };
  }
  if (sl.bossAttackPhase === "windup") {
    const pose = node.telegraphPose(bx, by, facing);
    // Last tick of windup = the signifier flash beat.
    return { ...pose, isSignifier: sl.bossAttackTicks <= 1 };
  }
  if (sl.bossAttackPhase === "execute") {
    const tick = node.executeTicks - sl.bossAttackTicks;
    return { ...node.executePose(bx, by, facing, tick), isSignifier: false };
  }
  return { ...defaultGlaivePose(bx, by, facing), isSignifier: false };
}
