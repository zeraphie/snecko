// lattice.js — Crystalline mechanic: staged crystal growth

import {
  buildCrystals,
  canPlaceStage,
  placeStage,
  placeTelegraph,
  clearTelegraph,
} from "../generation/crystalline/crystals.js";
import { mixSeeds, splitmix32 } from "../rng.js";
import { SUBSEED_LATTICE } from "../seed-streams.js";

const CRYSTALS = buildCrystals();

/**
 * Initialises the lattice mechanic on a freshly generated crystalline grid.
 *
 * @param {import('../game/index.js').Game} game
 */
export function initLattice(game) {
  game.mechanic = {
    type: "lattice",
    activeCrystal: null, // { crystalIdx, rotation, stageIdx, x, y }
    state: "place", // "place" | "telegraph" | "growth"
    // Stateful PRNG seeded from the act seed so two runs at the same act
    // pick the same crystals in the same order.
    rand: splitmix32(mixSeeds(game.actSeed | 0, SUBSEED_LATTICE)),
  };
}

/**
 * Advances the lattice by one step (called each food eaten).
 * Cycles through place → telegraph → growth phases.
 *
 * @param {import('../game/index.js').Game} game
 */
export function advanceLattice(game) {
  const mech = game.mechanic;
  if (!mech || mech.type !== "lattice") {
    return;
  }

  if (mech.state === "place") {
    placeNewCrystal(game);
  } else if (mech.state === "telegraph") {
    growCrystal(game);
  } else if (mech.state === "growth") {
    // After growth, check if more stages remain
    const active = mech.activeCrystal;
    if (active) {
      const crystal = CRYSTALS[active.crystalIdx];
      if (active.stageIdx + 1 < crystal.stages.length) {
        // Telegraph the next stage
        telegraphNextStage(game);
      } else {
        // Max stage reached — next food places a new crystal
        mech.activeCrystal = null;
        mech.state = "place";
      }
    } else {
      mech.state = "place";
    }
  }
}

function placeNewCrystal(game) {
  const mech = game.mechanic;
  const grid = game.grid;
  const rand = mech.rand ?? Math.random;

  // Pick a random crystal and rotation
  const crystalIdx = Math.floor(rand() * CRYSTALS.length);
  const crystal = CRYSTALS[crystalIdx];
  const stage0 = crystal.stages[0];
  const rotation = Math.floor(rand() * stage0.rotations.length);
  const shape = stage0.rotations[rotation];

  // Find placement position (try random positions, away from snake)
  const snake = game.snake;
  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];

  let bestX = -1;
  let bestY = -1;
  let bestDist = -1;

  for (let attempt = 0; attempt < 60; attempt++) {
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
    // No valid placement found — skip, try again next food
    return;
  }

  placeStage(grid, shape, bestX, bestY);

  mech.activeCrystal = {
    crystalIdx,
    rotation,
    stageIdx: 0,
    x: bestX,
    y: bestY,
  };

  // Check if more stages exist
  if (crystal.stages.length > 1) {
    mech.state = "telegraph";
    // Immediately show telegraph for next stage
    telegraphNextStage(game);
  } else {
    // Only 1 stage — done with this crystal
    mech.activeCrystal = null;
    mech.state = "place";
  }
}

function telegraphNextStage(game) {
  const mech = game.mechanic;
  const active = mech.activeCrystal;
  const crystal = CRYSTALS[active.crystalIdx];
  const nextStageIdx = active.stageIdx + 1;
  const nextStageData = crystal.stages[nextStageIdx];
  const shape = nextStageData.rotations[active.rotation % nextStageData.rotations.length];

  clearTelegraph(game.grid);
  placeTelegraph(game.grid, shape, active.x, active.y);
  mech.state = "telegraph";
}

function growCrystal(game) {
  const mech = game.mechanic;
  const grid = game.grid;
  const active = mech.activeCrystal;
  const crystal = CRYSTALS[active.crystalIdx];
  const nextStageIdx = active.stageIdx + 1;
  const nextStageData = crystal.stages[nextStageIdx];
  const shape = nextStageData.rotations[active.rotation % nextStageData.rotations.length];

  clearTelegraph(grid);

  // Place solid cells — but skip cells occupied by the snake
  for (let row = 0; row < shape.height; row++) {
    const by = active.y + row;
    if (by < 0 || by >= grid.height) {
      continue;
    }
    const solidMask = shape.solidRows[row];
    for (let col = 0; col < shape.width; col++) {
      if (!(solidMask & (1 << col))) {
        continue;
      }
      const bx = active.x + col;
      if (bx < 0 || bx >= grid.width) {
        continue;
      }
      // Snake blocks growth — cell stays empty
      if (grid.isSnakeCell(bx, by)) {
        continue;
      }
      // Don't re-place if already a wall (from earlier stage)
      if (grid.isWallCell(bx, by)) {
        continue;
      }
      grid.setCell("wall", bx, by);
    }
  }

  active.stageIdx = nextStageIdx;
  mech.state = "growth";
}
