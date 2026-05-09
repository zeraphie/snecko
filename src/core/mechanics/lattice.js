// lattice.js — Crystalline mechanic: bloom-and-decay lifecycle.
//
// A new crystal lifecycle starts every `SPAWN_INTERVAL` bites; each crystal
// runs the per-state machine independently:
//   telegraph_place → place → telegraph_grow → grow → linger → decay → disappear
// `telegraph_decay` is intentionally omitted — vanishing walls don't need a
// warning. Multiple crystals are typically active at once.
//
// Per-crystal `ownedSolid` / `ownedInterior` bitmasks track exactly which
// cells this crystal stamped, so decay and disappear only clear cells the
// crystal owns. Cells already-walled by another crystal at stamp time stay
// owned by that other crystal.
//
// Placement anchors and shape choices are pre-computed once per act in
// `initLattice` against the empty initial grid, using the seeded
// `mech.rand`. At telegraph_place time the lattice pops the next anchor and
// re-validates it; if every remaining anchor is invalid (snake parked on
// it, another crystal already there, etc.) it falls back to a bounded live
// search.

import {
  canPlaceStage,
  placeTelegraph,
  clearTelegraph,
} from "../generation/crystalline/crystals.js";
import { mixSeeds, splitmix32 } from "../rng.js";
import { SUBSEED_LATTICE } from "../seed-streams.js";
import { TERRAIN_INTERIOR, TERRAIN_NONE, TERRAIN_TELEGRAPH } from "../grid/constants.js";

const SPAWN_INTERVAL = 2;
const PRECOMPUTE_ATTEMPTS = 60;
const FALLBACK_ATTEMPTS = 80;
const DEFAULT_FOOD_REQUIRED = 30;

/**
 * Initialises the lattice mechanic on a freshly generated crystalline grid.
 *
 * @param {import('../game/index.js').Game} game
 */
export function initLattice(game) {
  const rand = splitmix32(mixSeeds(game.actSeed | 0, SUBSEED_LATTICE));
  game.mechanic = {
    type: "lattice",
    crystals: [], // active lifecycles — each has its own state, position, ownership masks
    biteCounter: 0, // bites taken since act start; spawns when biteCounter % SPAWN_INTERVAL === 0
    rand,
    placements: precomputePlacements(game, rand),
    placementCursor: 0,
  };
}

/**
 * Advances the lattice by one bite: spawns a new crystal on cadence, then
 * advances every active crystal's state by one step. Disappeared crystals
 * are reaped at the end.
 *
 * @param {import('../game/index.js').Game} game
 */
export function advanceLattice(game) {
  const mech = game.mechanic;
  if (!mech || mech.type !== "lattice") {
    return;
  }

  if (mech.biteCounter % SPAWN_INTERVAL === 0) {
    mech.crystals.push(newCrystalSlot());
  }
  mech.biteCounter++;

  for (const c of mech.crystals) {
    advanceCrystal(game, c);
  }

  for (let i = mech.crystals.length - 1; i >= 0; i--) {
    if (mech.crystals[i].state === "_done") {
      mech.crystals.splice(i, 1);
    }
  }
}

function newCrystalSlot() {
  return {
    crystalIdx: -1,
    rotation: -1,
    stageIdx: -1,
    x: -1,
    y: -1,
    state: "telegraph_place",
    ownedSolid: null,
    ownedInterior: null,
  };
}

function advanceCrystal(game, c) {
  switch (c.state) {
    case "telegraph_place":
      telegraphPlace(game, c);
      break;
    case "place":
      placeStage0(game, c);
      break;
    case "telegraph_grow":
      telegraphGrow(game, c);
      break;
    case "grow":
      growStage1(game, c);
      break;
    case "linger":
      c.state = "decay";
      break;
    case "decay":
      decay(game, c);
      break;
    case "disappear":
      disappear(game, c);
      break;
  }
}

// ── State handlers ────────────────────────────────────────────────

function telegraphPlace(game, c) {
  const mech = game.mechanic;
  const grid = game.grid;
  const crystals = game.manifest.crystals;

  const placement = nextPrecomputed(mech, grid, crystals) ?? liveSearch(game);
  if (!placement) {
    // No valid spot — stay in telegraph_place and retry next bite.
    return;
  }

  const crystal = crystals[placement.crystalIdx];
  const stage0 = crystal.stages[0];
  const shape = stage0.rotations[placement.rotation % stage0.rotations.length];

  c.crystalIdx = placement.crystalIdx;
  c.rotation = placement.rotation;
  c.x = placement.x;
  c.y = placement.y;

  placeTelegraph(grid, shape, c.x, c.y);
  c.state = "place";
}

