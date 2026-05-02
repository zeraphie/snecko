// crystal.test.js — tests for crystalline shape placement and telegraph mechanics

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";
import {
  buildCrystals,
  canPlaceStage,
  placeStage,
  placeTelegraph,
  clearTelegraph,
} from "../src/core/generation/crystalline/crystals";
import { TERRAIN_TELEGRAPH, TERRAIN_NONE, TERRAIN_INTERIOR } from "../src/core/grid/constants.js";

const SHAPES_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/core/generation/crystalline/crystals.shapes"
);
const CRYSTALS = buildCrystals(readFileSync(SHAPES_PATH, "utf-8"));

describe("buildCrystals", () => {
  it("produces all 6 crystals", () => {
    expect(CRYSTALS.length).toBe(6);
    const names = CRYSTALS.map((c) => c.name).sort();
    expect(names).toEqual(["Cluster", "Facet", "Pillar", "Seed", "Shard", "Spike"]);
  });

  it("each crystal has 2 stages (small + full)", () => {
    for (const crystal of CRYSTALS) {
      expect(crystal.stages.length).toBe(2);
    }
  });

  it("each stage has at least 1 rotation", () => {
    for (const crystal of CRYSTALS) {
      for (const stage of crystal.stages) {
        expect(stage.rotations.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("all rotations have valid solidRows", () => {
    for (const crystal of CRYSTALS) {
      for (const stage of crystal.stages) {
        for (const rot of stage.rotations) {
          expect(rot.width).toBeGreaterThan(0);
          expect(rot.height).toBeGreaterThan(0);
          expect(rot.solidRows.length).toBe(rot.height);
        }
      }
    }
  });

  it("Seed stage 1 is a 5x5 plus (rotationally symmetric)", () => {
    const seed = CRYSTALS.find((c) => c.name === "Seed");
    const s0 = seed.stages[0];
    expect(s0.rotations[0].width).toBe(5);
    expect(s0.rotations[0].height).toBe(5);
    // Plus shape has 4-fold symmetry, so dedup leaves a single rotation
    expect(s0.rotations.length).toBe(1);
  });

  it("each crystal has a small (~5×5) and full (~8×8) stage", () => {
    for (const crystal of CRYSTALS) {
      const small = crystal.stages[0].rotations[0];
      const full = crystal.stages[1].rotations[0];
      expect(Math.max(small.width, small.height)).toBeLessThanOrEqual(5);
      expect(Math.max(full.width, full.height)).toBeGreaterThanOrEqual(7);
      expect(Math.max(full.width, full.height)).toBeLessThanOrEqual(8);
    }
  });
});

describe("canPlaceStage", () => {
  it("allows placement in empty space", () => {
    const grid = new Grid(21, 21);
    const seed = CRYSTALS.find((c) => c.name === "Seed");
    const stage = seed.stages[0].rotations[0];
    expect(canPlaceStage(grid, stage, 5, 5)).toBe(true);
  });

  it("rejects out-of-bounds placement", () => {
    const grid = new Grid(10, 10);
    const seed = CRYSTALS.find((c) => c.name === "Seed");
    const stage = seed.stages[0].rotations[0]; // 5x5 plus
    expect(canPlaceStage(grid, stage, 9, 0)).toBe(false);
    expect(canPlaceStage(grid, stage, -1, 0)).toBe(false);
  });

  it("rejects overlap with walls", () => {
    const grid = new Grid(21, 21);
    // Cluster's small stage has a solid cell at its top-left corner.
    grid.setCell("wall", 5, 5);
    const cluster = CRYSTALS.find((c) => c.name === "Cluster");
    const stage = cluster.stages[0].rotations[0];
    expect(canPlaceStage(grid, stage, 5, 5)).toBe(false);
  });

  it("rejects overlap with reserved zone", () => {
    const grid = new Grid(21, 21);
    grid.setCell("reserved", 5, 5);
    const cluster = CRYSTALS.find((c) => c.name === "Cluster");
    const stage = cluster.stages[0].rotations[0];
    expect(canPlaceStage(grid, stage, 5, 5)).toBe(false);
  });

  it("rejects placement that overlaps any solid cell of the stage", () => {
    const grid = new Grid(21, 21);
    // Pillar full stage row 0 is "░░█░░" — column 2 is the top notch.
    // Placing a wall there should block the stage.
    const pillar = CRYSTALS.find((c) => c.name === "Pillar");
    const stage = pillar.stages[1].rotations[0];
    grid.setCell("wall", 2, 0);
    expect(canPlaceStage(grid, stage, 0, 0)).toBe(false);
  });
});

describe("placeStage", () => {
  it("stamps every solid cell of the stage as a wall", () => {
    const grid = new Grid(21, 21);
    const cluster = CRYSTALS.find((c) => c.name === "Cluster");
    const stage = cluster.stages[0].rotations[0];
    placeStage(grid, stage, 5, 5);

    for (let row = 0; row < stage.height; row++) {
      for (let col = 0; col < stage.width; col++) {
        if (stage.solidRows[row] & (1 << col)) {
          expect(grid.isWallCell(5 + col, 5 + row)).toBe(true);
        }
      }
    }
    // Cell just past the stage's footprint is untouched
    expect(grid.isWallCell(5 + stage.width, 5)).toBe(false);
  });

  it("only stamps cells whose solidRows bit is set", () => {
    const grid = new Grid(21, 21);
    const facet = CRYSTALS.find((c) => c.name === "Facet");
    const stage = facet.stages[0].rotations[0]; // ring — empty centre
    placeStage(grid, stage, 5, 5);

    for (let row = 0; row < stage.height; row++) {
      for (let col = 0; col < stage.width; col++) {
        const isSolid = !!(stage.solidRows[row] & (1 << col));
        expect(grid.isWallCell(5 + col, 5 + row)).toBe(isSolid);
      }
    }
  });

  it("marks hollow-interior cells with TERRAIN_INTERIOR", () => {
    const grid = new Grid(21, 21);
    const facet = CRYSTALS.find((c) => c.name === "Facet");
    const stage = facet.stages[0].rotations[0];
    placeStage(grid, stage, 5, 5);

    const w = grid.width;
    let interiorCount = 0;
    for (let row = 0; row < stage.height; row++) {
      for (let col = 0; col < stage.width; col++) {
        if (stage.interiorRows[row] & (1 << col)) {
          expect(grid.terrain[(5 + row) * w + (5 + col)]).toBe(TERRAIN_INTERIOR);
          interiorCount++;
        }
      }
    }
    // Facet's small stage is a hollow ring — must have at least one interior cell.
    expect(interiorCount).toBeGreaterThan(0);
  });
});

describe("hollow-interior detection", () => {
  it("Facet stages have hollow interiors", () => {
    const facet = CRYSTALS.find((c) => c.name === "Facet");
    for (const stage of facet.stages) {
      const rot = stage.rotations[0];
      let interiorCount = 0;
      for (let row = 0; row < rot.height; row++) {
        for (let col = 0; col < rot.width; col++) {
          if (rot.interiorRows[row] & (1 << col)) {
            interiorCount++;
          }
        }
      }
      expect(interiorCount).toBeGreaterThan(0);
    }
  });

  it("non-hollow shapes have no interior cells", () => {
    // Seed's small stage is a plus — empty cells in the bbox are edge-reachable, not interior.
    const seed = CRYSTALS.find((c) => c.name === "Seed");
    const rot = seed.stages[0].rotations[0];
    for (let row = 0; row < rot.height; row++) {
      expect(rot.interiorRows[row]).toBe(0);
    }
  });

  it("Cluster's full stage is split into two disconnected masses (snake-walkable path)", () => {
    // The full stage's silhouette is bisected by an organic gap. Using 4-connectivity
    // over solid cells: the top-left corner and the bottom-left corner sit on opposite
    // halves and must be unreachable from one another. The gap between them is the path.
    const cluster = CRYSTALS.find((c) => c.name === "Cluster");
    const rot = cluster.stages[1].rotations[0];
    const w = rot.width;
    const h = rot.height;
    const isSolid = (x, y) =>
      x >= 0 && x < w && y >= 0 && y < h && (rot.solidRows[y] & (1 << x)) !== 0;
    expect(isSolid(0, 0)).toBe(true);
    expect(isSolid(0, h - 1)).toBe(true);

    const visited = new Uint8Array(w * h);
    const stack = [[0, 0]];
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (!isSolid(x, y) || visited[y * w + x]) {
        continue;
      }
      visited[y * w + x] = 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    expect(visited[(h - 1) * w + 0]).toBe(0);

    // The gap is open to the bbox edges, so it isn't classified as interior.
    for (let row = 0; row < h; row++) {
      expect(rot.interiorRows[row]).toBe(0);
    }
  });
});

describe("placeTelegraph", () => {
  it("marks every solid cell of the upcoming stage as telegraph", () => {
    const grid = new Grid(21, 21);
    const pillar = CRYSTALS.find((c) => c.name === "Pillar");
    const stage = pillar.stages[1].rotations[0];
    placeTelegraph(grid, stage, 5, 5);

    const w = grid.width;
    let telegraphCount = 0;
    for (let row = 0; row < stage.height; row++) {
      for (let col = 0; col < stage.width; col++) {
        if (stage.solidRows[row] & (1 << col)) {
          expect(grid.terrain[(5 + row) * w + (5 + col)]).toBe(TERRAIN_TELEGRAPH);
          telegraphCount++;
        }
      }
    }
    expect(telegraphCount).toBeGreaterThan(0);
  });

  it("skips cells that are already walls (auto-derived diff)", () => {
    const grid = new Grid(21, 21);
    const pillar = CRYSTALS.find((c) => c.name === "Pillar");
    const stage = pillar.stages[1].rotations[0];

    // Pre-place one of the future-solid cells as a wall — it should NOT be
    // marked as a telegraph cell since the player can already see it.
    let preX = -1;
    let preY = -1;
    for (let row = 0; row < stage.height && preX === -1; row++) {
      for (let col = 0; col < stage.width && preX === -1; col++) {
        if (stage.solidRows[row] & (1 << col)) {
          preX = 5 + col;
          preY = 5 + row;
        }
      }
    }
    grid.setCell("wall", preX, preY);

    placeTelegraph(grid, stage, 5, 5);
    expect(grid.terrain[preY * grid.width + preX]).not.toBe(TERRAIN_TELEGRAPH);
  });

  it("does not mark non-solid cells of the bounding box as telegraph", () => {
    const grid = new Grid(21, 21);
    const facet = CRYSTALS.find((c) => c.name === "Facet");
    const stage = facet.stages[0].rotations[0]; // L-shape with one empty cell
    placeTelegraph(grid, stage, 5, 5);

    const w = grid.width;
    for (let row = 0; row < stage.height; row++) {
      for (let col = 0; col < stage.width; col++) {
        const isSolid = !!(stage.solidRows[row] & (1 << col));
        const cell = grid.terrain[(5 + row) * w + (5 + col)];
        if (!isSolid) {
          expect(cell).toBe(TERRAIN_NONE);
        }
      }
    }
  });
});

describe("clearTelegraph", () => {
  it("clears all telegraph terrain cells", () => {
    const grid = new Grid(21, 21);
    const w = grid.width;
    grid.terrain[5 * w + 3] = TERRAIN_TELEGRAPH;
    grid.terrain[8 * w + 10] = TERRAIN_TELEGRAPH;

    clearTelegraph(grid);

    expect(grid.terrain[5 * w + 3]).toBe(TERRAIN_NONE);
    expect(grid.terrain[8 * w + 10]).toBe(TERRAIN_NONE);
  });

  it("does not clear non-telegraph terrain", () => {
    const grid = new Grid(21, 21);
    const w = grid.width;
    grid.terrain[5 * w + 3] = TERRAIN_TELEGRAPH;
    grid.terrain[6 * w + 4] = 2; // some other terrain type

    clearTelegraph(grid);

    expect(grid.terrain[5 * w + 3]).toBe(TERRAIN_NONE);
    expect(grid.terrain[6 * w + 4]).toBe(2);
  });
});
