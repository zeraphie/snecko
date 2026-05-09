// snake-hungry.js — Snake hungry, snake need bigger food
// "Bosses are food too"
// Unlocks vertical dodging in boss fights (±3 cells from spawn Y).
// Also halves fire cooldown when close to the boss.

/**
 * @type {import('./index.js').ContrabandDef}
 */
// Player-facing name/desc lives in src/text/labels.js (LABELS.upgrades.snake_hungry).
export default {
  id: "snake_hungry",
  styles: ["bullet_hell"], // vertical-dodge + fire-cooldown perks — survival has no Y-lock or auto-fire
  apply: (_game) => {}, // Checked at movement time in boss-tick.js
};
