import { describe, it, expect } from "vitest";
import { Board } from "../src/core/board";
import {
  buildCrystals,
  canPlaceStage,
  placeStage,
  placeTelegraph,
  clearTelegraph,
} from "../src/core/generation/crystalline/crystals";
import { TERRAIN_TELEGRAPH, TERRAIN_NONE } from "../src/core/board/constants.js";

const CRYSTALS = buildCrystals();

describe("buildCrystals", () => {
  it("produces all 6 crystals", () => {
    expect(CRYSTALS.length).toBe(6);
    const names = CRYSTALS.map((c) => c.name).sort();
    expect(names).toEqual(["Cluster", "Facet", "Pillar", "Seed", "Shard", "Spike"]);
  });

  it("each crystal has 3 stages", () => {
    for (const crystal of CRYSTALS) {
      expect(crystal.stages.length).toBe(3);
    }
  });

  it("each stage has at least 1 rotation", () => {
    for (const crystal of CRYSTALS) {
      for (const stage of crystal.stages) {
        expect(stage.rotations.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("all rotations have valid solidRows and telegraphRows", () => {
    for (const crystal of CRYSTALS) {
      for (const stage of crystal.stages) {
        for (const rot of stage.rotations) {
          expect(rot.width).toBeGreaterThan(0);
          expect(rot.height).toBeGreaterThan(0);
          expect(rot.solidRows.length).toBe(rot.height);
          expect(rot.telegraphRows.length).toBe(rot.height);
        }
      }
    }
  });

  it("Seed stage 1 is 2x1 with 1 rotation (symmetric)", () => {
    const seed = CRYSTALS.find((c) => c.name === "Seed");
    const s0 = seed.stages[0];
    expect(s0.rotations[0].width).toBe(2);
    expect(s0.rotations[0].height).toBe(1);
  });

  it("rotation preserves telegraph bits", () => {
    // Pillar stage 2 has telegraph bits — check they survive rotation
    const pillar = CRYSTALS.find((c) => c.name === "Pillar");
    const s1 = pillar.stages[1]; // stage 2 has telegraph rows
    const base = s1.rotations[0];
    const hasTelegraph = base.telegraphRows.some((r) => r !== 0);
    expect(hasTelegraph).toBe(true);

    // All rotations should also have telegraph bits
    for (const rot of s1.rotations) {
      const rotHasTelegraph = rot.telegraphRows.some((r) => r !== 0);
      expect(rotHasTelegraph).toBe(true);
    }
  });
});

describe("canPlaceStage", () => {
  it("allows placement in empty space", () => {
    const board = new Board(21, 21);
    const seed = CRYSTALS.find((c) => c.name === "Seed");
    const stage = seed.stages[0].rotations[0];
    expect(canPlaceStage(board, stage, 5, 5)).toBe(true);
  });

  it("rejects out-of-bounds placement", () => {
    const board = new Board(10, 10);
    const seed = CRYSTALS.find((c) => c.name === "Seed");
    const stage = seed.stages[0].rotations[0]; // 2x1
    expect(canPlaceStage(board, stage, 9, 0)).toBe(false);
    expect(canPlaceStage(board, stage, -1, 0)).toBe(false);
  });

  it("rejects overlap with walls", () => {
    const board = new Board(21, 21);
    board.setCell("wall", 5, 5);
    const seed = CRYSTALS.find((c) => c.name === "Seed");
    const stage = seed.stages[0].rotations[0]; // 2x1
    expect(canPlaceStage(board, stage, 5, 5)).toBe(false);
  });

  it("rejects overlap with reserved zone", () => {
    const board = new Board(21, 21);
    board.setCell("reserved", 5, 5);
    const cluster = CRYSTALS.find((c) => c.name === "Cluster");
    const stage = cluster.stages[0].rotations[0]; // 2x2
    expect(canPlaceStage(board, stage, 5, 5)).toBe(false);
  });

  it("checks both solid and telegraph cells for placement", () => {
    const board = new Board(21, 21);
    // Pillar stage 2 has telegraph cells at top and bottom
    const pillar = CRYSTALS.find((c) => c.name === "Pillar");
    const stage = pillar.stages[1].rotations[0];
    // Place a wall where a telegraph cell would go
    board.setCell("wall", 1, 0); // telegraph position
    expect(canPlaceStage(board, stage, 0, 0)).toBe(false);
  });
});

describe("placeStage", () => {
  it("stamps solid cells as walls", () => {
    const board = new Board(21, 21);
    const cluster = CRYSTALS.find((c) => c.name === "Cluster");
    const stage = cluster.stages[0].rotations[0]; // 2x2
    placeStage(board, stage, 5, 5);

    expect(board.isWallCell(5, 5)).toBe(true);
    expect(board.isWallCell(6, 5)).toBe(true);
    expect(board.isWallCell(5, 6)).toBe(true);
    expect(board.isWallCell(6, 6)).toBe(true);
    expect(board.isWallCell(7, 5)).toBe(false);
  });

  it("does not stamp telegraph cells as walls", () => {
    const board = new Board(21, 21);
    const pillar = CRYSTALS.find((c) => c.name === "Pillar");
    const stage = pillar.stages[1].rotations[0]; // has telegraph
    placeStage(board, stage, 5, 5);

    // Telegraph cells should NOT be walls
    const telegraphCells = [];
    for (let row = 0; row < stage.height; row++) {
      for (let col = 0; col < stage.width; col++) {
        if (stage.telegraphRows[row] & (1 << col)) {
          telegraphCells.push({ x: 5 + col, y: 5 + row });
        }
      }
    }
    for (const cell of telegraphCells) {
      expect(board.isWallCell(cell.x, cell.y)).toBe(false);
    }
  });
});

describe("placeTelegraph", () => {
  it("marks telegraph cells in terrain array", () => {
    const board = new Board(21, 21);
    const pillar = CRYSTALS.find((c) => c.name === "Pillar");
    const stage = pillar.stages[1].rotations[0];
    placeTelegraph(board, stage, 5, 5);

    const w = board.width;
    let telegraphCount = 0;
    for (let row = 0; row < stage.height; row++) {
      for (let col = 0; col < stage.width; col++) {
        if (stage.telegraphRows[row] & (1 << col)) {
          expect(board.terrain[(5 + row) * w + (5 + col)]).toBe(TERRAIN_TELEGRAPH);
          telegraphCount++;
        }
      }
    }
    expect(telegraphCount).toBeGreaterThan(0);
  });

  it("does not mark solid cells as telegraph", () => {
    const board = new Board(21, 21);
    const pillar = CRYSTALS.find((c) => c.name === "Pillar");
    const stage = pillar.stages[1].rotations[0];
    placeTelegraph(board, stage, 5, 5);

    const w = board.width;
    for (let row = 0; row < stage.height; row++) {
      for (let col = 0; col < stage.width; col++) {
        const isSolid = stage.solidRows[row] & (1 << col);
        const isTelegraph = stage.telegraphRows[row] & (1 << col);
        if (isSolid && !isTelegraph) {
          expect(board.terrain[(5 + row) * w + (5 + col)]).toBe(TERRAIN_NONE);
        }
      }
    }
  });
});

describe("clearTelegraph", () => {
  it("clears all telegraph terrain cells", () => {
    const board = new Board(21, 21);
    const w = board.width;
    board.terrain[5 * w + 3] = TERRAIN_TELEGRAPH;
    board.terrain[8 * w + 10] = TERRAIN_TELEGRAPH;

    clearTelegraph(board);

    expect(board.terrain[5 * w + 3]).toBe(TERRAIN_NONE);
    expect(board.terrain[8 * w + 10]).toBe(TERRAIN_NONE);
  });

  it("does not clear non-telegraph terrain", () => {
    const board = new Board(21, 21);
    const w = board.width;
    board.terrain[5 * w + 3] = TERRAIN_TELEGRAPH;
    board.terrain[6 * w + 4] = 2; // some other terrain type

    clearTelegraph(board);

    expect(board.terrain[5 * w + 3]).toBe(TERRAIN_NONE);
    expect(board.terrain[6 * w + 4]).toBe(2);
  });
});
