// defs.js — Upgrade definitions catalog

// ── Constants ──────────────────────────────────────────

export const TYPE_PASSIVE = "passive";
export const TYPE_CONSUMABLE = "consumable";
export const TYPE_BITES = "bites";
export const TYPE_MUTATION = "mutation";

// ── Catalog ────────────────────────────────────────────

// Player-facing name/desc for each upgrade lives in `src/text/labels.js`
// under LABELS.upgrades.<id>; defs hold only mechanical config.
export const UPGRADES = {
  // Passives
  climber: {
    id: "climber",
    type: TYPE_PASSIVE,
    duration: 4,
    modeOnly: "wildlands",
  },
  iron_jaw: {
    id: "iron_jaw",
    type: TYPE_BITES,
    charges: 3,
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
  },
  dash: {
    id: "dash",
    type: TYPE_CONSUMABLE,
    charges: 3,
  },
  wormhole: {
    id: "wormhole",
    type: TYPE_CONSUMABLE,
    charges: 1,
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
 * (excludes mode-locked passives and the active world mutation).
 *
 * @param {import('./state.js').UpgradeState} upgradeState
 * @returns {object[]}
 */
export function getEligibleUpgrades(upgradeState) {
  return Object.values(UPGRADES).filter((u) => {
    // Mode-specific passives only show in their mode
    if (u.modeOnly && u.modeOnly !== upgradeState.mutation) {
      return false;
    }
    // Current active mutation excluded from mutation options
    if (u.type === TYPE_MUTATION && u.id === upgradeState.mutation) {
      return false;
    }
    return true;
  });
}
