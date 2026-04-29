// board.test.js — tests for Board class, bitmask layers, and cell queries

import { describe, it, expect } from "vitest";
import { Board } from "../src/core/board";

describe("Board constructor", () => {
  it("creates a board with correct dimensions", () => {
    const board = new Board(21, 21);
    expect(board.width).toBe(21);
    expect(board.height).toBe(21);
    expect(board.chunksPerRow).toBe(1);
  });

  it("computes chunksPerRow for wide boards", () => {
    const board = new Board(64, 10);
    expect(board.chunksPerRow).toBe(3); // ceil(64/31)
  });

  it("initializes all masks to zero", () => {
    const board = new Board(21, 21);
    for (let i = 0; i < board.wallMasks.length; i++) {
      expect(board.wallMasks[i]).toBe(0);
      expect(board.snakeMasks[i]).toBe(0);
      expect(board.reservedMasks[i]).toBe(0);
    }
  });
});

describe("isInBounds", () => {
  it("returns true for valid coordinates", () => {
    const board = new Board(21, 21);
    expect(board.isInBounds(0, 0)).toBe(true);
    expect(board.isInBounds(20, 20)).toBe(true);
    expect(board.isInBounds(10, 10)).toBe(true);
  });

  it("returns false for out-of-bounds coordinates", () => {
    const board = new Board(21, 21);
    expect(board.isInBounds(-1, 0)).toBe(false);
    expect(board.isInBounds(0, -1)).toBe(false);
    expect(board.isInBounds(21, 0)).toBe(false);
    expect(board.isInBounds(0, 21)).toBe(false);
  });
});

describe("setCell / clearCell / isCellSet", () => {
  it("sets and reads a cell", () => {
    const board = new Board(21, 21);
    expect(board.isCellSet("wall", 5, 5)).toBe(false);
    board.setCell("wall", 5, 5);
    expect(board.isCellSet("wall", 5, 5)).toBe(true);
  });

  it("clears a cell", () => {
    const board = new Board(21, 21);
    board.setCell("wall", 5, 5);
    board.clearCell("wall", 5, 5);
    expect(board.isCellSet("wall", 5, 5)).toBe(false);
  });

  it("handles chunk boundaries correctly", () => {
    const board = new Board(64, 10);
    // Bits 30, 31, 32 span chunk boundary (CHUNK_BITS = 31)
    board.setCell("wall", 30, 0);
    board.setCell("wall", 31, 0);
    board.setCell("wall", 32, 0);

    expect(board.isCellSet("wall", 30, 0)).toBe(true);
    expect(board.isCellSet("wall", 31, 0)).toBe(true);
    expect(board.isCellSet("wall", 32, 0)).toBe(true);
    expect(board.isCellSet("wall", 29, 0)).toBe(false);
    expect(board.isCellSet("wall", 33, 0)).toBe(false);
  });

  it("keeps layers independent", () => {
    const board = new Board(21, 21);
    board.setCell("wall", 5, 5);
    expect(board.isCellSet("snake", 5, 5)).toBe(false);
    expect(board.isCellSet("reserved", 5, 5)).toBe(false);
  });
});

describe("clearMasks", () => {
  it("clears all cells in a layer", () => {
    const board = new Board(21, 21);
    board.setCell("wall", 5, 5);
    board.setCell("wall", 10, 10);
    board.clearMasks("wall");
    expect(board.isCellSet("wall", 5, 5)).toBe(false);
    expect(board.isCellSet("wall", 10, 10)).toBe(false);
  });
});

describe("convenience methods", () => {
  it("isWallCell", () => {
    const board = new Board(21, 21);
    board.setCell("wall", 3, 4);
    expect(board.isWallCell(3, 4)).toBe(true);
    expect(board.isWallCell(3, 5)).toBe(false);
  });

  it("isSnakeCell", () => {
    const board = new Board(21, 21);
    board.setCell("snake", 3, 4);
    expect(board.isSnakeCell(3, 4)).toBe(true);
  });

  it("isReservedCell", () => {
    const board = new Board(21, 21);
    board.setCell("reserved", 3, 4);
    expect(board.isReservedCell(3, 4)).toBe(true);
  });

  it("isBlockedCell checks wall and snake", () => {
    const board = new Board(21, 21);
    expect(board.isBlockedCell(3, 4)).toBe(false);
    board.setCell("wall", 3, 4);
    expect(board.isBlockedCell(3, 4)).toBe(true);
    board.clearCell("wall", 3, 4);
    board.setCell("snake", 3, 4);
    expect(board.isBlockedCell(3, 4)).toBe(true);
  });
});
