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

// Brood mutation — kin cells painted as walls + these terrain markers.
// Head/body split lets the renderer pick the right glyph; alive/memorial
// split lets the cull mechanic flip the visual on death without
// re-writing the wall mask.
export const TERRAIN_KIN_HEAD = 9; // alive kin — head cell (gravestone lands here on death)
export const TERRAIN_KIN_BODY = 10; // alive kin — body cell
export const TERRAIN_MEMORIAL_HEAD = 11; // dead kin — head cell (gravestone glyph)
export const TERRAIN_MEMORIAL_BODY = 12; // dead kin — body cell (mound glyph)
