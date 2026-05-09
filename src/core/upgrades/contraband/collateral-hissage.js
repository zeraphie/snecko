// collateral-hissage.js — Collateral hissage
// "One hit, three problems. Not your problems."
// Each bullet that hits the weak point deals +1 bonus damage (2 total per hit).

/**
 * @type {import('./index.js').ContrabandDef}
 */
// Player-facing name/desc lives in src/text/labels.js (LABELS.upgrades.collateral_hissage).
export default {
  id: "collateral_hissage",
  styles: ["bullet_hell"], // bonus damage on weak-point hit — survival has no weak point
  apply: (_game) => {}, // Checked at hit time in boss-tick.js — no apply-time setup needed
};
