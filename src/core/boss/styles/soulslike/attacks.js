// attacks.js — Boss attack node registry, selection, and state machine.
//
// Attacks are **data nodes** registered in `ATTACK_NODES`, not a switch
// statement (D21: extensibility — new attacks add a node, combos set
// `followUp`, conditional attacks use `gate`). v1 ships four attacks:
//
//   sweep     — adjacent (D=1), parryable, tip arcs across 3 front cells
//   regular   — 1 between (D=2), parryable, straight thrust at reach 2
//   overhead  — 2+ between (D≥3), NOT parryable, heavy strike at reach 3
//   kick      — adjacent + recent attack (D17), parryable, shove at reach 1
//
// Each node has two pose helpers used by both hit-detection and the
// renderer:
//   - `telegraphPose(bx, by, facing)` returns the glaive's `{handle,
//     tip}` cells during windup — placed in a position UNIQUE to the
//     attack so the player can learn the prep-to-strike mapping. The
//     pose is deliberately NOT in front of the boss; the front lane is
//     reserved for the actual swing.
//   - `executePose(bx, by, facing, tick)` returns the glaive cells at
//     the given execute tick. The `tip` cell is the live hitbox.
//
// `lockAim` locks the boss's FACING at execute start (so the player
// can't bait an in-flight strike by stepping to one side). Hit cells
// are always `boss + facing × reach` — never an arbitrary aim cell.
// The "signifier" beat (final tick of windup) is surfaced via context
// so the renderer can flash the weapon just before the swing.
//
// Selection (D7) brackets by Manhattan distance to the boss with a
// 90/10 alternate roll. Kick gate fires only when an attack just
// finished (`ticksSinceLastAttack < KICK_RECENT_THRESHOLD`).
//
// State machine: idle → windup → execute → recovery → idle.
// Stagger (Step 7) pauses the pipeline. Boss-defeated (HP 0) stops it.
// Waterfowl (Step 10) preempts via `waterfowlPhase > 0`.

import { takeDamage } from "./player.js";
import {
  ARENA_INNER_X0,
  ARENA_INNER_Y0,
  ARENA_INNER_SIZE,
  BOSS_SIZE,
  ATTACK_ALTERNATE_PROBABILITY,
  ATTACK_DAMAGE,
  KICK_RECENT_THRESHOLD,
  SWEEP_WINDUP_TICKS,
  SWEEP_EXECUTE_TICKS,
  SWEEP_RECOVERY_TICKS,
  REGULAR_WINDUP_TICKS,
  REGULAR_EXECUTE_TICKS,
  REGULAR_RECOVERY_TICKS,
  OVERHEAD_WINDUP_TICKS,
  OVERHEAD_EXECUTE_TICKS,
  OVERHEAD_RECOVERY_TICKS,
  KICK_WINDUP_TICKS,
  KICK_EXECUTE_TICKS,
  KICK_RECOVERY_TICKS,
  REGULAR_REACH,
  OVERHEAD_REACH,
} from "./constants.js";

// ── Geometry helpers ─────────────────────────────────────────────

/**
 * Manhattan distance from (px, py) to the closest cell of the
 * BOSS_SIZE×BOSS_SIZE boss footprint at (bossX, bossY). Returns 0 if
 * (px, py) is inside.
 */
export function manhattanToBoss(px, py, bossX, bossY) {
  const dx = Math.max(0, bossX - px, px - (bossX + BOSS_SIZE - 1));
  const dy = Math.max(0, bossY - py, py - (bossY + BOSS_SIZE - 1));
  return dx + dy;
}

/**
 * Snap-to-cardinal facing from boss toward the snake. Dominant axis
 * wins; ties go horizontal.
 */
export function computeBossFacing(bossX, bossY, snakeX, snakeY) {
  const cx = bossX + BOSS_SIZE / 2;
  const cy = bossY + BOSS_SIZE / 2;
  const dx = snakeX - cx;
  const dy = snakeY - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { dx: dx >= 0 ? 1 : -1, dy: 0 };
  }
  return { dx: 0, dy: dy >= 0 ? 1 : -1 };
}

/** Perpendicular-CW rotation (screen-space, y-down). */
function perpCW(facing) {
  return { dx: -facing.dy, dy: facing.dx };
}

/** Perpendicular-CCW rotation. */
function perpCCW(facing) {
  return { dx: facing.dy, dy: -facing.dx };
}

/** Anti-facing — directly behind the boss. */
function antiFacing(facing) {
  return { dx: -facing.dx, dy: -facing.dy };
}

