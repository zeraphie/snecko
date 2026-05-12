// get-foxed.js — Get Foxed, Nerd :>
// Stocks the fox consumable with 2 extra charges so the player can
// pounce the boss mid-fight. Same trigger as the normal Fox consumable
// (space) — `useConsumable` switches to "pounce" mode while the game
// is in STATE_BOSS.

/**
 * @type {import('./index.js').ContrabandDef}
 */
// Player-facing name/desc lives in src/text/labels.js (LABELS.upgrades.get_foxed).
export default {
  id: "get_foxed",
  styles: ["bullet_hell", "soulslike"],
  apply: (game) => {
    game.upgrades.addConsumable("fox", 2);
  },
};
