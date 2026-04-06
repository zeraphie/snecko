import { describe, it, expect } from "vitest";
import { createPermTable, perlin2, fbm2 } from "../src/core/generation/wildlands/noise.js";

describe("createPermTable", () => {
  it("returns a 512-element Uint8Array", () => {
    const perm = createPermTable(42);
    expect(perm).toBeInstanceOf(Uint8Array);
    expect(perm.length).toBe(512);
  });

  it("upper half mirrors lower half", () => {
    const perm = createPermTable(42);
    for (let i = 0; i < 256; i++) {
      expect(perm[i + 256]).toBe(perm[i]);
    }
  });

  it("lower half is a permutation of 0..255", () => {
    const perm = createPermTable(42);
    const seen = new Set();
    for (let i = 0; i < 256; i++) seen.add(perm[i]);
    expect(seen.size).toBe(256);
  });

  it("is deterministic — same seed produces same table", () => {
    const a = createPermTable(123);
    const b = createPermTable(123);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("different seeds produce different tables", () => {
    const a = createPermTable(1);
    const b = createPermTable(2);
    let same = 0;
    for (let i = 0; i < 256; i++) {
      if (a[i] === b[i]) same++;
    }
    // Statistically, very few should match
    expect(same).toBeLessThan(20);
  });
});

describe("perlin2", () => {
  const perm = createPermTable(42);

  it("returns a number in approximately [-1, 1]", () => {
    for (let i = 0; i < 100; i++) {
      const v = perlin2(i * 0.37, i * 0.53, perm);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("returns 0 at integer coordinates", () => {
    // At exact grid points, gradient dot products are zero
    expect(perlin2(0, 0, perm)).toBe(0);
    expect(perlin2(1, 0, perm)).toBe(0);
    expect(perlin2(0, 1, perm)).toBe(0);
    expect(perlin2(5, 5, perm)).toBe(0);
  });

  it("is deterministic for same inputs", () => {
    expect(perlin2(1.5, 2.7, perm)).toBe(perlin2(1.5, 2.7, perm));
  });

  it("varies smoothly — nearby values are close", () => {
    const a = perlin2(3.0, 3.0, perm);
    const b = perlin2(3.01, 3.0, perm);
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });

  it("produces non-zero values between grid points", () => {
    // Sample many fractional coords; at least some should be non-zero
    let nonZero = 0;
    for (let i = 0; i < 50; i++) {
      if (perlin2(i + 0.5, i * 0.7 + 0.3, perm) !== 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(30);
  });
});

describe("fbm2", () => {
  const perm = createPermTable(42);

  it("returns a number in approximately [-1, 1]", () => {
    for (let i = 0; i < 100; i++) {
      const v = fbm2(i * 0.1, i * 0.15, 4, 2.0, 0.5, perm);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("with 1 octave equals perlin2", () => {
    const x = 2.3,
      y = 4.7;
    const f = fbm2(x, y, 1, 2.0, 0.5, perm);
    const p = perlin2(x, y, perm);
    expect(f).toBeCloseTo(p, 10);
  });

  it("more octaves adds detail — different from 1 octave at fractional coords", () => {
    const x = 1.5,
      y = 3.5;
    const f1 = fbm2(x, y, 1, 2.0, 0.5, perm);
    const f4 = fbm2(x, y, 4, 2.0, 0.5, perm);
    // They should generally differ (octaves add higher-frequency detail)
    expect(f1).not.toBeCloseTo(f4, 5);
  });

  it("is deterministic", () => {
    expect(fbm2(5.5, 6.5, 3, 2.0, 0.5, perm)).toBe(fbm2(5.5, 6.5, 3, 2.0, 0.5, perm));
  });
});
