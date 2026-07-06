// text/cull/index.js — Unified re-export for the caw-dictionary.
//
// The rest of the codebase imports from here so the per-file split is
// an internal detail. Append a new pool: add a file + re-export. See
// ADR D23.

export { PREDATOR_NAME, PREDATOR_ID } from "./predator.js";
export { HATCHLING_NAMES } from "./hatchling-names.js";
export { KINDS, KIND_HATCHLING, KIND_SNEKLING } from "./kinds.js";
export { DEATH_TOASTS } from "./death-toasts.js";
export { IDLE_TAUNTS } from "./idle-taunts.js";
export { PITY_TAUNTS } from "./pity-taunts.js";
export { BLOCK_TAUNTS } from "./block-taunts.js";
export { STUN_TAUNTS } from "./stun-taunts.js";
export { GAME_OVER_TAUNTS } from "./game-over-taunts.js";
