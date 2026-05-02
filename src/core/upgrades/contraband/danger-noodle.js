// danger-noodle.js — Danger noodle
// "Snake hurts"
// Movement drops danger_trail modifiers (DANGER_TRAIL_TICKS duration).
// Trail cells damage the boss on overlap (1 hit per tick cap).
// Rendered as glowing orange cells in both canvas and terminal.

/**
 * @type {import('./index.js').ContrabandDef}
 */
// Player-facing name/desc lives in src/text/labels.js (LABELS.upgrades.danger_noodle).
export default {
  id: "danger_noodle",
  apply: (_game) => {}, // Checked at movement + damage time in boss-tick.js
};
