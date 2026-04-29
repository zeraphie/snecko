// gomu-gomu.js — Gomu gomu no Snakeskin
// "Luffy got nothing on Snake, one free hit."
// Absorbs one hit per boss fight (projectile or boss body, not walls).
// Consumes the shield on use and staggers the player for GOMU_STAGGER_TICKS.
// Shield resets each time a boss fight begins (_enterBossFight checks for this id).

/**
 * @type {import('./index.js').ContrabandDef}
 */
export default {
  id: "gomu_gomu",
  name: "Gomu gomu no Snakeskin",
  desc: "Luffy got nothing on Snake, one free hit.",
  apply: (_game) => {}, // Checked at fight entry + collision time in boss-tick.js
};