/**
 * Returns the cell `n` reaches from the boss's footprint edge in `dir`.
 * For 1×1 boss this is just `(bx, by) + dir × n`. For 2×2 boss the
 * formula picks the edge cell on the requested side first (so reach 1
 * is always 1 cell beyond the footprint, never inside it).
 */
function reachFrom(bx, by, dir, n) {
  const startX = dir.dx > 0 ? bx + BOSS_SIZE - 1 : bx;
  const startY = dir.dy > 0 ? by + BOSS_SIZE - 1 : by;
  return {
    x: startX + dir.dx * n,
    y: startY + dir.dy * n,
  };
}

/** Default glaive pose for idle/recovery: 1 + 2 cells beyond the front edge. */
export function defaultGlaivePose(bx, by, facing) {
  return {
    handle: reachFrom(bx, by, facing, 1),
    tip: reachFrom(bx, by, facing, 2),
  };
}

/**
 * Attempts to step the BOSS_SIZE×BOSS_SIZE boss footprint one cell in
 * the given direction. No-op if the new footprint would clip the
 * arena ring or any wall. Used by overhead (lunge) and kick (shove);
 * kick uses its own collision handling for snake overlap.
 *
 * @param {import('../../../game/index.js').Game} game
 * @param {{ dx: number, dy: number }} dir
 * @param {boolean} [allowSnake=false] — if true, the new footprint may
 *   overlap the snake (kick semantics — caller handles damage + push).
 * @returns {boolean} true if the step happened
 */
export function tryStepBoss(game, dir, allowSnake = false) {
  const sl = game._soulslike;
  if (!sl) {
    return false;
  }
  const nx = sl.bossX + dir.dx;
  const ny = sl.bossY + dir.dy;
  const grid = game.grid;
  for (let dy = 0; dy < BOSS_SIZE; dy++) {
    for (let dx = 0; dx < BOSS_SIZE; dx++) {
      const cx = nx + dx;
      const cy = ny + dy;
      if (
        cx < ARENA_INNER_X0 ||
        cx >= ARENA_INNER_X0 + ARENA_INNER_SIZE ||
        cy < ARENA_INNER_Y0 ||
        cy >= ARENA_INNER_Y0 + ARENA_INNER_SIZE
      ) {
        return false;
      }
      if (grid.isWallCell(cx, cy)) {
        return false;
      }
      if (!allowSnake) {
        const headIdx = game.snake.headIndex;
        if (game.snake.snakeX[headIdx] === cx && game.snake.snakeY[headIdx] === cy) {
          return false;
        }
      }
    }
  }
  sl.bossX = nx;
  sl.bossY = ny;
  return true;
}

// ── Attack node registry ─────────────────────────────────────────

/**
 * @typedef {Object} AttackNode
 * @property {string} id
 * @property {number} windupTicks
 * @property {number} executeTicks
 * @property {number} recoveryTicks
 * @property {boolean} parryable
 * @property {number} damage
 * @property {boolean} lockAim — locks boss facing at execute start
 * @property {(bx:number, by:number, facing:{dx:number,dy:number}) =>
 *   {handle:{x:number,y:number}, tip:{x:number,y:number}}} telegraphPose
 * @property {(bx:number, by:number, facing:{dx:number,dy:number}, tick:number) =>
 *   {handle:{x:number,y:number}, tip:{x:number,y:number}}} executePose
 * @property {(sl: object) => boolean} [gate] — optional predicate
 */

/** @type {Map<string, AttackNode>} */
export const ATTACK_NODES = new Map();

// SWEEP — glaive prepped to the perpendicular sides of the boss, then
// arcs across the front row over 3 execute ticks:
//   tick 0 → forward-left  (front cell + perp-left of facing)
//   tick 1 → in front      (front cell directly ahead)
//   tick 2 → forward-right (front cell + perp-right of facing)
// All 3 cells sit 1 reach outside the boss footprint. The handle is
// nominally at the boss top-left and gets skipped by the screen layer
// (it would overlap the body+arms render).
ATTACK_NODES.set("sweep", {
  id: "sweep",
  windupTicks: SWEEP_WINDUP_TICKS,
  executeTicks: SWEEP_EXECUTE_TICKS,
  recoveryTicks: SWEEP_RECOVERY_TICKS,
  parryable: true,
  damage: ATTACK_DAMAGE,
  lockAim: false,
  telegraphPose: (bx, by, facing) => ({
    handle: reachFrom(bx, by, perpCCW(facing), 1),
    tip: reachFrom(bx, by, perpCW(facing), 1),
  }),
  executePose: (bx, by, facing, tick) => {
    const front = reachFrom(bx, by, facing, 1);
    let perp = { dx: 0, dy: 0 };
    if (tick === 0) {
      perp = perpCCW(facing); // forward-left
    } else if (tick === 2) {
      perp = perpCW(facing); // forward-right
    }
    return {
      handle: { x: bx, y: by },
      tip: { x: front.x + perp.dx, y: front.y + perp.dy },
    };
  },
});

