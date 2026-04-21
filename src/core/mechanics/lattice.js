// lattice.js — Crystalline mechanic: staged crystal growth

import {
  buildCrystals,
  canPlaceStage,
  placeStage,
  placeTelegraph,
  clearTelegraph,
} from '../generation/crystalline/crystals.js';

const CRYSTALS = buildCrystals();

/**
 * Initialises the lattice mechanic on a freshly generated crystalline board.
 *
 * @param {import('../game/index.js').Game} game
 */
export function initLattice(game) {
  game.mechanic = {
    type: 'lattice',
    activeCrystal: null, // { crystalIdx, rotation, stageIdx, x, y }
    phase: 'place', // "place" | "telegraph" | "growth"
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
  if (!mech || mech.type !== 'lattice') {
    return;
  }

  if (mech.phase === 'place') {
    placeNewCrystal(game);
  } else if (mech.phase === 'telegraph') {
    growCrystal(game);
  } else if (mech.phase === 'growth') {
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
        mech.phase = 'place';
      }
    } else {
      mech.phase = 'place';
    }
  }
}

function placeNewCrystal(game) {
  const mech = game.mechanic;
  const board = game.board;

  // Pick a random crystal and rotation
  const crystalIdx = Math.floor(Math.random() * CRYSTALS.length);
  const crystal = CRYSTALS[crystalIdx];
  const stage0 = crystal.stages[0];
  const rotation = Math.floor(Math.random() * stage0.rotations.length);
  const shape = stage0.rotations[rotation];

  // Find placement position (try random positions, away from snake)
  const snake = game.snake;
  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];

  let bestX = -1;
  let bestY = -1;
  let bestDist = -1;

  for (let attempt = 0; attempt < 60; attempt++) {
    const x = Math.floor(Math.random() * board.width);
    const y = Math.floor(Math.random() * board.height);
    if (!canPlaceStage(board, shape, x, y)) continue;

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

  placeStage(board, shape, bestX, bestY);

  mech.activeCrystal = {
    crystalIdx,
    rotation,
    stageIdx: 0,
    x: bestX,
    y: bestY,
  };

  // Check if more stages exist
  if (crystal.stages.length > 1) {
    mech.phase = 'telegraph';
    // Immediately show telegraph for next stage
    telegraphNextStage(game);
  } else {
    // Only 1 stage — done with this crystal
    mech.activeCrystal = null;
    mech.phase = 'place';
  }
}

function telegraphNextStage(game) {
  const mech = game.mechanic;
  const active = mech.activeCrystal;
  const crystal = CRYSTALS[active.crystalIdx];
  const nextStageIdx = active.stageIdx + 1;
  const nextStageData = crystal.stages[nextStageIdx];
  const shape = nextStageData.rotations[active.rotation % nextStageData.rotations.length];

  clearTelegraph(game.board);
  placeTelegraph(game.board, shape, active.x, active.y);
  mech.phase = 'telegraph';
}

function growCrystal(game) {
  const mech = game.mechanic;
  const board = game.board;
  const active = mech.activeCrystal;
  const crystal = CRYSTALS[active.crystalIdx];
  const nextStageIdx = active.stageIdx + 1;
  const nextStageData = crystal.stages[nextStageIdx];
  const shape = nextStageData.rotations[active.rotation % nextStageData.rotations.length];

  clearTelegraph(board);

  // Place solid cells — but skip cells occupied by the snake
  for (let row = 0; row < shape.height; row++) {
    const by = active.y + row;
    if (by < 0 || by >= board.height) continue;
    const solidMask = shape.solidRows[row];
    for (let col = 0; col < shape.width; col++) {
      if (!(solidMask & (1 << col))) continue;
      const bx = active.x + col;
      if (bx < 0 || bx >= board.width) continue;
      // Snake blocks growth — cell stays empty
      if (board.isSnakeCell(bx, by)) continue;
      // Don't re-place if already a wall (from earlier stage)
      if (board.isWallCell(bx, by)) continue;
      board.setCell('wall', bx, by);
    }
  }

  active.stageIdx = nextStageIdx;
  mech.phase = 'growth';
}