function placeStage0(game, c) {
  const grid = game.grid;
  const crystals = game.manifest.crystals;
  const crystal = crystals[c.crystalIdx];
  const stage0 = crystal.stages[0];
  const shape = stage0.rotations[c.rotation % stage0.rotations.length];

  // Allocate ownership masks sized for the largest stage's bbox.
  const stage1 = crystal.stages[1] ?? crystal.stages[0];
  const stage1Shape = stage1.rotations[c.rotation % stage1.rotations.length];
  c.ownedSolid = Array.from({ length: stage1Shape.height }, () => 0);
  c.ownedInterior = Array.from({ length: stage1Shape.height }, () => 0);

  clearTelegraphFor(grid, shape, c.x, c.y);
  stamp(grid, c, shape);

  c.stageIdx = 0;
  c.state = crystal.stages.length > 1 ? "telegraph_grow" : "linger";
}

function telegraphGrow(game, c) {
  const grid = game.grid;
  const crystal = game.manifest.crystals[c.crystalIdx];
  const nextStage = crystal.stages[c.stageIdx + 1];
  const shape = nextStage.rotations[c.rotation % nextStage.rotations.length];

  placeTelegraph(grid, shape, c.x, c.y);
  c.state = "grow";
}

function growStage1(game, c) {
  const grid = game.grid;
  const crystal = game.manifest.crystals[c.crystalIdx];
  const nextStageIdx = c.stageIdx + 1;
  const nextStage = crystal.stages[nextStageIdx];
  const shape = nextStage.rotations[c.rotation % nextStage.rotations.length];

  clearTelegraphFor(grid, shape, c.x, c.y);
  stamp(grid, c, shape);

  c.stageIdx = nextStageIdx;
  c.state = "linger";
}

function decay(game, c) {
  const grid = game.grid;
  const crystal = game.manifest.crystals[c.crystalIdx];
  const stage0Rot = crystal.stages[0].rotations[c.rotation % crystal.stages[0].rotations.length];

  // Release cells we own that lie outside stage 0's silhouette — i.e. the
  // cells stage 1's growth added on top of the kernel.
  const w = grid.width;
  for (let row = 0; row < c.ownedSolid.length; row++) {
    const by = c.y + row;
    if (by < 0 || by >= grid.height) {
      continue;
    }

    const stage0Solid = row < stage0Rot.height ? stage0Rot.solidRows[row] : 0;
    const stage0Interior = row < stage0Rot.height ? stage0Rot.interiorRows[row] : 0;

    const releaseSolid = c.ownedSolid[row] & ~stage0Solid;
    const releaseInterior = c.ownedInterior[row] & ~stage0Interior;

    for (let col = 0; col < 31; col++) {
      const bx = c.x + col;
      if (bx < 0 || bx >= grid.width) {
        continue;
      }
      if (releaseSolid & (1 << col)) {
        if (grid.isWallCell(bx, by)) {
          grid.clearCell("wall", bx, by);
        }
      } else if (releaseInterior & (1 << col)) {
        if (grid.terrain[by * w + bx] === TERRAIN_INTERIOR) {
          grid.terrain[by * w + bx] = TERRAIN_NONE;
        }
      }
    }

    c.ownedSolid[row] &= stage0Solid;
    c.ownedInterior[row] &= stage0Interior;
  }

  c.stageIdx = 0;
  c.state = "disappear";
}

function disappear(game, c) {
  const grid = game.grid;
  const w = grid.width;

  for (let row = 0; row < c.ownedSolid.length; row++) {
    const by = c.y + row;
    if (by < 0 || by >= grid.height) {
      continue;
    }

    const solidMask = c.ownedSolid[row];
    const interiorMask = c.ownedInterior[row];

    for (let col = 0; col < 31; col++) {
      const bx = c.x + col;
      if (bx < 0 || bx >= grid.width) {
        continue;
      }
      if (solidMask & (1 << col)) {
        if (grid.isWallCell(bx, by)) {
          grid.clearCell("wall", bx, by);
        }
      } else if (interiorMask & (1 << col)) {
        if (grid.terrain[by * w + bx] === TERRAIN_INTERIOR) {
          grid.terrain[by * w + bx] = TERRAIN_NONE;
        }
      }
    }
  }

  c.state = "_done";
}

// ── Stamping helpers ──────────────────────────────────────────────