// REGULAR — glaive cocked behind boss (handle + tip behind), then
// thrusts forward to reach 2.
ATTACK_NODES.set("regular", {
  id: "regular",
  windupTicks: REGULAR_WINDUP_TICKS,
  executeTicks: REGULAR_EXECUTE_TICKS,
  recoveryTicks: REGULAR_RECOVERY_TICKS,
  parryable: true,
  damage: ATTACK_DAMAGE,
  lockAim: true,
  telegraphPose: (bx, by, facing) => ({
    handle: reachFrom(bx, by, antiFacing(facing), 1),
    tip: reachFrom(bx, by, antiFacing(facing), 2),
  }),
  executePose: (bx, by, facing, tick) => {
    // Tick 0: tip at reach 1 (mid-thrust).
    // Tick 1: tip at reach 2 (full extension — the hit window).
    // Tick 2: tip at reach 1 (retracting).
    const reach = tick === 1 ? REGULAR_REACH : 1;
    return {
      handle: reachFrom(bx, by, facing, 1),
      tip: reachFrom(bx, by, facing, reach),
    };
  },
});

// OVERHEAD — glaive raised behind + angled to the CW side. Strike
// sweeps down through reach 1 → 2 → 3 → 2 (retract).
ATTACK_NODES.set("overhead", {
  id: "overhead",
  windupTicks: OVERHEAD_WINDUP_TICKS,
  executeTicks: OVERHEAD_EXECUTE_TICKS,
  recoveryTicks: OVERHEAD_RECOVERY_TICKS,
  parryable: false,
  damage: ATTACK_DAMAGE,
  lockAim: true,
  telegraphPose: (bx, by, facing) => {
    const back = reachFrom(bx, by, antiFacing(facing), 1);
    const cw = perpCW(facing);
    return {
      handle: back,
      tip: { x: back.x + cw.dx, y: back.y + cw.dy },
    };
  },
  executePose: (bx, by, facing, tick) => {
    // Strike trajectory: 1 → 2 → 3 → 2 (4 execute ticks).
    let reach;
    if (tick === 0) {
      reach = 1;
    } else if (tick === 1) {
      reach = 2;
    } else if (tick === 2) {
      reach = OVERHEAD_REACH;
    } else {
      reach = 2;
    }
    return {
      handle: reachFrom(bx, by, facing, 1),
      tip: reachFrom(bx, by, facing, reach),
    };
  },
});

// KICK — glaive stays lowered to the CCW side (out of the way); the
// BOSS MODEL is what moves. The kick is the boss lunging into the
// player. Collision handled in `executeKick` (called from the state
// machine on execute start): if the snake is in the cell the boss is
// stepping into, snake takes damage and gets pushed 1 cell forward
// (boss continues into the now-empty cell). If the snake can't be
// pushed (wall behind), the boss can't move and the kick whiffs but
// still lands damage.
ATTACK_NODES.set("kick", {
  id: "kick",
  windupTicks: KICK_WINDUP_TICKS,
  executeTicks: KICK_EXECUTE_TICKS,
  recoveryTicks: KICK_RECOVERY_TICKS,
  parryable: true,
  damage: ATTACK_DAMAGE,
  lockAim: false,
  telegraphPose: (bx, by, facing) => ({
    handle: reachFrom(bx, by, perpCCW(facing), 1),
    tip: reachFrom(bx, by, perpCCW(facing), 2),
  }),
  // Glaive stays lowered during execute — the boss is the attacker.
  // (`screens/boss.js` skips handles that land inside the boss
  // footprint, so no over-render.)
  executePose: (bx, by, facing, _tick) => ({
    handle: reachFrom(bx, by, perpCCW(facing), 1),
    tip: reachFrom(bx, by, perpCCW(facing), 2),
  }),
  // D17: kick fires only after a recent attack — the "you tucked
  // inside, now eat a kick" tool. ticksSinceLastAttack increments
  // each idle tick; resets on attack start.
  gate: (sl) => sl.ticksSinceLastAttack < KICK_RECENT_THRESHOLD,
});

