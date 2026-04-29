// fight.js — Fight controller: phase transitions, fire timing, spread shot patterns

import { fireAimed } from "./projectiles.js";
import {
  BOSS_FIRE_INTERVAL,
  BOSS_FIRE_INTERVAL_P2,
  BOSS_FIRE_INTERVAL_P3,
  BOSS_PHASE_INTRO,
  BOSS_PHASE_1,
  BOSS_PHASE_2,
  BOSS_PHASE_3,
  BOSS_INTRO_TICKS,
  BOSS_PHASE2_HP,
  BOSS_PHASE3_HP,
} from "../game/constants.js";

// ── Directional helpers ───────────────────────────────────────────

// The 8 grid directions in clockwise order starting from right.
// Used to rotate a quantised direction vector by multiples of 45°.
const DIR8 = [
  [1, 0], // 0  right
  [1, 1], // 1  down-right
  [0, 1], // 2  down
  [-1, 1], // 3  down-left
  [-1, 0], // 4  left
  [-1, -1], // 5  up-left
  [0, -1], // 6  up
  [1, -1], // 7  up-right
];

/**
 * Rotates a quantised direction vector by `steps` × 45° (positive = CW).
 * If the vector isn't one of the 8 standard grid directions, returns it unchanged.
 *
 * @param {number} dx
 * @param {number} dy
 * @param {number} steps — integer, positive = clockwise
 * @returns {[number, number]}
 */
function rotateDir(dx, dy, steps) {
  const idx = DIR8.findIndex(([x, y]) => x === dx && y === dy);
  if (idx === -1) {
    return [dx, dy];
  }
  const newIdx = (((idx + steps) % 8) + 8) % 8;
  return DIR8[newIdx];
}

// Fire intervals indexed by phase constant (BOSS_PHASE_1 / _P2 / _P3).
const FIRE_INTERVALS = {
  [BOSS_PHASE_1]: BOSS_FIRE_INTERVAL,
  [BOSS_PHASE_2]: BOSS_FIRE_INTERVAL_P2,
  [BOSS_PHASE_3]: BOSS_FIRE_INTERVAL_P3,
};

// ── FightController ───────────────────────────────────────────────

/**
 * Manages the boss fight phase lifecycle and firing patterns.
 *
 * Phases:
 *   BOSS_PHASE_INTRO — safe window, no firing (room for a spawn animation)
 *   BOSS_PHASE_1     — single aimed shot every BOSS_FIRE_INTERVAL ticks
 *   BOSS_PHASE_2     — triple spread ±45° every BOSS_FIRE_INTERVAL_P2 ticks
 *   BOSS_PHASE_3     — triple spread ±90° every BOSS_FIRE_INTERVAL_P3 ticks
 *
 * Phases only ever escalate — they never de-escalate mid-fight.
 */
export class FightController {
  constructor() {
    /** @type {number} Current phase constant (BOSS_PHASE_*). */
    this.phase = BOSS_PHASE_INTRO;
    /** @type {number} Remaining intro ticks before combat begins. */
    this._introTicks = BOSS_INTRO_TICKS;
    /** @type {number} Ticks elapsed since last shot. */
    this._fireCounter = 0;
  }

  // ── Phase management ──────────────────────────────────────────

  /**
   * Called once per boss tick (before firing).
   * Counts down the intro safe window; afterwards escalates phase based on
   * current boss HP. Phases only ever increase.
   *
   * @param {number} bossHp — current boss HP after any hit this tick
   */
  advancePhase(bossHp) {
    if (this.phase === BOSS_PHASE_INTRO) {
      this._introTicks--;
      if (this._introTicks <= 0) {
        this.phase = BOSS_PHASE_1;
        this._fireCounter = 0;
      }
      return;
    }

    if (bossHp <= BOSS_PHASE3_HP && this.phase < BOSS_PHASE_3) {
      this.phase = BOSS_PHASE_3;
      this._fireCounter = 0;
    } else if (bossHp <= BOSS_PHASE2_HP && this.phase < BOSS_PHASE_2) {
      this.phase = BOSS_PHASE_2;
      this._fireCounter = 0;
    }
  }

  // ── Firing ────────────────────────────────────────────────────

  /**
   * Advances the fire counter and returns true when the boss should fire.
   * Always returns false during the intro window or while the boss is staggered.
   *
   * @param {boolean} isStaggered
   * @returns {boolean}
   */
  shouldFire(isStaggered) {
    if (this.phase === BOSS_PHASE_INTRO || isStaggered) {
      return false;
    }
    this._fireCounter++;
    const interval = FIRE_INTERVALS[this.phase] ?? BOSS_FIRE_INTERVAL;
    if (this._fireCounter >= interval) {
      this._fireCounter = 0;
      return true;
    }
    return false;
  }

  /**
   * Builds the projectile(s) to spawn this tick based on the current phase.
   *
   *   Phase 1 — single aimed shot
   *   Phase 2 — aimed + ±45° flankers  (3 total)
   *   Phase 3 — aimed + ±90° flankers  (3 total, wider spread)
   *
   * Returns an empty array if the source and target are the same cell.
   *
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} toX
   * @param {number} toY
   * @returns {Array<{x:number, y:number, dx:number, dy:number}>}
   */
  buildShots(fromX, fromY, toX, toY) {
    const main = fireAimed(fromX, fromY, toX, toY);
    if (!main) {
      return [];
    }

    if (this.phase === BOSS_PHASE_1) {
      return [main];
    }

    // Phase 2: ±1 step (±45°)   Phase 3: ±2 steps (±90°)
    const spread = this.phase === BOSS_PHASE_2 ? 1 : 2;
    const [rdx, rdy] = rotateDir(main.dx, main.dy, spread);
    const [ldx, ldy] = rotateDir(main.dx, main.dy, -spread);

    return [
      main,
      { x: fromX, y: fromY, dx: rdx, dy: rdy },
      { x: fromX, y: fromY, dx: ldx, dy: ldy },
    ];
  }
}
