// grid.test.js — tests for Grid class, bitmask layers, and cell queries

import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";

describe("Grid constructor", () => {
  it("creates a grid with correct dimensions", () => {
    const grid = new Grid(21, 21);
    expect(grid.width).toBe(21);
    expect(grid.height).toBe(21);
    expect(grid.chunksPerRow).toBe(1);
  });

  it("computes chunksPerRow for wide boards", () => {
    const grid = new Grid(64, 10);
    expect(grid.chunksPerRow).toBe(3); // ceil(64/31)
  });

  it("initializes all masks to zero", () => {
    const grid = new Grid(21, 21);
    for (let i = 0; i < grid.wallMasks.length; i++) {
      expect(grid.wallMasks[i]).toBe(0);
      expect(grid.snakeMasks[i]).toBe(0);
      expect(grid.reservedMasks[i]).toBe(0);
    }
  });
});

describe("isInBounds", () => {
  it("returns true for valid coordinates", () => {
    const grid = new Grid(21, 21);
    expect(grid.isInBounds(0, 0)).toBe(true);
    expect(grid.isInBounds(20, 20)).toBe(true);
    expect(grid.isInBounds(10, 10)).toBe(true);
  });

  it("returns false for out-of-bounds coordinates", () => {
    const grid = new Grid(21, 21);
    expect(grid.isInBounds(-1, 0)).toBe(false);
    expect(grid.isInBounds(0, -1)).toBe(false);
    expect(grid.isInBounds(21, 0)).toBe(false);
    expect(grid.isInBounds(0, 21)).toBe(false);
  });
});

describe("setCell / clearCell / isCellSet", () => {
  it("sets and reads a cell", () => {
    const grid = new Grid(21, 21);
    expect(grid.isCellSet("wall", 5, 5)).toBe(false);
    grid.setCell("wall", 5, 5);
    expect(grid.isCellSet("wall", 5, 5)).toBe(true);
  });

  it("clears a cell", () => {
    const grid = new Grid(21, 21);
    grid.setCell("wall", 5, 5);
    grid.clearCell("wall", 5, 5);
    expect(grid.isCellSet("wall", 5, 5)).toBe(false);
  });

  it("handles chunk boundaries correctly", () => {
    const grid = new Grid(64, 10);
    // Bits 30, 31, 32 span chunk boundary (CHUNK_BITS = 31)
    grid.setCell("wall", 30, 0);
    grid.setCell("wall", 31, 0);
    grid.setCell("wall", 32, 0);

    expect(grid.isCellSet("wall", 30, 0)).toBe(true);
    expect(grid.isCellSet("wall", 31, 0)).toBe(true);
    expect(grid.isCellSet("wall", 32, 0)).toBe(true);
    expect(grid.isCellSet("wall", 29, 0)).toBe(false);
    expect(grid.isCellSet("wall", 33, 0)).toBe(false);
  });

  it("keeps layers independent", () => {
    const grid = new Grid(21, 21);
    grid.setCell("wall", 5, 5);
    expect(grid.isCellSet("snake", 5, 5)).toBe(false);
    expect(grid.isCellSet("reserved", 5, 5)).toBe(false);
  });
});

describe("clearMasks", () => {
  it("clears all cells in a layer", () => {
    const grid = new Grid(21, 21);
    grid.setCell("wall", 5, 5);
    grid.setCell("wall", 10, 10);
    grid.clearMasks("wall");
    expect(grid.isCellSet("wall", 5, 5)).toBe(false);
    expect(grid.isCellSet("wall", 10, 10)).toBe(false);
  });
});

describe("convenience methods", () => {
  it("isWallCell", () => {
    const grid = new Grid(21, 21);
    grid.setCell("wall", 3, 4);
    expect(grid.isWallCell(3, 4)).toBe(true);
    expect(grid.isWallCell(3, 5)).toBe(false);
  });

  it("isSnakeCell", () => {
    const grid = new Grid(21, 21);
    grid.setCell("snake", 3, 4);
    expect(grid.isSnakeCell(3, 4)).toBe(true);
  });

  it("isReservedCell", () => {
    const grid = new Grid(21, 21);
    grid.setCell("reserved", 3, 4);
    expect(grid.isReservedCell(3, 4)).toBe(true);
  });

  it("isBlockedCell checks wall and snake", () => {
    const grid = new Grid(21, 21);
    expect(grid.isBlockedCell(3, 4)).toBe(false);
    grid.setCell("wall", 3, 4);
    expect(grid.isBlockedCell(3, 4)).toBe(true);
    grid.clearCell("wall", 3, 4);
    grid.setCell("snake", 3, 4);
    expect(grid.isBlockedCell(3, 4)).toBe(true);
  });
});
