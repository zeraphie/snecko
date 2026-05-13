// constants.js — Grid constants

export const CHUNK_BITS = 31; // use 31 bits per chunk (safe for signed 32-bit ints)

// Terrain types (parallel Uint8Array per cell)
export const TERRAIN_NONE = 0;
export const TERRAIN_LOW = 1;
export const TERRAIN_HIGH = 2;
export const TERRAIN_TELEGRAPH = 3;
export const TERRAIN_CURRENT = 4;
export const TERRAIN_INTERIOR = 5; // inside a crystalline hollow — walkable, no food spawns
export const TERRAIN_CATACOMB = 6; // wall painted with catacomb cobble detailing
export const TERRAIN_CRYSTAL = 7; // stamped crystalline facet (wall + faceted render)
export const TERRAIN_CRYSTAL_TELEGRAPH = 8; // upcoming crystal cell (translucent preview)
