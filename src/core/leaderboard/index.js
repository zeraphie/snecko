// leaderboard.js — Local top-5 leaderboard backed by localStorage.
//
// Entries are sorted by:
//   1. Highest act
//   2. Highest progress (foodEaten in the act the run ended in)
//   3. Highest bites (total food-bites across the run)
//   4. Lowest time (seconds elapsed)
// The list is truncated to TOP_N entries on every save.
//
// Storage is via globalThis.localStorage. In environments that don't
// expose it (Node terminal, tests without a polyfill), `loadLeaderboard`
// returns an empty list and `saveLeaderboard` is a no-op — the
// leaderboard becomes a non-persistent runtime feature, no errors.

const STORAGE_KEY = "snecko_leaderboard";
const NAME_KEY = "snecko_player_name";
const TOP_N = 5;
/** Maximum length for a player name (input + display). */
export const MAX_NAME_LENGTH = 12;

/**
 * @typedef {Object} LeaderboardEntry
 * @property {string} name          — player-entered name (or "Anonymous")
 * @property {number} act           — actIndex when the run ended
 * @property {number} progress      — foodEaten in the final act
 * @property {number} foodRequired  — foodRequired for that act (display only)
 * @property {number} bites         — total score (food-bites across the run)
 * @property {number} time          — runTime in seconds
 *
 * Mutation is intentionally not recorded: the player can switch mutations
 * mid-run via the upgrade draft, so a single label would be misleading.
 */

/**
 * Returns the leaderboard array from storage. Empty array if storage
 * isn't available or contains no/invalid data.
 *
 * @returns {LeaderboardEntry[]}
 */
export function loadLeaderboard() {
  const store = _getStore();
  if (!store) {
    return [];
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists the leaderboard array to storage. No-op if storage isn't
 * available.
 *
 * @param {LeaderboardEntry[]} entries
 */
export function saveLeaderboard(entries) {
  const store = _getStore();
  if (!store) {
    return;
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage may be full / disabled — ignore.
  }
}

/**
 * Inserts an entry, sorts the list by the leaderboard's priority,
 * truncates to TOP_N, persists, and returns the new list.
 *
 * @param {LeaderboardEntry} entry
 * @returns {LeaderboardEntry[]}
 */
export function recordScore(entry) {
  const list = loadLeaderboard();
  list.push(entry);
  list.sort(compareScores);
  const trimmed = list.slice(0, TOP_N);
  saveLeaderboard(trimmed);
  return trimmed;
}

/**
 * Sort comparator: higher act first, then higher progress, then higher
 * bites, then lower time. Returns the standard Array.sort sign convention.
 */
export function compareScores(a, b) {
  if (a.act !== b.act) {
    return b.act - a.act;
  }
  if (a.progress !== b.progress) {
    return b.progress - a.progress;
  }
  if (a.bites !== b.bites) {
    return b.bites - a.bites;
  }
  return a.time - b.time;
}

/**
 * Clears the leaderboard. Used by tests; not exposed in the UI.
 */
export function clearLeaderboard() {
  const store = _getStore();
  if (!store) {
    return;
  }
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function _getStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// ── Persistent player name ───────────────────────────────────────

/** Returns the last-confirmed player name, or "" if none set / no storage. */
export function loadPlayerName() {
  const store = _getStore();
  if (!store) {
    return "";
  }
  try {
    return store.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Persists the player name. No-op if storage isn't available. */
export function savePlayerName(name) {
  const store = _getStore();
  if (!store) {
    return;
  }
  try {
    store.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

// ── First-run dummy data ─────────────────────────────────────────

const FOOD_REQUIRED_BASE = 5;
const FOOD_REQUIRED_PER_ACT = 2;
/** BASE_TICK_MS in seconds — used for dummy time calculation. Mirrors the
 *  game's actual base tick rate so dummy times look like real player runs. */
const TICK_SECS = 0.15;
/** Minimum ticks the dummy assumes between bites (lower = unrealistically fast). */
const MIN_TICKS_PER_BITE = 10;
/** Random spread above the minimum (so dummies vary). */
const TICKS_PER_BITE_SPREAD = 30;

/** Placeholder names for dummy entries — one per act, in order. */
const DUMMY_NAMES = ["ALEX", "BREA", "CHIP", "DALE", "ECHO"];

/**
 * Generates a fresh set of plausible entries — one per act 1..5, each
 * with a random progress + bites total + corresponding time. Time is
 * derived from bites assuming at least 10 ticks per bite (≥1.5 s/bite at
 * the base 150 ms tick), so the comparator's tie-breakers all engage
 * naturally and times look like a real player.
 *
 * @returns {LeaderboardEntry[]}
 */
export function generateDummyEntries() {
  const entries = [];
  let totalBites = 0;
  for (let act = 1; act <= 5; act++) {
    const foodRequired = FOOD_REQUIRED_BASE + act * FOOD_REQUIRED_PER_ACT;
    const progress = Math.floor(Math.random() * foodRequired);
    const bites = totalBites + progress;
    const ticksPerBite = MIN_TICKS_PER_BITE + Math.random() * TICKS_PER_BITE_SPREAD;
    const time = bites * ticksPerBite * TICK_SECS;
    entries.push({
      name: DUMMY_NAMES[act - 1] ?? "DUMMY",
      act,
      progress,
      foodRequired,
      bites,
      time,
    });
    // For subsequent acts, assume the previous act was completed.
    totalBites += foodRequired;
  }
  return entries;
}

/**
 * Populates the leaderboard with dummy entries iff it's currently empty.
 * Idempotent — once any entry exists (real or dummy), this is a no-op.
 *
 * @returns {LeaderboardEntry[]} the leaderboard after the call
 */
export function ensureSeeded() {
  const existing = loadLeaderboard();
  if (existing.length > 0) {
    return existing;
  }
  const seeded = generateDummyEntries();
  seeded.sort(compareScores);
  saveLeaderboard(seeded);
  return seeded;
}

export const TOP = TOP_N;