// Waterfowl is registered for parity with the other attacks (death-cause
// lookup, future attack-list HUD, registry-based regression tests) but
// runs through its own 5-beat state machine in `waterfowl.js` rather
// than the standard windup/execute/recovery pipeline. The selector
// never picks it; the special trigger in `waterfowl.js` does.
ATTACK_NODES.set("waterfowl", {
  id: "waterfowl",
  windupTicks: 0,
  executeTicks: 0,
  recoveryTicks: 0,
  parryable: false,
  damage: ATTACK_DAMAGE,
  lockAim: false,
  telegraphPose: defaultGlaivePose,
  executePose: defaultGlaivePose,
});

// ── Selection ────────────────────────────────────────────────────

/**
 * Picks the next attack node based on Manhattan distance brackets
 * (D7) with a 90/10 alternate roll for variety. Kick is preferred
 * over sweep at adjacent distance when its gate is open.
 */
export function selectNextAttack(game, rand = Math.random) {
  const sl = game._soulslike;
  if (!sl) {
    return null;
  }
  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  const dist = manhattanToBoss(sx, sy, sl.bossX, sl.bossY);

  // Bracket primary attack.
  let primaryId;
  if (dist <= 1) {
    const kick = ATTACK_NODES.get("kick");
    primaryId = kick?.gate?.(sl) ? "kick" : "sweep";
  } else if (dist === 2) {
    primaryId = "regular";
  } else {
    primaryId = "overhead";
  }

  // 10% chance to roll an alternate distance bracket.
  if (rand() < ATTACK_ALTERNATE_PROBABILITY) {
    const others = ["sweep", "regular", "overhead"].filter((id) => id !== primaryId);
    primaryId = others[Math.floor(rand() * others.length)] ?? primaryId;
  }

  const node = ATTACK_NODES.get(primaryId);
  if (!node) {
    return null;
  }
  // Gate filter — if the picked attack's gate rejects, fall back to
  // the bracket default (sweep at adjacent if kick is gated out).
  if (node.gate && !node.gate(sl)) {
    return ATTACK_NODES.get("sweep") ?? null;
  }
  return node;
}

// ── State machine ────────────────────────────────────────────────

function startAttack(game, node) {
  const sl = game._soulslike;
  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];

  sl.bossFacing = computeBossFacing(sl.bossX, sl.bossY, sx, sy);
  sl.bossAttackId = node.id;
  sl.bossAttackPhase = "windup";
  sl.bossAttackTicks = node.windupTicks;
  // lockAim is "have we committed our facing yet for this attack?".
  // Cleared on every windup; set to true at execute start for lockAim
  // attacks. The renderer reads `bossFacing` as authoritative either
  // way; the boolean just keeps the state machine readable.
  sl.bossAttackAim = null;
  sl.bossAnim = { state: `windup_${node.id}`, framesIn: 0 };
  sl.ticksSinceLastAttack = 0;
}

function advancePhase(game) {
  const sl = game._soulslike;
  const node = ATTACK_NODES.get(sl.bossAttackId);
  if (!node) {
    return;
  }
  if (sl.bossAttackPhase === "windup") {
    if (node.lockAim) {
      // Re-snap to current snake position one last time — this is the
      // "commitment" moment. After this the facing is locked through
      // execute (no re-aim per tick).
      const headIdx = game.snake.headIndex;
      sl.bossFacing = computeBossFacing(
        sl.bossX,
        sl.bossY,
        game.snake.snakeX[headIdx],
        game.snake.snakeY[headIdx]
      );
    }
    // Overhead lunges the boss 1 cell forward at execute start, then
    // the long-reach swing plays from the new position. Skips the
    // step when the lunge would clip a wall or the arena edge.
    if (sl.bossAttackId === "overhead") {
      tryStepBoss(game, sl.bossFacing);
    }
    // Kick is the boss lunging at the player. Damage + push happens
    // on execute start; subsequent ticks are just recovery/anim.
    if (sl.bossAttackId === "kick") {
      executeKick(game);
    }
    sl.bossAttackPhase = "execute";
    sl.bossAttackTicks = node.executeTicks;
    sl.bossAnim = { state: `execute_${node.id}`, framesIn: 0 };
  } else if (sl.bossAttackPhase === "execute") {
    sl.bossAttackPhase = "recovery";
    sl.bossAttackTicks = node.recoveryTicks;
    sl.bossAnim = { state: `recovery_${node.id}`, framesIn: 0 };
  } else if (sl.bossAttackPhase === "recovery") {
    sl.bossAttackId = null;
    sl.bossAttackPhase = null;
    sl.bossAttackTicks = 0;
    sl.bossAnim = { state: "idle", framesIn: 0 };
  }
}

