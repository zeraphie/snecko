// draft.js — Draft pool generation for level-up upgrade selection

import { getEligibleUpgrades, TYPE_MUTATION, TYPE_PASSIVE, TYPE_CONSUMABLE } from './defs.js';

// ── Constants ──────────────────────────────────────────

const MUTATION_CHANCE = 0.25;
const MUTATION_GUARANTEE_EVERY = 3;

// ── Public API ─────────────────────────────────────────

/**
 * Generate a draft pool: 3 main choices (passives + consumables)
 * and an optional bonus mutation slot.
 *
 * @param {import('./state.js').UpgradeState} upgradeState
 * @param {() => number} [rng=Math.random] — injectable RNG for testing
 * @param {number} [draftsSinceMutation=0] — drafts since last mutation offer
 * @returns {{ choices: object[], mutation: object|null }}
 */
export function generateDraftPool(upgradeState, rng = Math.random, draftsSinceMutation = 0) {
  const eligible = getEligibleUpgrades(upgradeState);
  const main = eligible.filter((u) => u.type === TYPE_PASSIVE || u.type === TYPE_CONSUMABLE);
  const mutations = eligible.filter((u) => u.type === TYPE_MUTATION);

  // Pick 3 unique main choices (Fisher-Yates partial shuffle)
  const pool = main.slice();
  const count = Math.min(3, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  const choices = pool.slice(0, count);

  // Roll for bonus mutation slot (guaranteed every N drafts)
  let mutation = null;
  const forced = draftsSinceMutation >= MUTATION_GUARANTEE_EVERY - 1;
  if (mutations.length > 0 && (forced || rng() < MUTATION_CHANCE)) {
    mutation = mutations[Math.floor(rng() * mutations.length)];
  }

  return { choices, mutation };
}
