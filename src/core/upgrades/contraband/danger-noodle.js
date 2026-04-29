// danger-noodle.js — Danger noodle
// "Snake hurts"
// Movement drops danger_trail modifiers (DANGER_TRAIL_TICKS duration).
// Trail cells damage the boss on overlap (1 hit per tick cap).
// Rendered as glowing orange cells in both canvas and terminal.

/**
 * @type {import('./index.js').ContrabandDef}
 */
export default {
  id: "danger_noodle",
  name: "Danger noodle",
  desc: "Snake hurts",
  apply: (_game) => {}, // Checked at movement + damage time in boss-tick.js
};
