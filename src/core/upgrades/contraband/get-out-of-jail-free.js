// get-out-of-jail-free.js — Get out of jail free
// "Just ignore the bullet, lol"
// Absorbs one projectile hit, then goes on JAIL_FREE_COOLDOWN-tick cooldown.
// Renewable — recharges automatically, unlike gomu's one-time shield.
// Only absorbs projectiles (not boss body or walls).

/**
 * @type {import('./index.js').ContrabandDef}
 */
export default {
  id: "get_out_of_jail_free",
  name: "Get out of jail free",
  desc: "Just ignore the bullet, lol",
  apply: (_game) => {}, // Checked at fight entry + collision time in boss-tick.js
};
