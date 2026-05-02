// rng.test.js — tests for the seeded RNG primitives

import { describe, it, expect } from "vitest";
import { splitmix32, mixSeeds, hashString } from "../src/core/rng.js";

describe("splitmix32", () => {
  it("is deterministic for the same seed", () => {
    const a = splitmix32(42);
    const b = splitmix32(42);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it("yields different sequences for different seeds", () => {
    const a = splitmix32(1);
    const b = splitmix32(2);
    // Collect 10 values from each; some pair must differ.
    const av = Array.from({ length: 10 }, () => a());
    const bv = Array.from({ length: 10 }, () => b());
    expect(av).not.toEqual(bv);
  });

  it("returns numbers in [0, 1)", () => {
    const r = splitmix32(123456);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("handles the seed = 0 case without degenerating", () => {
    // splitmix32(0) is a known edge case for some PRNGs; verify it
    // still produces non-zero output.
    const r = splitmix32(0);
    const v = r();
    expect(v).toBeGreaterThan(0);
  });
});

describe("mixSeeds", () => {
  it("is deterministic", () => {
    expect(mixSeeds(1, 2)).toBe(mixSeeds(1, 2));
    expect(mixSeeds(0xdeadbeef, 7919)).toBe(mixSeeds(0xdeadbeef, 7919));
  });

  it("produces different outputs for different inputs", () => {
    expect(mixSeeds(1, 2)).not.toBe(mixSeeds(1, 3));
    expect(mixSeeds(1, 2)).not.toBe(mixSeeds(2, 2));
  });

  it("returns a 32-bit unsigned integer", () => {
    const v = mixSeeds(0x12345678, 0x9abcdef0);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("hashString", () => {
  it("is deterministic across calls", () => {
    expect(hashString("foo")).toBe(hashString("foo"));
    expect(hashString("snake-2024")).toBe(hashString("snake-2024"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashString("foo")).not.toBe(hashString("bar"));
    expect(hashString("foo")).not.toBe(hashString("foo "));
  });

  it("returns a 32-bit unsigned integer", () => {
    const v = hashString("an arbitrary seed string");
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
  });

  it("hashes the empty string to the FNV-1a offset basis", () => {
    expect(hashString("")).toBe(0x811c9dc5);
  });
});