/**
 * Kick execution: boss model steps forward. If the snake is in the
 * cell the boss is stepping into, the snake takes damage and gets
 * pushed 1 cell in the boss's facing direction (and the boss
 * completes the step into the now-empty cell). If the snake can't
 * be pushed (wall / arena edge behind them), damage still lands but
 * neither the boss nor the snake move. Walls and arena edges block
 * the kick entirely (no damage, no movement).
 *
 * Damage routes through `takeDamage`, so iframes and parry still work
 * (kick is parryable).
 */
function executeKick(game) {
  const sl = game._soulslike;
  const facing = sl.bossFacing;
  const nx = sl.bossX + facing.dx;
  const ny = sl.bossY + facing.dy;
  const grid = game.grid;

  // Arena bounds + wall check on the new footprint. We allow snake in
  // the way — that's the kick landing.
  for (let dy = 0; dy < BOSS_SIZE; dy++) {
    for (let dx = 0; dx < BOSS_SIZE; dx++) {
      const cx = nx + dx;
      const cy = ny + dy;
      if (
        cx < ARENA_INNER_X0 ||
        cx >= ARENA_INNER_X0 + ARENA_INNER_SIZE ||
        cy < ARENA_INNER_Y0 ||
        cy >= ARENA_INNER_Y0 + ARENA_INNER_SIZE
      ) {
        return;
      }
      if (grid.isWallCell(cx, cy)) {
        return;
      }
    }
  }

  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  const snakeInFootprint = sx >= nx && sx < nx + BOSS_SIZE && sy >= ny && sy < ny + BOSS_SIZE;

  if (!snakeInFootprint) {
    sl.bossX = nx;
    sl.bossY = ny;
    return;
  }

  // Snake is in the way — try to push them 1 cell further in facing.
  const pushX = sx + facing.dx;
  const pushY = sy + facing.dy;
  const pushOk =
    pushX >= ARENA_INNER_X0 &&
    pushX < ARENA_INNER_X0 + ARENA_INNER_SIZE &&
    pushY >= ARENA_INNER_Y0 &&
    pushY < ARENA_INNER_Y0 + ARENA_INNER_SIZE &&
    !grid.isWallCell(pushX, pushY);

  // Damage either way — kick connects. Parry / iframes route through
  // `takeDamage` and may convert/block.
  takeDamage(game, ATTACK_DAMAGE, "kick", true);

  if (pushOk) {
    grid.clearCell("snake", sx, sy);
    game.snake.snakeX[headIdx] = pushX;
    game.snake.snakeY[headIdx] = pushY;
    grid.setCell("snake", pushX, pushY);
    sl.bossX = nx;
    sl.bossY = ny;
  }
}

function resolveHit(game) {
  const sl = game._soulslike;
  const node = ATTACK_NODES.get(sl.bossAttackId);
  if (!node) {
    return;
  }
  const executeTick = node.executeTicks - sl.bossAttackTicks;
  const pose = node.executePose(sl.bossX, sl.bossY, sl.bossFacing, executeTick);
  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  if (pose.tip.x === sx && pose.tip.y === sy) {
    // Death cause = attack id (D15). takeDamage routes through iframes
    // (Step 6) and parry (Step 7).
    takeDamage(game, node.damage, node.id, node.parryable);
  }
}

/**
 * Boss sub-tick callback: advances the attack pipeline. Stagger /
 * phase transitions / waterfowl pause progression; boss-defeated ends
 * it. Idle ticks accumulate `ticksSinceLastAttack` for the kick gate.
 */
export function tickBossAttacks(game, rand = Math.random) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  if (sl.staggerTicks > 0) {
    return;
  }
  if (sl.phaseTransitionTicks > 0) {
    return;
  }
  if (sl.waterfowlPhase > 0) {
    return;
  }
  if (sl.bossHp <= 0) {
    return;
  }
  if (sl.snakeHp <= 0) {
    // Death sequence is running — don't let the boss queue further
    // attacks (and overwrite `deathCause` with whatever lands next).
    return;
  }

  if (sl.bossAttackId === null) {
    sl.ticksSinceLastAttack++;
    const node = selectNextAttack(game, rand);
    if (node) {
      startAttack(game, node);
    }
    return;
  }

  // Hit resolution before counter advance: each execute tick gets one
  // chance to hit at the current swing position.
  if (sl.bossAttackPhase === "execute") {
    resolveHit(game);
  }

  sl.bossAttackTicks--;
  if (sl.bossAttackTicks <= 0) {
    advancePhase(game);
  }
}
