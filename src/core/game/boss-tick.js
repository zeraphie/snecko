// boss-tick.js — Boss style dispatcher.
//
// Reads `game._bossDef.style` (defaulting to "bullet_hell") and forwards
// `setup` / `tick` / `teardown` to the matching style module. The shared
// transitions (STATE_BOSS, contraband draft on victory, _endRun on death,
// practice flow shortcuts) live here; everything style-specific lives in
// `src/core/boss/styles/<name>.js`.

import * as bulletHell from "../boss/styles/bullet-hell.js";
import * as survival from "../boss/styles/survival.js";
import * as soulslike from "../boss/styles/soulslike/index.js";
import { getBossDef, getBossDefById } from "../boss/bosses/index.js";
import { generateContrabandPool } from "../upgrades/contraband/index.js";
import { STATE_BOSS, STATE_CONTRABAND, STATE_PRACTICE_HUB, BOSS_FOOD_REWARD } from "./constants.js";

// ── Style registry ─────────────────────────────────────────────────

const STYLES = {
  bullet_hell: bulletHell,
  survival,
  soulslike,
};

/**
 * Resolves the style module for a given boss def. Falls back to
 * bullet-hell if the def's style key is missing or unknown.
 *
 * @param {import('../boss/bosses/index.js').BossDef} def
 */
function getStyle(def) {
  return STYLES[def?.style ?? "bullet_hell"] ?? STYLES.bullet_hell;
}

// ── Tick ───────────────────────────────────────────────────────────

/**
 * Dispatches the per-frame tick to the active boss style.
 */
export function _bossTick() {
  const style = getStyle(this._bossDef);
  style.tick(this);
}

/**
 * Dispatches directional input to the active boss style. Bullet-hell
 * routes through `_heldDirection` (Y-locked); survival forwards to
 * `snake.setNextDirection` (4-directional maze movement).
 *
 * @param {number} dx
 * @param {number} dy
 */
export function _bossOnInput(dx, dy) {
  const style = getStyle(this._bossDef);
  style.onInput?.(this, dx, dy);
}

/**
 * Dispatches a discrete action (stab / dodge / parry) to the
 * active boss style. Soulslike consumes these; bullet-hell and
 * survival ignore by not implementing onAction.
 *
 * @param {string} action — "stab" / "dodge" / "parry"
 */
export function _bossOnAction(action) {
  const style = getStyle(this._bossDef);
  style.onAction?.(this, action);
}

// ── Entry ──────────────────────────────────────────────────────────

/**
 * Resolves the boss def (with practice override), records it on the game,
 * delegates style-specific setup, and transitions to STATE_BOSS.
 *
 * Called when the snake eats a red food cell.
 */
export function _enterBossFight() {
  // Practice flows pre-set `_practiceBossId` to spawn a specific boss
  // regardless of mutation; clear it after consumption so subsequent
  // (rush) entries can repoint to a different boss.
  let def;
  if (this._practiceBossId) {
    def = getBossDefById(this._practiceBossId) ?? getBossDef(this.upgrades.mutation);
    this._practiceBossId = null;
  } else {
    def = getBossDef(this.upgrades.mutation);
  }

  this._bossDef = def;
  const style = getStyle(def);
  style.setup(this, def);
  this.state = STATE_BOSS;
}

// ── Victory ────────────────────────────────────────────────────────

/**
 * Awards BOSS_FOOD_REWARD food-progress, then opens the Contraband draft.
 *
 * Practice flow override:
 *   - 'single' practice → return to the practice hub immediately,
 *     no contraband draft, no progress saved.
 *   - 'rush'   practice → contraband draft, then on confirmation the
 *     next boss in the queue spawns (or the rush-complete screen if
 *     the queue is empty). `confirmContraband` handles that branch.
 */
export function _exitBossVictory() {
  const styleKey = this._bossDef?.style ?? "bullet_hell";
  const style = getStyle(this._bossDef);
  style.teardown(this);
  this._bossDef = null;

  if (this._practiceMode === "single") {
    this._practiceMode = null;
    this.state = STATE_PRACTICE_HUB;
    return;
  }

  if (this._practiceMode !== "rush") {
    this.foodEaten += BOSS_FOOD_REWARD;
  }

  this._contrabandPool = generateContrabandPool(Math.random, styleKey);
  this._contrabandSelection = 0;
  this.state = STATE_CONTRABAND;
}

// ── Death ──────────────────────────────────────────────────────────

/**
 * Handles player death during a boss fight.
 *
 * In a practice fight (single or rush) the death is silent — no
 * leaderboard record, no name prompt — the player just bounces back
 * to the practice hub.
 *
 * @param {string} cause — 'wall' | 'boss' | 'projectile'
 */
export function _exitBossDeath(cause) {
  this.snake.deathCause = cause;
  const style = getStyle(this._bossDef);
  style.teardown(this);
  this._bossDef = null;

  if (this._practiceMode) {
    this._practiceMode = null;
    this._bossRushQueue = [];
    this._bossRushTotal = 0;
    this._practiceBossId = null;
    this.state = STATE_PRACTICE_HUB;
    return;
  }

  this._endRun();
}
