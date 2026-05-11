// soulslike/index.js — Soulslike boss style: public contract.
//
// Souls/Sekiro-flavoured melee boss fight. Snake gains HP, stamina,
// dodge-roll, parry, and an active stab. Boss has HP, phases,
// telegraphed attacks, and a Waterfowl-adjacent special. See
// PLAN.soulslike-adr.md for the full design.
//
// This module is a directory rather than a single file (D19) — the
// soulslike has enough orthogonal concerns (stamina, parry/dodge/
// stab combat, attack patterns, Waterfowl, animation, phases, arena,
// death screen) that one-file packing creates a 1000-line mess.

import { LABELS } from "../../../../text/labels.js";
import { BOSS_TICK_MS, STATE_DEAD_SOULSLIKE } from "../../../game/constants.js";
import {
  SNAKE_HP_MAX,
  STAMINA_MAX,
  BOSS_HP_MAX,
  BOSS_SPAWN_X,
  BOSS_SPAWN_Y,
  SNAKE_SPAWN_DX,
  SNAKE_SPAWN_DY,
  BOSS_INITIAL_FACING_DX,
  BOSS_INITIAL_FACING_DY,
  DEATH_HOLD_TICKS,
  BOSS_DEATH_HOLD_TICKS,
} from "./constants.js";
import { tickMovement } from "./player.js";
import { regenStamina } from "./stamina.js";
import { stab, tickStab, dodge, tickDodge, parry, tickParry, tickStagger } from "./combat.js";
import { tickBossAttacks } from "./attacks.js";
import { tickPhases } from "./phases.js";
import { tickWaterfowl } from "./waterfowl.js";
import { tickBossMovement, MOVEMENT_MODE_IDLE } from "./movement.js";
import { MOVE_INTERVAL_TICKS } from "./constants.js";

/**
 * Initialises the soulslike fight: lays the arena via the boss def's
 * `bootGrid` (always called — soulslike has no host mutation, D2)
 * and seeds the full `_soulslike` state slot with v1 defaults.
 *
 * @param {import('../../../game/index.js').Game} game
 * @param {import('../../bosses/index.js').BossDef} def
 */
export function setup(game, def) {
  // Bullet-hell entities don't apply; null them so any leftover
  // state from a prior fight doesn't leak.
  game._fight = null;
  game._heldDirection = null;

  // Soulslike always re-lays the arena — no host mutation grid to
  // inherit from (D2). bootGrid handles wall layout + snake spawn;
  // it needs the def to look up `def.arena` in the parsed manifest.
  if (def?.bootGrid) {
    def.bootGrid(game, def);
  }

  // Facing follows the snake's spawn direction; subsequent input
  // updates this each tick (player.js).
  game._playerFacing = { dx: SNAKE_SPAWN_DX, dy: SNAKE_SPAWN_DY };
  game._lastBossTickTime = Date.now();
  game._lastBossMoveTime = Date.now();

  // Minimal `_boss` shim so callers reading `game._boss.name` (boss
  // rush queue, HUD, tests) keep working without a style check.
  // The full boss-entity model lives in `_soulslike` (HP, position,
  // phase, attack pipeline) — this is just for the name surface.
  game._boss = {
    name: LABELS.bosses[def.id]?.name ?? def.id ?? "Boss",
  };

  // Soulslike state slot — full shape per the ADR's Notes section.
  // Each subsystem will read/write its own fields as steps land:
  //   - HP/stamina (Steps 3, 4)
  //   - dodge/parry counters (Steps 6, 7)
  //   - boss attack pipeline (Steps 8-10)
  //   - animation (Step 11, but slots seeded now)
  //   - death screen (Step 13)
  game._soulslike = {
    // Snake fighter
    snakeHp: SNAKE_HP_MAX,
    snakeHpMax: SNAKE_HP_MAX,

    // Stamina
    stamina: STAMINA_MAX,
    staminaMax: STAMINA_MAX,
    staminaRegenCounter: 0,
    staminaDelayCounter: 0,

    // Dodge
    dodgeIframes: 0,
    dodgeRecovery: 0,

    // Parry
    parryWindow: 0,

    // Stagger (boss-side; set by parry conversion in takeDamage)
    staggerTicks: 0,

    // Boss
    bossX: BOSS_SPAWN_X,
    bossY: BOSS_SPAWN_Y,
    bossHp: BOSS_HP_MAX,
    bossHpMax: BOSS_HP_MAX,
    bossPhase: 1,
    bossFacing: { dx: BOSS_INITIAL_FACING_DX, dy: BOSS_INITIAL_FACING_DY },

    // Movement (idle strafe / aggressive charge / defensive retreat)
    movementMode: MOVEMENT_MODE_IDLE,
    movementModeLeft: 0,
    movementTimer: MOVE_INTERVAL_TICKS,
    closenessCounter: 0,
    farnessCounter: 0,
    hitsTaken: 0,
    hitDecayCounter: 0,
    strafeDirection: 1,
    prevPlayerDistance: undefined,

    // Attack pipeline (Step 8)
    bossAttackId: null,
    bossAttackPhase: null, // "windup" / "execute" / "recovery" / null
    bossAttackTicks: 0,
    bossAttackAim: null, // locked snake position for lockAim attacks
    ticksSinceLastAttack: 0,

    // Phase transition (> 0 = boss paused / immune)
    phaseTransitionTicks: 0,
    // Step 10 (Waterfowl) consumes this flag to trigger the special
    // immediately after a phase transition ends.
    pendingSpecial: false,

    // Waterfowl (Step 10) — phase = beat in the 5-beat pattern (0 =
    // inactive). `waterfowlTicks` counts down the current beat.
    // `ticksSinceLastSpecial` drives the SPECIAL_FORCE_TICKS failsafe.
    waterfowlPhase: 0,
    waterfowlTicks: 0,
    waterfowlLockX: 0,
    waterfowlLockY: 0,
    // Dash interpolation endpoints — captured at JUMP_* entry; lerp
    // bossX/Y across the dash so the boss visibly slides to the lock
    // instead of teleporting.
    dashStartX: 0,
    dashStartY: 0,
    dashTargetX: 0,
    dashTargetY: 0,
    ticksSinceLastSpecial: 0,

    // Animation (D18) — populated as steps add real states
    snakeAnim: { state: "idle", framesIn: 0 },
    bossAnim: { state: "idle", framesIn: 0 },

    // Death screen (> 0 = "YOU DIED" overlay)
    deathScreenTicks: 0,
    // Boss-death hold (> 0 = killing-blow freeze before victory exit)
    bossDeathTicks: 0,
  };
}

