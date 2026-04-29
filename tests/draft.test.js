// draft.test.js — tests for upgrade draft pool generation and eligibility

import { describe, it, expect } from "vitest";
import { generateDraftPool } from "../src/core/upgrades/draft.js";
import { UpgradeState } from "../src/core/upgrades/state.js";
import { TYPE_MUTATION, TYPE_PASSIVE, TYPE_CONSUMABLE } from "../src/core/upgrades/defs.js";

/** Create a seeded RNG that returns values from a list, cycling. */
function seededRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("generateDraftPool", () => {
  it("returns 3 main choices", () => {
    const state = new UpgradeState();
    const { choices } = generateDraftPool(state);
    expect(choices.length).toBe(3);
  });

  it("main choices are passives or consumables only", () => {
    const state = new UpgradeState();
    const { choices } = generateDraftPool(state);
    for (const c of choices) {
      expect([TYPE_PASSIVE, TYPE_CONSUMABLE]).toContain(c.type);
    }
  });

  it("main choices have no duplicates", () => {
    const state = new UpgradeState();
    // Run multiple times to catch randomness issues
    for (let i = 0; i < 20; i++) {
      const { choices } = generateDraftPool(state);
      const ids = choices.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("mutation appears when rng < 0.25", () => {
    const state = new UpgradeState();
    // RNG: first 3 values for shuffle, then 0.1 for mutation chance, then 0 for mutation pick
    const rng = seededRng([0, 0, 0, 0.1, 0]);
    const { mutation } = generateDraftPool(state, rng);
    expect(mutation).not.toBe(null);
    expect(mutation.type).toBe(TYPE_MUTATION);
  });

  it("mutation does not appear when rng >= 0.25", () => {
    const state = new UpgradeState();
    const rng = seededRng([0, 0, 0, 0.5, 0]);
    const { mutation } = generateDraftPool(state, rng);
    expect(mutation).toBe(null);
  });

  it("excludes current world mode from mutations", () => {
    const state = new UpgradeState(); // crystalline
    // Force mutation to appear
    const rng = seededRng([0, 0, 0, 0.1, 0]);
    const { mutation } = generateDraftPool(state, rng);
    expect(mutation.id).not.toBe("crystalline");
  });

  it("excludes mode-specific upgrades in wrong mode", () => {
    const state = new UpgradeState(); // crystalline
    for (let i = 0; i < 20; i++) {
      const { choices } = generateDraftPool(state);
      const ids = choices.map((c) => c.id);
      expect(ids).not.toContain("climber");
    }
  });

  it("includes mode-specific upgrades in correct mode", () => {
    const state = new UpgradeState();
    state.setWorldMode("wildlands");
    // Run enough times that climber should appear at least once
    let found = false;
    for (let i = 0; i < 50; i++) {
      const { choices } = generateDraftPool(state);
      if (choices.some((c) => c.id === "climber")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
