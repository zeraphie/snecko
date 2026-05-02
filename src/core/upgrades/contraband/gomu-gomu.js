// gomu-gomu.js — Gomu gomu no Snakeskin
// "Luffy got nothing on Snake, one free hit."
// Absorbs one hit per boss fight (projectile or boss body, not walls).
// Consumes the shield on use and staggers the player for GOMU_STAGGER_TICKS.
// Shield resets each time a boss fight begins (_enterBossFight checks for this id).

/**
 * @type {import('./index.js').ContrabandDef}
 */
// Player-facing name/desc lives in src/text/labels.js (LABELS.upgrades.gomu_gomu).
export default {
  id: "gomu_gomu",
  apply: (_game) => {}, // Checked at fight entry + collision time in boss-tick.js
};
