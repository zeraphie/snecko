// double-snake.js — Double snake? Double snake!
// "What's better than one snake? That's right, three."
// Last 3 moves create echo_zone modifiers (ECHO_ZONE_TICKS duration).
// Echo zones damage the boss on overlap (1 hit per tick cap, separate from trail).
// Capped at ECHO_ZONE_MAX active zones; oldest evicted when exceeded.
// Rendered as ghost green cells in both canvas and terminal.

/**
 * @type {import('./index.js').ContrabandDef}
 */
// Player-facing name/desc lives in src/text/labels.js (LABELS.upgrades.double_snake).
export default {
  id: "double_snake",
  styles: ["bullet_hell"], // echo zones damage boss — bullet-hell only (survival blob has no HP)
  apply: (_game) => {}, // Checked at movement + damage time in boss-tick.js
};
