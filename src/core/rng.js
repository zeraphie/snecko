// rng.js — Seeded RNG primitives shared across mutations.
//
// Provides deterministic randomness so two runs with the same runSeed
// produce identical layouts. See `docs/mechanics.md` "Seeding pattern".

// ── splitmix32 PRNG constants ────────────────────────────────────
//
// Sourced from MurmurHash3's 32-bit finalizer; the constants are
// chosen for good avalanche (each input bit affects ~half the output
// bits) and uniform distribution across the 32-bit range.

/**
 * 2^32 / golden ratio (rounded). Used as the splitmix increment per
 * draw — guarantees the internal state walks every 32-bit value
 * before repeating, with good distribution along the way. The same
 * constant appears in MurmurHash3, xxHash, and other quality hash
 * functions for the same reason.
 */
const SPLITMIX_GAMMA = 0x9e3779b9;

/**
 * MurmurHash3 32-bit finalizer multipliers. Together with the shifts
 * (16, 13, 16) they mix the bits of the state into the output so
 * adjacent seeds produce uncorrelated streams.
 */
const MURMUR_MIX_1 = 0x85ebca6b;
const MURMUR_MIX_2 = 0xc2b2ae35;

// ── FNV-1a 32-bit constants ──────────────────────────────────────
//
// Used by `hashString` to convert player-supplied custom seeds into a
// 32-bit integer. Simple, fast, and good enough for non-cryptographic
// seed derivation.

/** Standard FNV-1a 32-bit offset basis. */
const FNV_OFFSET = 0x811c9dc5;

/** Standard FNV-1a 32-bit prime. */
const FNV_PRIME = 0x01000193;

// ── Public API ───────────────────────────────────────────────────

/**
 * Creates a seeded splitmix32 PRNG. Returns a zero-argument function
 * that yields a new pseudorandom number in [0, 1) on each call. Same
 * seed → same sequence.
 *
 * @param {number} seed — 32-bit integer seed
 * @returns {() => number}
 */
export function splitmix32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + SPLITMIX_GAMMA) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), MURMUR_MIX_1);
    z = Math.imul(z ^ (z >>> 13), MURMUR_MIX_2);
    z = (z ^ (z >>> 16)) >>> 0;
    return z / 0x100000000;
  };
}

/**
 * Pure mix of two 32-bit integers into a new 32-bit seed. Used to
 * derive child seeds — actSeed from runSeed + actIndex, subsystem
 * seeds from actSeed + subsystem id — so each call site gets an
 * independent, deterministic stream.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number} — 32-bit unsigned integer
 */
export function mixSeeds(a, b) {
  let z = ((a | 0) + Math.imul(b | 0, SPLITMIX_GAMMA)) | 0;
  z = Math.imul(z ^ (z >>> 16), MURMUR_MIX_1);
  z = Math.imul(z ^ (z >>> 13), MURMUR_MIX_2);
  z = (z ^ (z >>> 16)) >>> 0;
  return z;
}

/**
 * Hashes a string to a 32-bit unsigned integer using FNV-1a. Used to
 * convert player-supplied custom-seed strings into a runSeed.
 *
 * @param {string} str
 * @returns {number} — 32-bit unsigned integer
 */
export function hashString(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}
