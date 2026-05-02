// crystals.js — Shape parser, rotation library, and place/grow helpers.
//
// Authored shapes live in `crystals.shapes` (ASCII grids). The loader reads
// that file at startup and calls `buildCrystals(text)`, which parses it and
// computes the four rotations of every stage. The result is stashed on
// `manifest.crystals` for the lattice mechanic and the crystalline generator.

import {
  TERRAIN_TELEGRAPH,
  TERRAIN_INTERIOR,
  TERRAIN_NONE,
} from "../../grid/constants.js";

// ── Shape file parser ────────────────────────────────────────────

const CHAR_SOLID = "█"; // █
// `░` is empty (no bits set). `▓` was used for hand-authored telegraphs
// in the old three-stage format; telegraphs are now auto-derived from the
// next stage's solid diff (see `placeTelegraph`), so this character is
// no longer recognised in shape data.

/**
 * Parses a `.shapes` file into a flat list of shape definitions, one entry
 * per crystal. Each block in the file is `Name N` followed by an ASCII grid;
 * rows use `█` for solid, `░` for empty.
 *
 * @param {string} text
 * @returns {Array<{ name: string, stages: Array<{ width: number, height: number, solidRows: number[] }> }>}
 */
export function parseShapesFile(text) {
  const blocks = text.trim().split(/\n\n+/);
  /** @type {Map<string, Array<{ stage: number, width: number, height: number, solidRows: number[] }>>} */
  const crystalMap = new Map();

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.length > 0);
    if (lines.length < 2) {
      continue;
    }

    const header = lines[0].trim();
    const parts = header.split(/\s+/);
    const name = parts[0];
    const stage = parseInt(parts[1], 10);
    if (Number.isNaN(stage)) {
      throw new Error(`crystals.shapes: invalid stage number in header "${header}"`);
    }

    const grid = lines.slice(1);
    const height = grid.length;
    const width = grid[0].length;
    const solidRows = [];

    for (let y = 0; y < height; y++) {
      let solidMask = 0;
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === CHAR_SOLID) {
          solidMask |= 1 << x;
        }
      }
      solidRows.push(solidMask);
    }

    const interiorRows = computeInteriorRows(width, height, solidRows);
    if (!crystalMap.has(name)) {
      crystalMap.set(name, []);
    }
    crystalMap.get(name).push({ stage, width, height, solidRows, interiorRows });
  }

  const crystals = [];
  for (const [name, stages] of crystalMap) {
    stages.sort((a, b) => a.stage - b.stage);
    crystals.push({ name, stages: stages.map(({ stage: _s, ...rest }) => rest) });
  }
  return crystals;
}

/**
 * Computes the hollow-interior bitmask for a stage. An interior cell is an
 * empty cell within the bounding box that's *not* reachable by 4-connected
 * flood-fill from outside the silhouette. Author shapes describe just the
 * silhouette; hollows are derived automatically.
 *
 * @param {number} width
 * @param {number} height
 * @param {number[]} solidRows
 * @returns {number[]}
 */
function computeInteriorRows(width, height, solidRows) {
  const isSolid = (x, y) => (solidRows[y] & (1 << x)) !== 0;
  const visited = new Uint8Array(width * height);
  const queue = [];

  function seed(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (visited[idx] || isSolid(x, y)) return;
    visited[idx] = 1;
    queue.push(idx);
  }

  // BFS from all empty edge cells — flood the "outside" through the bounding box.
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }
  while (queue.length > 0) {
    const idx = queue.shift();
    const x = idx % width;
    const y = (idx / width) | 0;
    seed(x + 1, y);
    seed(x - 1, y);
    seed(x, y + 1);
    seed(x, y - 1);
  }

  // Empty cells not reached from outside are interior.
  const interiorRows = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isSolid(x, y) && !visited[y * width + x]) {
        interiorRows[y] |= 1 << x;
      }
    }
  }
  return interiorRows;
}

// ── Rotation / comparison ─────────────────────────────────────────

function rotateStage90(stage) {
  const w = stage.height;
  const h = stage.width;
  const solidRows = Array.from({ length: h }, () => 0);
  const interiorRows = Array.from({ length: h }, () => 0);

  for (let sy = 0; sy < stage.height; sy++) {
    for (let sx = 0; sx < stage.width; sx++) {
      const nx = stage.height - 1 - sy;
      const ny = sx;
      if (stage.solidRows[sy] & (1 << sx)) {
        solidRows[ny] |= 1 << nx;
      }
      if (stage.interiorRows[sy] & (1 << sx)) {
        interiorRows[ny] |= 1 << nx;
      }
    }
  }

  return { width: w, height: h, solidRows, interiorRows };
}

