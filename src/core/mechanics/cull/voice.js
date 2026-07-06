// cull/voice.js — Speech-bubble queue for Sir Reginald Caw.
//
// Reginald talks. Three categories surface:
//
//   "death" — fired when a kin is fully sunk, with the kin's name
//             substituted into the toast template ({name}).
//   "idle"  — Reginald muttering to himself between throws, on a
//             wall-clock interval of `random([10, 20]) s`.
//   "pity"  — fired right before a pity-forced telegraph. Cannot be
//             preempted; dwells through the 1 s telegraph fuse so the
//             "found you" beat coincides with the cell lighting up.
//
// One line at a time. New lines append to `voiceQueue`; pity bypasses
// the queue and becomes the active line immediately (it competes with
// telegraph timing). Active lines dwell ~3.5 s by default; once an
// active line has dwelled ≥ 1 s and a new line is queued, the active
// line is preempted (skipped to the next). Pity is exempt — never
// preempted, never preempts mid-pity.
//
// State (lives on game.mechanic):
//   voiceQueue        — array of pending `{ text, category, dwellMs }`.
//   activeLine        — currently displayed line or null.
//   activeLineDwellMs — ms the active line has dwelled so far.
//   idleTauntElapsedMs — ms since the last idle taunt push.
//   nextIdleTauntAt   — ms cadence target for the next idle push;
//                       rolled lazily on first tick + on each fire.

import {
  DEATH_TOASTS,
  IDLE_TAUNTS,
  PITY_TAUNTS,
  BLOCK_TAUNTS,
  STUN_TAUNTS,
} from "../../../text/cull/index.js";
import { IDLE_TAUNT_MIN_MS, IDLE_TAUNT_MAX_MS } from "./constants.js";

/** Default dwell for queue-driven lines (death + idle). */
export const DEFAULT_DWELL_MS = 3500;
/** Pity dwell — long enough to cover the 1 s telegraph fuse + a beat. */
export const PITY_DWELL_MS = 1300;
/** Active line must dwell at least this long before a queued line can preempt. */
export const PREEMPT_AFTER_MS = 1000;

export const VOICE_DEATH = "death";
export const VOICE_IDLE = "idle";
export const VOICE_PITY = "pity";
export const VOICE_BLOCK = "block";
export const VOICE_STUN = "stun";

/**
 * Pushes a death toast for the just-sunk kin onto the queue. Picks a
 * random template from `DEATH_TOASTS` and substitutes `{name}` with the
 * kin's hatchling name.
 *
 * @param {object} m — `game.mechanic` (cull)
 * @param {string} kinName
 * @param {() => number} [rand]
 */
export function pushDeathToast(m, kinName, rand = Math.random) {
  const template = DEATH_TOASTS[Math.floor(rand() * DEATH_TOASTS.length)];
  // `replaceAll` — some templates repeat `{name}` for extra theatrics.
  const text = template.replaceAll("{name}", kinName);
  m.voiceQueue.push({ text, category: VOICE_DEATH, dwellMs: DEFAULT_DWELL_MS });
}

/**
 * Pushes a random idle taunt onto the queue.
 *
 * @param {object} m
 * @param {() => number} [rand]
 */
export function pushIdleTaunt(m, rand = Math.random) {
  const text = IDLE_TAUNTS[Math.floor(rand() * IDLE_TAUNTS.length)];
  m.voiceQueue.push({ text, category: VOICE_IDLE, dwellMs: DEFAULT_DWELL_MS });
}

/**
 * Pushes a random block taunt — Reginald reacting to a shielded kin
 * absorbing a hit. Goes through the normal queue (death/pity still
 * outrank it if they fire in the same window).
 *
 * @param {object} m
 * @param {() => number} [rand]
 */
export function pushBlockTaunt(m, rand = Math.random) {
  const text = BLOCK_TAUNTS[Math.floor(rand() * BLOCK_TAUNTS.length)];
  m.voiceQueue.push({ text, category: VOICE_BLOCK, dwellMs: DEFAULT_DWELL_MS });
}

/**
 * Pushes a stun taunt — Reginald yelping after a throw detonates one
 * of the player's mines. Installed as the active line immediately
 * (like pity) because the beat must coincide with the detonation flash
 * to read; otherwise a queued death/idle line would eat the moment.
 *
 * @param {object} m
 * @param {() => number} [rand]
 */
export function pushStunTaunt(m, rand = Math.random) {
  const text = STUN_TAUNTS[Math.floor(rand() * STUN_TAUNTS.length)];
  m.activeLine = { text, category: VOICE_STUN, dwellMs: DEFAULT_DWELL_MS };
  m.activeLineDwellMs = 0;
}

/**
 * Installs a pity taunt as the active line immediately, bypassing the
 * queue. The pity beat must coincide with the telegraph fuse, so it
 * displaces whatever was being shown.
 *
 * @param {object} m
 * @param {() => number} [rand]
 */
export function pushPityTaunt(m, rand = Math.random) {
  const text = PITY_TAUNTS[Math.floor(rand() * PITY_TAUNTS.length)];
  m.activeLine = { text, category: VOICE_PITY, dwellMs: PITY_DWELL_MS };
  m.activeLineDwellMs = 0;
}

/**
 * Advances the speech-bubble state by `dt` ms. Drops expired lines,
 * promotes the next queued line when nothing is showing, and preempts a
 * sufficiently-dwelled non-pity line when something new is waiting.
 *
 * @param {object} m
 * @param {number} dt — ms elapsed since last tick
 */
export function tickVoice(m, dt) {
  if (m.activeLine) {
    m.activeLineDwellMs += dt;
    if (m.activeLineDwellMs >= m.activeLine.dwellMs) {
      m.activeLine = null;
      m.activeLineDwellMs = 0;
    }
  }
  if (!m.activeLine && m.voiceQueue.length > 0) {
    m.activeLine = m.voiceQueue.shift();
    m.activeLineDwellMs = 0;
    return;
  }
  if (
    m.activeLine &&
    m.activeLine.category !== VOICE_PITY &&
    m.activeLine.category !== VOICE_STUN &&
    m.voiceQueue.length > 0 &&
    m.activeLineDwellMs >= PREEMPT_AFTER_MS
  ) {
    m.activeLine = m.voiceQueue.shift();
    m.activeLineDwellMs = 0;
  }
}

/**
 * Rolls the next idle-taunt cadence uniformly in `[MIN, MAX]` ms.
 *
 * @param {() => number} rand
 * @returns {number}
 */
export function rollIdleTauntInterval(rand) {
  const span = IDLE_TAUNT_MAX_MS - IDLE_TAUNT_MIN_MS + 1;
  return IDLE_TAUNT_MIN_MS + Math.floor(rand() * span);
}
