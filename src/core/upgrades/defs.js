// defs.js — Upgrade definitions catalog

// ── Constants ──────────────────────────────────────────

export const TYPE_PASSIVE = "passive";
export const TYPE_CONSUMABLE = "consumable";
export const TYPE_BITES = "bites";
export const TYPE_MUTATION = "mutation";

// ── Catalog ────────────────────────────────────────────

// Player-facing name/desc for each upgrade lives in `src/text/labels.js`
// under LABELS.upgrades.<id>; defs hold only mechanical config.
//
// Optional `mutations: string[]` whitelist: when present, the upgrade only
// shows up in drafts under those mutations. Absent = available in all
// mutations. See `getEligibleUpgrades` and `PLAN.catacombs-adr.md` D4.
export const UPGRADES = {
  // Passives
  climber: {
    id: "climber",
    type: TYPE_PASSIVE,
    duration: 4,
    mutations: ["wildlands"],
  },
  iron_jaw: {
    id: "iron_jaw",
    type: TYPE_BITES,
    charges: 3,
    // Iron Jaw eats TERRAIN_LOW walls — only exist in wildlands.
    mutations: ["wildlands"],
  },
  slow_time: {
    id: "slow_time",
    type: TYPE_PASSIVE,
    duration: 3,
  },

  // Consumables
  bomb: {
    id: "bomb",
    type: TYPE_CONSUMABLE,
    charges: 2,
    // Wall-clearing trivialises the catacombs maze.
    mutations: ["wildlands", "crystalline"],
  },
  dash: {
    id: "dash",
    type: TYPE_CONSUMABLE,
    charges: 3,
    // 5-cell straight-line dash trivialises 2-wide catacombs corridors.
    mutations: ["wildlands", "crystalline"],
  },
  wormhole: {
    id: "wormhole",
    type: TYPE_CONSUMABLE,
    charges: 1,
    // Teleport defeats the maze-navigation puzzle.
    mutations: ["wildlands", "crystalline"],
  },

  // World mutations
  wildlands: {
    id: "wildlands",
    type: TYPE_MUTATION,
  },
  crystalline: {
    id: "crystalline",
    type: TYPE_MUTATION,
  },
  catacombs: {
    id: "catacombs",
    type: TYPE_MUTATION,
  },
};

// ── Queries ────────────────────────────────────────────

/**
 * Returns all upgrade definitions matching the given type.
 *
 * @param {"passive"|"consumable"|"mutation"} type
 * @returns {object[]}
 */
export function getUpgradesByType(type) {
  return Object.values(UPGRADES).filter((u) => u.type === type);
}

/**
 * Returns upgrades eligible for drafting given current state
 * (excludes mutation-locked upgrades that don't apply, and the active
 * mutation itself from the mutation slot).
 *
 * @param {import('./state.js').UpgradeState} upgradeState
 * @returns {object[]}
 */
export function getEligibleUpgrades(upgradeState) {
  return Object.values(UPGRADES).filter((u) => {
    // Mutation-locked upgrades only show up in the mutations they whitelist.
    if (u.mutations && !u.mutations.includes(upgradeState.mutation)) {
      return false;
    }
    // Current active mutation excluded from mutation options.
    if (u.type === TYPE_MUTATION && u.id === upgradeState.mutation) {
      return false;
    }
    return true;
  });
}
