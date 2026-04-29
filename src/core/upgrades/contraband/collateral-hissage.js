// collateral-hissage.js — Collateral hissage
// "One hit, three problems. Not your problems."
// Each bullet that hits the weak point deals +1 bonus damage (2 total per hit).

/**
 * @type {import('./index.js').ContrabandDef}
 */
export default {
  id: "collateral_hissage",
  name: "Collateral hissage",
  desc: "One hit, three problems. Not your problems.",
  apply: (_game) => {}, // Checked at hit time in boss-tick.js — no apply-time setup needed
};
