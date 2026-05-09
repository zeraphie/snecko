// absolute-unit.js — Absolute Unit (fallback / test placeholder)
//
// Used when the mutation has no dedicated boss entry yet.
// No special ability — clean slate for future modes to build on.

/**
 * @type {import('./index.js').BossDef}
 */
export default {
  id: "absolute_unit",
  style: "bullet_hell",
  maxHp: 12,
  width: 0,
  height: 0,
  shape: null,
  arena: "Box",
  shapeFile: "absolute-unit",
  special: null,
};