// Stamps solid cells as walls and interior cells as TERRAIN_INTERIOR. Cells
// the crystal actually wrote (skipping snake-occupied cells and cells
// another crystal already owns) are recorded in c.ownedSolid /
// c.ownedInterior so decay/disappear can release just those.
function stamp(grid, c, shape) {
  const w = grid.width;
  for (let row = 0; row < shape.height; row++) {
    const by = c.y + row;
    if (by < 0 || by >= grid.height) {
      continue;
    }

    const solidMask = shape.solidRows[row];
    const interiorMask = shape.interiorRows[row];
    let stampedSolid = 0;
    let stampedInterior = 0;

    for (let col = 0; col < shape.width; col++) {
      const bx = c.x + col;
      if (bx < 0 || bx >= grid.width) {
        continue;
      }
      if (solidMask & (1 << col)) {
        if (grid.isSnakeCell(bx, by)) {
          continue;
        }
        if (grid.isWallCell(bx, by)) {
          continue;
        }
        grid.setCell("wall", bx, by);
        stampedSolid |= 1 << col;
      } else if (interiorMask & (1 << col)) {
        if (grid.isWallCell(bx, by) || grid.isSnakeCell(bx, by)) {
          continue;
        }
        const t = grid.terrain[by * w + bx];
        if (t === TERRAIN_INTERIOR) {
          continue;
        }
        grid.terrain[by * w + bx] = TERRAIN_INTERIOR;
        stampedInterior |= 1 << col;
      }
    }

    c.ownedSolid[row] |= stampedSolid;
    c.ownedInterior[row] |= stampedInterior;
  }
}

// Clears TERRAIN_TELEGRAPH from cells inside the shape's footprint.
// Footprint-scoped so it doesn't blow away another crystal's telegraph.
function clearTelegraphFor(grid, shape, x, y) {
  const w = grid.width;
  for (let row = 0; row < shape.height; row++) {
    const by = y + row;
    if (by < 0 || by >= grid.height) {
      continue;
    }
    const solidMask = shape.solidRows[row];
    for (let col = 0; col < shape.width; col++) {
      if (!(solidMask & (1 << col))) {
        continue;
      }
      const bx = x + col;
      if (bx < 0 || bx >= grid.width) {
        continue;
      }
      if (grid.terrain[by * w + bx] === TERRAIN_TELEGRAPH) {
        grid.terrain[by * w + bx] = TERRAIN_NONE;
      }
    }
  }
}

// Re-export for callers that want a global telegraph reset.
export { clearTelegraph };

// ── Placement search ──────────────────────────────────────────────

function precomputePlacements(game, rand) {
  const grid = game.grid;
  const crystals = game.manifest.crystals;
  const foodRequired = game.foodRequired ?? DEFAULT_FOOD_REQUIRED;
  const count = foodRequired;

  const snake = game.snake;
  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];

  const placements = [];
  for (let i = 0; i < count; i++) {
    const crystalIdx = Math.floor(rand() * crystals.length);
    const crystal = crystals[crystalIdx];
    const stage0 = crystal.stages[0];
    const rotation = Math.floor(rand() * stage0.rotations.length);
    const shape = stage0.rotations[rotation];

    let bestX = -1;
    let bestY = -1;
    let bestDist = -1;

    for (let attempt = 0; attempt < PRECOMPUTE_ATTEMPTS; attempt++) {
      const x = Math.floor(rand() * grid.width);
      const y = Math.floor(rand() * grid.height);
      if (!canPlaceStage(grid, shape, x, y)) {
        continue;
      }
      const dx = x + shape.width / 2 - hx;
      const dy = y + shape.height / 2 - hy;
      const dist = dx * dx + dy * dy;
      if (dist > bestDist) {
        bestDist = dist;
        bestX = x;
        bestY = y;
      }
    }

    placements.push(bestDist < 0 ? null : { crystalIdx, rotation, x: bestX, y: bestY });
  }
  return placements;
}

function nextPrecomputed(mech, grid, crystals) {
  while (mech.placementCursor < mech.placements.length) {
    const candidate = mech.placements[mech.placementCursor++];
    if (!candidate) {
      continue;
    }
    const crystal = crystals[candidate.crystalIdx];
    const stage0 = crystal.stages[0];
    const shape = stage0.rotations[candidate.rotation % stage0.rotations.length];
    if (canPlaceStage(grid, shape, candidate.x, candidate.y)) {
      return candidate;
    }
  }
  return null;
}

function liveSearch(game) {
  const mech = game.mechanic;
  const grid = game.grid;
  const rand = mech.rand;
  const crystals = game.manifest.crystals;

  const crystalIdx = Math.floor(rand() * crystals.length);
  const crystal = crystals[crystalIdx];
  const stage0 = crystal.stages[0];
  const rotation = Math.floor(rand() * stage0.rotations.length);
  const shape = stage0.rotations[rotation];

  const snake = game.snake;
  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];

  let bestX = -1;
  let bestY = -1;
  let bestDist = -1;

  for (let attempt = 0; attempt < FALLBACK_ATTEMPTS; attempt++) {
    const x = Math.floor(rand() * grid.width);
    const y = Math.floor(rand() * grid.height);
    if (!canPlaceStage(grid, shape, x, y)) {
      continue;
    }
    const dx = x + shape.width / 2 - hx;
    const dy = y + shape.height / 2 - hy;
    const dist = dx * dx + dy * dy;
    if (dist > bestDist) {
      bestDist = dist;
      bestX = x;
      bestY = y;
    }
  }

  if (bestDist < 0) {
    return null;
  }
  return { crystalIdx, rotation, x: bestX, y: bestY };
}
