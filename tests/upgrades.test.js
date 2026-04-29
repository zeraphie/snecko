// upgrades.test.js — tests for UpgradeState, passives, consumables, and world modes

import { describe, it, expect, beforeEach } from "vitest";
import { UpgradeState } from "../src/core/upgrades/state.js";
import {
  UPGRADES,
  TYPE_PASSIVE,
  TYPE_CONSUMABLE,
  TYPE_MUTATION,
  getUpgradesByType,
  getEligibleUpgrades,
} from "../src/core/upgrades/defs.js";

describe("UpgradeState", () => {
  let state;

  beforeEach(() => {
    state = new UpgradeState();
  });

  it("starts with defaults", () => {
    expect(state.worldMode).toBe("crystalline");
    expect(state.passives).toEqual([]);
    expect(state.consumables).toEqual([]);
  });

  it("reset clears everything", () => {
    state.addPassive("climber", 4);
    state.addConsumable("bomb", 2);
    state.setWorldMode("wildlands");
    state.reset();
    expect(state.worldMode).toBe("crystalline");
    expect(state.passives).toEqual([]);
    expect(state.consumables).toEqual([]);
  });
});

describe("passives", () => {
  let state;

  beforeEach(() => {
    state = new UpgradeState();
  });

  it("addPassive adds a new passive", () => {
    state.addPassive("climber", 4);
    expect(state.hasPassive("climber")).toBe(true);
    expect(state.passives[0].remainingLevels).toBe(4);
  });

  it("addPassive resets duration if already present", () => {
    state.addPassive("climber", 4);
    state.tickPassives(); // 3 remaining
    state.addPassive("climber", 4); // reset to 4
    expect(state.passives.length).toBe(1);
    expect(state.passives[0].remainingLevels).toBe(4);
  });

  it("hasPassive returns false for missing passive", () => {
    expect(state.hasPassive("climber")).toBe(false);
  });

  it("tickPassives decrements remaining levels", () => {
    state.addPassive("climber", 3);
    state.tickPassives();
    expect(state.passives[0].remainingLevels).toBe(2);
  });

  it("tickPassives removes expired passives", () => {
    state.addPassive("climber", 1);
    state.tickPassives();
    expect(state.passives.length).toBe(0);
    expect(state.hasPassive("climber")).toBe(false);
  });

  it("tickPassives handles multiple passives", () => {
    state.addPassive("climber", 2);
    state.addPassive("slow_time", 1);
    state.tickPassives();
    expect(state.passives.length).toBe(1);
    expect(state.hasPassive("climber")).toBe(true);
    expect(state.hasPassive("slow_time")).toBe(false);
  });
});

describe("consumables", () => {
  let state;

  beforeEach(() => {
    state = new UpgradeState();
  });

  it("addConsumable adds a new consumable", () => {
    state.addConsumable("bomb", 2);
    expect(state.getConsumable("bomb")).toEqual({ id: "bomb", charges: 2 });
  });

  it("addConsumable stacks charges", () => {
    state.addConsumable("bomb", 2);
    state.addConsumable("bomb", 2);
    expect(state.getConsumable("bomb").charges).toBe(4);
  });

  it("getConsumable returns null for missing", () => {
    expect(state.getConsumable("bomb")).toBe(null);
  });

  it("useConsumable decrements charges", () => {
    state.addConsumable("bomb", 3);
    const result = state.useConsumable("bomb");
    expect(result).toBe(true);
    expect(state.getConsumable("bomb").charges).toBe(2);
  });

  it("useConsumable removes when charges hit 0", () => {
    state.addConsumable("bomb", 1);
    state.useConsumable("bomb");
    expect(state.getConsumable("bomb")).toBe(null);
    expect(state.consumables.length).toBe(0);
  });

  it("useConsumable returns false if not held", () => {
    expect(state.useConsumable("bomb")).toBe(false);
  });
});

describe("world mode", () => {
  it("setWorldMode changes mode", () => {
    const state = new UpgradeState();
    state.setWorldMode("wildlands");
    expect(state.worldMode).toBe("wildlands");
  });
});

describe("upgrade definitions", () => {
  it("has all 8 upgrades", () => {
    expect(Object.keys(UPGRADES).length).toBe(8);
  });

  it("getUpgradesByType returns correct subsets", () => {
    const passives = getUpgradesByType(TYPE_PASSIVE);
    const consumables = getUpgradesByType(TYPE_CONSUMABLE);
    const mutations = getUpgradesByType(TYPE_MUTATION);
    expect(passives.length).toBe(3);
    expect(consumables.length).toBe(3);
    expect(mutations.length).toBe(2);
  });

  it("all passives have duration", () => {
    for (const u of getUpgradesByType(TYPE_PASSIVE)) {
      expect(u.duration).toBeGreaterThan(0);
    }
  });

  it("all consumables have charges", () => {
    for (const u of getUpgradesByType(TYPE_CONSUMABLE)) {
      expect(u.charges).toBeGreaterThan(0);
    }
  });

  it("getEligibleUpgrades excludes mode-specific upgrades in wrong mode", () => {
    const state = new UpgradeState(); // crystalline by default
    const eligible = getEligibleUpgrades(state);
    expect(eligible.find((u) => u.id === "climber")).toBeUndefined();
  });

  it("getEligibleUpgrades includes mode-specific upgrades in correct mode", () => {
    const state = new UpgradeState();
    state.setWorldMode("wildlands");
    const eligible = getEligibleUpgrades(state);
    expect(eligible.find((u) => u.id === "climber")).toBeDefined();
  });

  it("getEligibleUpgrades excludes current world mode from mutations", () => {
    const state = new UpgradeState(); // crystalline
    const eligible = getEligibleUpgrades(state);
    const mutations = eligible.filter((u) => u.type === TYPE_MUTATION);
    expect(mutations.length).toBe(1);
    expect(mutations[0].id).toBe("wildlands");
  });
});