/**
 * Per-frame tick. Two sub-ticks like bullet-hell:
 *   - Boss sub-tick (BOSS_TICK_MS, 120 ms) — status counters
 *     (stamina regen now; dodge / parry / attack / phase pipeline
 *     in subsequent steps).
 *   - Movement sub-tick (BOSS_MOVE_MS, ~33 ms) — snake movement.
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function tick(game) {
  const now = Date.now();
  if (now - game._lastBossTickTime >= BOSS_TICK_MS) {
    game._lastBossTickTime = now;
    const sl = game._soulslike;
    if (sl && sl.snakeHp === 0) {
      // Death sequence — hold the pose, then flip to the YOU DIED
      // overlay state. Skip status / boss / phase / waterfowl ticks
      // so the freeze-frame is clean (boss attacks don't keep
      // resolving against a dead snake).
      sl.deathScreenTicks++;
      if (sl.deathScreenTicks >= DEATH_HOLD_TICKS) {
        game.state = STATE_DEAD_SOULSLIKE;
      }
    } else if (sl && sl.bossHp === 0) {
      // Killing-blow freeze — hold the boss's death pose for a few
      // ticks so the player reads the win, then route through
      // `_exitBossVictory` for the practice-hub / contraband flow.
      // Subsystems all gate on `bossHp <= 0` so nothing else fires.
      sl.bossDeathTicks++;
      if (sl.bossDeathTicks >= BOSS_DEATH_HOLD_TICKS) {
        game._exitBossVictory();
      }
    } else {
      regenStamina(game);
      tickStab(game);
      tickDodge(game);
      tickParry(game);
      tickStagger(game);
      tickBossAttacks(game);
      tickPhases(game);
      // Waterfowl runs after tickPhases so a transition that just
      // ended (`pendingSpecial` flipped true this tick) starts the
      // special on the same tick — the "immediate special" beat
      // from D10.
      tickWaterfowl(game);
      // Boss movement runs LAST so it sees the post-attack state —
      // if tickBossAttacks just kicked off an attack this tick,
      // `bossAttackId !== null` short-circuits movement (the boss is
      // committed to its swing).
      tickBossMovement(game);
    }
  }
  const sl = game._soulslike;
  if (sl && sl.snakeHp > 0 && sl.bossHp > 0) {
    tickMovement(game);
  }
}

/**
 * Routes directional input. 4-cardinal movement — no Y-lock (D6).
 * Sets the held direction (drives the movement sub-tick) and
 * facing (drives the renderer + future hit-detection from D8).
 * Steps 5-7 wire the action keys (J / K / L) via separate input
 * paths.
 *
 * @param {import('../../../game/index.js').Game} game
 * @param {number} dx
 * @param {number} dy
 */
export function onInput(game, dx, dy) {
  if (dx === 0 && dy === 0) {
    return;
  }
  game._heldDirection = { dx, dy };
  game._playerFacing = { dx, dy };
}

/**
 * Routes discrete-action input (stab / dodge / parry). Step 5 wires
 * stab; Steps 6-7 add dodge and parry to this same dispatch.
 *
 * @param {import('../../../game/index.js').Game} game
 * @param {string} action — "stab" / "dodge" / "parry"
 */
export function onAction(game, action) {
  if (action === "stab") {
    stab(game);
  } else if (action === "dodge") {
    dodge(game);
  } else if (action === "parry") {
    parry(game);
  }
}

/**
 * Clears soulslike-specific state. Called from the dispatcher's
 * _exitBossVictory / _exitBossDeath before style-agnostic
 * transitions.
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function teardown(game) {
  game._boss = null;
  game._soulslike = null;
}
