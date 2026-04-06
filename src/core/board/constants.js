// constants.js — Board constants

export const CHUNK_BITS = 31; // use 31 bits per chunk (safe for signed 32-bit ints)

// Terrain types (parallel Uint8Array per cell)
export const TERRAIN_NONE = 0;
export const TERRAIN_LOW = 1;
export const TERRAIN_HIGH = 2;
export const TERRAIN_TELEGRAPH = 3;
export const TERRAIN_CURRENT = 4;
