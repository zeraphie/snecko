// snake-hungry.js — Snake hungry, snake need bigger food
// "Bosses are food too"
// Unlocks vertical dodging in boss fights (±3 cells from spawn Y).
// Also halves fire cooldown when close to the boss.

/**
 * @type {import('./index.js').ContrabandDef}
 */
export default {
  id: "snake_hungry",
  name: "Snake hungry, snake need bigger food",
  desc: "Unlocks vertical dodging in boss fights (+halved fire cooldown near boss)",
  apply: (_game) => {}, // Checked at movement time in boss-tick.js
};
