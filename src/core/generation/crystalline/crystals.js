// crystals.js — Shape library with precomputed rotations, row-mask format
//
// BASE_SHAPES is generated from crystals.shapes by: just gen-shapes
// Do not edit BASE_SHAPES by hand.

import { TERRAIN_TELEGRAPH, TERRAIN_NONE } from "../../board/constants.js";

// ── Shape data ────────────────────────────────────────────────────

// prettier-ignore
const BASE_SHAPES = [
  { name: "Seed", stages: [
    { width: 2, height: 1, solidRows: [0b11], telegraphRows: [0b00] },
    { width: 4, height: 4, solidRows: [0b0110, 0b1111, 0b1111, 0b0110], telegraphRows: [0b0000, 0b0000, 0b0000, 0b0000] },
    { width: 6, height: 4, solidRows: [0b011110, 0b111111, 0b111111, 0b011110], telegraphRows: [0b000000, 0b000000, 0b000000, 0b000000] },
  ] },
  { name: "Pillar", stages: [
    { width: 2, height: 2, solidRows: [0b11, 0b11], telegraphRows: [0b00, 0b00] },
    { width: 3, height: 4, solidRows: [0b000, 0b111, 0b111, 0b000], telegraphRows: [0b010, 0b000, 0b000, 0b010] },
    { width: 3, height: 5, solidRows: [0b010, 0b111, 0b111, 0b111, 0b010], telegraphRows: [0b000, 0b000, 0b000, 0b000, 0b000] },
  ] },
  { name: "Shard", stages: [
    { width: 2, height: 2, solidRows: [0b11, 0b01], telegraphRows: [0b00, 0b00] },
    { width: 3, height: 3, solidRows: [0b110, 0b111, 0b011], telegraphRows: [0b001, 0b000, 0b100] },
    { width: 4, height: 4, solidRows: [0b1110, 0b1111, 0b1111, 0b0111], telegraphRows: [0b0000, 0b0000, 0b0000, 0b0000] },
  ] },
  { name: "Spike", stages: [
    { width: 2, height: 2, solidRows: [0b01, 0b11], telegraphRows: [0b00, 0b00] },
    { width: 3, height: 3, solidRows: [0b011, 0b111, 0b010], telegraphRows: [0b100, 0b000, 0b001] },
    { width: 4, height: 3, solidRows: [0b0111, 0b1111, 0b1110], telegraphRows: [0b0000, 0b0000, 0b0000] },
  ] },
  { name: "Cluster", stages: [
    { width: 2, height: 2, solidRows: [0b11, 0b11], telegraphRows: [0b00, 0b00] },
    { width: 3, height: 3, solidRows: [0b110, 0b111, 0b011], telegraphRows: [0b001, 0b000, 0b100] },
    { width: 4, height: 4, solidRows: [0b1110, 0b1111, 0b1111, 0b0111], telegraphRows: [0b0000, 0b0000, 0b0000, 0b0000] },
  ] },
  { name: "Facet", stages: [
    { width: 2, height: 2, solidRows: [0b10, 0b11], telegraphRows: [0b00, 0b00] },
    { width: 3, height: 3, solidRows: [0b110, 0b111, 0b011], telegraphRows: [0b000, 0b000, 0b000] },
    { width: 4, height: 4, solidRows: [0b1100, 0b1110, 0b0111, 0b0011], telegraphRows: [0b0000, 0b0000, 0b0000, 0b0000] },
  ] },
];

// ── Rotation / comparison ─────────────────────────────────────────

function rotateStage90(stage) {
  const w = stage.height;
  const h = stage.width;
  const solidRows = Array.from({ length: h }, () => 0);
  const telegraphRows = Array.from({ length: h }, () => 0);

  for (let sy = 0; sy < stage.height; sy++) {
    for (let sx = 0; sx < stage.width; sx++) {
      const nx = stage.height - 1 - sy;
      const ny = sx;
      if (stage.solidRows[sy] & (1 << sx)) {
        solidRows[ny] |= 1 << nx;
      }
      if (stage.telegraphRows[sy] & (1 << sx)) {
        telegraphRows[ny] |= 1 << nx;
      }
    }
  }

  return { width: w, height: h, solidRows, telegraphRows };
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
  for (let i = 0; i < a.telegraphRows.length; i++) {
    if (a.telegraphRows[i] !== b.telegraphRows[i]) {
      return false;
    }
  }
  return true;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Builds all crystal definitions with precomputed rotations for each stage.
 *
 * @returns {Array<{ name: string, stages: Array<{ rotations: object[] }> }>}
 */
export function buildCrystals() {
  const crystals = [];

  for (const base of BASE_SHAPES) {
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
 * @param {import('../../board/index.js').Board} board
 * @param {object} stage — rotation with solidRows/telegraphRows/width/height
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function canPlaceStage(board, stage, x, y) {
  for (let row = 0; row < stage.height; row++) {
    const by = y + row;
    if (by < 0 || by >= board.height) {
      return false;
    }

    const solidMask = stage.solidRows[row];
    const telegraphMask = stage.telegraphRows[row];
    const combined = solidMask | telegraphMask;

    for (let col = 0; col < stage.width; col++) {
      if (!(combined & (1 << col))) {
        continue;
      }
      const bx = x + col;
      if (bx < 0 || bx >= board.width) {
        return false;
      }
      if (board.isWallCell(bx, by)) {
        return false;
      }
      if (board.isSnakeCell(bx, by)) {
        return false;
      }
      if (board.isReservedCell(bx, by)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Writes solid cells from a crystal stage into the board's wall layer.
 *
 * @param {import('../../board/index.js').Board} board
 * @param {object} stage
 * @param {number} x
 * @param {number} y
 */
export function placeStage(board, stage, x, y) {
  for (let row = 0; row < stage.height; row++) {
    const by = y + row;
    const solidMask = stage.solidRows[row];
    for (let col = 0; col < stage.width; col++) {
      if (!(solidMask & (1 << col))) {
        continue;
      }
      board.setCell("wall", x + col, by);
    }
  }
}

/**
 * Marks telegraph cells in the terrain array for the next crystal growth stage.
 *
 * @param {import('../../board/index.js').Board} board
 * @param {object} stage
 * @param {number} x
 * @param {number} y
 */
export function placeTelegraph(board, stage, x, y) {
  const w = board.width;
  for (let row = 0; row < stage.height; row++) {
    const by = y + row;
    if (by < 0 || by >= board.height) {
      continue;
    }
    const telegraphMask = stage.telegraphRows[row];
    for (let col = 0; col < stage.width; col++) {
      if (!(telegraphMask & (1 << col))) {
        continue;
      }
      const bx = x + col;
      if (bx < 0 || bx >= board.width) {
        continue;
      }
      board.terrain[by * w + bx] = TERRAIN_TELEGRAPH;
    }
  }
}

/**
 * Resets all telegraph terrain cells back to TERRAIN_NONE.
 *
 * @param {import('../../board/index.js').Board} board
 */
export function clearTelegraph(board) {
  const terrain = board.terrain;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === TERRAIN_TELEGRAPH) {
      terrain[i] = TERRAIN_NONE;
    }
  }
}
