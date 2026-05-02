// seed-streams.js — Subsystem seed identifiers.
//
// Each subsystem that needs its own deterministic RNG stream within
// an act mixes its identifier into the act seed via mixSeeds(). The
// values are arbitrary primes — they just need to be distinct so the
// splitmix mix produces uncorrelated streams. Pick another prime
// (not in this list) when adding a new subsystem.

/** 1000th prime — wildlands FBM-noise generator. */
export const SUBSEED_WILDLANDS = 7919;

/** 500th prime — wildlands current river. */
export const SUBSEED_CURRENTS = 3571;

/** Crystalline initial-layout placements (one-shot at act start). */
export const SUBSEED_CRYSTALLINE = 5101;

/** Lattice mechanic — stateful per-bite crystal spawning. */
export const SUBSEED_LATTICE = 4111;

/** Food placement — stateful, used by both crystalline and wildlands. */
export const SUBSEED_FOOD = 6101;
