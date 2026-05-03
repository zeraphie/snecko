// leaderboard.test.js — sort comparator + record/load behavior.
// Uses an in-memory fake localStorage attached to globalThis so the
// module's storage detection picks it up.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadLeaderboard,
  saveLeaderboard,
  recordScore,
  compareScores,
  clearLeaderboard,
  ensureSeeded,
  generateDummyEntries,
  TOP,
} from "../src/core/leaderboard/index.js";

class MemStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, v);
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

let savedStorage;

beforeEach(() => {
  savedStorage = globalThis.localStorage;
  globalThis.localStorage = new MemStorage();
});

afterEach(() => {
  globalThis.localStorage = savedStorage;
});

describe("compareScores", () => {
  it("higher act wins", () => {
    expect(
      compareScores(
        { act: 5, progress: 0, bites: 0, time: 0 },
        { act: 3, progress: 9, bites: 99, time: 1 }
      )
    ).toBeLessThan(0);
  });

  it("equal act → higher progress wins", () => {
    expect(
      compareScores(
        { act: 4, progress: 7, bites: 10, time: 60 },
        { act: 4, progress: 5, bites: 12, time: 50 }
      )
    ).toBeLessThan(0);
  });

  it("equal act + progress → higher bites wins", () => {
    expect(
      compareScores(
        { act: 4, progress: 5, bites: 12, time: 50 },
        { act: 4, progress: 5, bites: 10, time: 50 }
      )
    ).toBeLessThan(0);
  });

  it("equal act + progress + bites → lower time wins", () => {
    expect(
      compareScores(
        { act: 4, progress: 5, bites: 10, time: 30 },
        { act: 4, progress: 5, bites: 10, time: 60 }
      )
    ).toBeLessThan(0);
  });
});

describe("recordScore", () => {
  it("inserts an entry, persists, and returns the sorted list", () => {
    const result = recordScore({ act: 3, progress: 4, foodRequired: 11, bites: 12, time: 90 });
    expect(result.length).toBe(1);
    expect(loadLeaderboard()).toEqual(result);
  });

  it("trims to TOP_N entries", () => {
    for (let i = 0; i < TOP + 3; i++) {
      recordScore({ act: i + 1, progress: 0, foodRequired: 7, bites: i, time: i * 10 });
    }
    const list = loadLeaderboard();
    expect(list.length).toBe(TOP);
    // Highest act first (we inserted 1..TOP+3 in order; final 5 are top entries).
    expect(list[0].act).toBe(TOP + 3);
  });

  it("preserves earlier entries that beat the new one", () => {
    recordScore({ act: 9, progress: 1, bites: 30, time: 200 });
    const after = recordScore({ act: 2, progress: 0, bites: 5, time: 30 });
    expect(after[0].act).toBe(9);
    expect(after[1].act).toBe(2);
  });
});

describe("storage edge cases", () => {
  it("loadLeaderboard returns [] for missing key", () => {
    expect(loadLeaderboard()).toEqual([]);
  });

  it("loadLeaderboard returns [] for malformed JSON", () => {
    globalThis.localStorage.setItem("snecko_leaderboard", "{not json");
    expect(loadLeaderboard()).toEqual([]);
  });

  it("clearLeaderboard removes the entry", () => {
    saveLeaderboard([{ act: 1, progress: 0, bites: 0, time: 0 }]);
    expect(loadLeaderboard().length).toBe(1);
    clearLeaderboard();
    expect(loadLeaderboard()).toEqual([]);
  });

  it("functions no-op when localStorage is unavailable", () => {
    globalThis.localStorage = undefined;
    expect(() => saveLeaderboard([{ act: 1 }])).not.toThrow();
    expect(loadLeaderboard()).toEqual([]);
    expect(recordScore({ act: 1, progress: 0, bites: 0, time: 0 })).toEqual([
      { act: 1, progress: 0, bites: 0, time: 0 },
    ]);
  });
});

describe("dummy seeding", () => {
  it("generateDummyEntries returns 5 entries, one per act 1..5", () => {
    const entries = generateDummyEntries();
    expect(entries.length).toBe(5);
    const acts = entries.map((e) => e.act).sort((a, b) => a - b);
    expect(acts).toEqual([1, 2, 3, 4, 5]);
  });

  it("dummy entries have valid progress / bites / time / foodRequired", () => {
    const entries = generateDummyEntries();
    for (const e of entries) {
      expect(e.progress).toBeGreaterThanOrEqual(0);
      expect(e.progress).toBeLessThan(e.foodRequired);
      expect(e.bites).toBeGreaterThanOrEqual(0);
      expect(e.time).toBeGreaterThanOrEqual(0);
      expect(e).not.toHaveProperty("mutation");
    }
  });

  it("ensureSeeded populates an empty leaderboard", () => {
    expect(loadLeaderboard()).toEqual([]);
    const seeded = ensureSeeded();
    expect(seeded.length).toBe(5);
    expect(loadLeaderboard().length).toBe(5);
  });

  it("ensureSeeded is a no-op when entries already exist", () => {
    saveLeaderboard([{ act: 9, progress: 1, foodRequired: 23, bites: 50, time: 500 }]);
    const result = ensureSeeded();
    expect(result.length).toBe(1);
    expect(result[0].act).toBe(9);
  });

  it("seeded entries are returned in the leaderboard's sort order (highest act first)", () => {
    ensureSeeded();
    const list = loadLeaderboard();
    for (let i = 1; i < list.length; i++) {
      expect(compareScores(list[i - 1], list[i])).toBeLessThanOrEqual(0);
    }
  });
});
