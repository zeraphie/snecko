// defs.js — Upgrade definitions catalog

// ── Constants ──────────────────────────────────────────

export const TYPE_PASSIVE = "passive";
export const TYPE_CONSUMABLE = "consumable";
export const TYPE_MUTATION = "mutation";

// ── Catalog ────────────────────────────────────────────

export const UPGRADES = {
  // Passives
  climber: {
    id: "climber",
    type: TYPE_PASSIVE,
    name: "Parkour!",
    desc: "Low walls? More like no walls",
    duration: 4,
    modeOnly: "wildlands",
  },
  iron_jaw: {
    id: "iron_jaw",
    type: TYPE_PASSIVE,
    name: "Mmm, Crunchy",
    desc: "Walls are tasty too",
    duration: 3,
    durationUnit: "food",
  },
  slow_time: {
    id: "slow_time",
    type: TYPE_PASSIVE,
    name: "Snake.exe has stopped responding",
    desc: "Everything is slower. You're welcome",
    duration: 3,
  },

  // Consumables
  bomb: {
    id: "bomb",
    type: TYPE_CONSUMABLE,
    name: "Who gave the snake a gun?",
    desc: "Seriously, who did this",
    charges: 2,
  },
  dash: {
    id: "dash",
    type: TYPE_CONSUMABLE,
    name: "Snek Goes Brrrr",
    desc: "Zoom through walls at alarming speed",
    charges: 3,
  },
  wormhole: {
    id: "wormhole",
    type: TYPE_CONSUMABLE,
    name: "Snake Discovered Quantum Mechanics",
    desc: "Do quantum mechanics things",
    charges: 1,
  },

  // World mutations
  wildlands: {
    id: "wildlands",
    type: TYPE_MUTATION,
    name: "Wildlands",
    desc: "FBM terrain generation",
  },
  crystalline: {
    id: "crystalline",
    type: TYPE_MUTATION,
    name: "Crystalline",
    desc: "Crystal growth generation",
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
    if (u.modeOnly && u.modeOnly !== upgradeState.worldMode) {
      return false;
    }
    // Current world mode excluded from mutation options
    if (u.type === TYPE_MUTATION && u.id === upgradeState.worldMode) {
      return false;
    }
    return true;
  });
}