function stagesEqual(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return false;
  }
  for (let i = 0; i < a.solidRows.length; i++) {
    if (a.solidRows[i] !== b.solidRows[i]) {
      return false;
    }
  }
  for (let i = 0; i < a.interiorRows.length; i++) {
    if (a.interiorRows[i] !== b.interiorRows[i]) {
      return false;
    }
  }
  return true;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Parses shape text and returns crystal definitions with precomputed unique
 * rotations for each stage. Called by the loader at startup.
 *
 * @param {string} shapesText — contents of a `.shapes` file
 * @returns {Array<{ name: string, stages: Array<{ rotations: object[] }> }>}
 */
export function buildCrystals(shapesText) {
  const baseShapes = parseShapesFile(shapesText);
  const crystals = [];

  for (const base of baseShapes) {
    const stages = [];

    for (const stage of base.stages) {
      const rotations = [stage];
      let current = stage;

      for (let r = 0; r < 3; r++) {
        current = rotateStage90(current);
        let isDuplicate = false;
        for (const existing of rotations) {
          if (stagesEqual(current, existing)) {
            isDuplicate = true;
            break;
          }
        }
        if (!isDuplicate) {
          rotations.push(current);
        }
      }

      stages.push({ rotations });
    }

    crystals.push({ name: base.name, stages });
  }

  return crystals;
}

/**
 * Tests whether a crystal stage can be placed at the given position without overlap.
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {object} stage — rotation with solidRows/width/height
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function canPlaceStage(grid, stage, x, y) {
  for (let row = 0; row < stage.height; row++) {
    const by = y + row;
    if (by < 0 || by >= grid.height) {
      return false;
    }

    const solidMask = stage.solidRows[row];

    for (let col = 0; col < stage.width; col++) {
      if (!(solidMask & (1 << col))) {
        continue;
      }
      const bx = x + col;
      if (bx < 0 || bx >= grid.width) {
        return false;
      }
      if (grid.isWallCell(bx, by)) {
        return false;
      }
      if (grid.isSnakeCell(bx, by)) {
        return false;
      }
      if (grid.isReservedCell(bx, by)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Writes solid cells from a crystal stage into the grid's wall layer, and
 * tags hollow-interior cells with `TERRAIN_INTERIOR` so food placement and
 * other terrain-aware code can avoid them.
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {object} stage
 * @param {number} x
 * @param {number} y
 */
export function placeStage(grid, stage, x, y) {
  const w = grid.width;
  for (let row = 0; row < stage.height; row++) {
    const by = y + row;
    if (by < 0 || by >= grid.height) {
      continue;
    }
    const solidMask = stage.solidRows[row];
    const interiorMask = stage.interiorRows[row];
    for (let col = 0; col < stage.width; col++) {
      const bx = x + col;
      if (bx < 0 || bx >= grid.width) {
        continue;
      }
      if (solidMask & (1 << col)) {
        grid.setCell("wall", bx, by);
      } else if (interiorMask & (1 << col)) {
        grid.terrain[by * w + bx] = TERRAIN_INTERIOR;
      }
    }
  }
}

/**
 * Marks telegraph cells in the terrain array for an upcoming crystal stage.
 * Auto-derives the telegraph from the stage's solid footprint: every cell
 * the stage *will* occupy that isn't already a wall is marked as
 * `TERRAIN_TELEGRAPH`. Out-of-bounds and existing-wall cells are skipped.
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {object} stage — rotation of the upcoming stage
 * @param {number} x — top-left x of the stage's footprint
 * @param {number} y — top-left y of the stage's footprint
 */
export function placeTelegraph(grid, stage, x, y) {
  const w = grid.width;
  for (let row = 0; row < stage.height; row++) {
    const by = y + row;
    if (by < 0 || by >= grid.height) {
      continue;
    }
    const solidMask = stage.solidRows[row];
    for (let col = 0; col < stage.width; col++) {
      if (!(solidMask & (1 << col))) {
        continue;
      }
      const bx = x + col;
      if (bx < 0 || bx >= grid.width) {
        continue;
      }
      // Already-solid cells were placed by a prior stage of the same crystal —
      // they don't need a telegraph; the player can already see them.
      if (grid.isWallCell(bx, by)) {
        continue;
      }
      grid.terrain[by * w + bx] = TERRAIN_TELEGRAPH;
    }
  }
}

/**
 * Resets all telegraph terrain cells back to TERRAIN_NONE.
 *
 * @param {import('../../grid/index.js').Grid} grid
 */
export function clearTelegraph(grid) {
  const terrain = grid.terrain;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === TERRAIN_TELEGRAPH) {
      terrain[i] = TERRAIN_NONE;
    }
  }
}
