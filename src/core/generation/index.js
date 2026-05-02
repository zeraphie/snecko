// generation.js — Grid generation: influence map, shape placement, food

import { Snake } from "../snake/index.js";
import { buildCrystals, canPlaceStage, placeStage } from "./crystalline/crystals.js";
import { initLattice, advanceLattice } from "../mechanics/lattice.js";
import { TERRAIN_TELEGRAPH, TERRAIN_CURRENT } from "../grid/constants.js";
import { mixSeeds, splitmix32 } from "../rng.js";
import { SUBSEED_CRYSTALLINE } from "../seed-streams.js";

const CRYSTALS = buildCrystals();
const SPAWN_BUFFER = 3;
const INFLUENCE_ATTRACTORS = 4;
const PLACEMENT_CANDIDATES = 60;
const RESERVE_AHEAD = 3;
const RESERVE_RADIUS = 2;

// ── Reserve zone helpers ──────────────────────────────────────────

/**
 * Marks a rectangular zone around the snake's spawn as reserved.
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {number} spawnX
 * @param {number} spawnY
 * @param {number} snakeLength
 * @param {number} dx — spawn direction X
 * @param {number} dy — spawn direction Y
 */
export function buildReservedSpawnZone(grid, spawnX, spawnY, snakeLength, dx, dy) {
  let minX = spawnX - Math.abs(dx) * (snakeLength - 1);
  let minY = spawnY - Math.abs(dy) * (snakeLength - 1);
  let maxX = spawnX;
  let maxY = spawnY;

  if (minX > maxX) {
    const tmp = minX;
    minX = maxX;
    maxX = tmp;
  }
  if (minY > maxY) {
    const tmp = minY;
    minY = maxY;
    maxY = tmp;
  }

  minX -= SPAWN_BUFFER;
  minY -= SPAWN_BUFFER;
  maxX += SPAWN_BUFFER;
  maxY += SPAWN_BUFFER;

  const ahead = SPAWN_BUFFER + 2;
  if (dx > 0) {
    maxX += ahead;
  } else if (dx < 0) {
    minX -= ahead;
  }
  if (dy > 0) {
    maxY += ahead;
  } else if (dy < 0) {
    minY -= ahead;
  }

  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(grid.width - 1, maxX);
  maxY = Math.min(grid.height - 1, maxY);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      grid.setCell("reserved", x, y);
    }
  }
}

/**
 * Marks cells around the snake body and ahead of the head as reserved.
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {import('../snake/index.js').Snake} snake
 */
export function buildReservedAroundSnake(grid, snake) {
  const w = grid.width;
  const h = grid.height;

  let idx = snake.tailIndex;
  while (true) {
    const sx = snake.snakeX[idx];
    const sy = snake.snakeY[idx];
    for (let dy = -RESERVE_RADIUS; dy <= RESERVE_RADIUS; dy++) {
      for (let dx = -RESERVE_RADIUS; dx <= RESERVE_RADIUS; dx++) {
        const rx = sx + dx;
        const ry = sy + dy;
        if (rx >= 0 && rx < w && ry >= 0 && ry < h) {
          grid.setCell("reserved", rx, ry);
        }
      }
    }
    if (idx === snake.headIndex) {
      break;
    }
    idx = (idx + 1) % Snake.MAX_CELLS;
  }

  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];
  for (let i = 1; i <= RESERVE_AHEAD; i++) {
    const ax = hx + snake.dirX * i;
    const ay = hy + snake.dirY * i;
    if (ax >= 0 && ax < w && ay >= 0 && ay < h) {
      grid.setCell("reserved", ax, ay);
    }
  }
}

// ── Influence map ─────────────────────────────────────────────────

/**
 * Generates a normalised [0,1] influence map using random attractors.
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {() => number} [rand=Math.random]
 * @returns {Float32Array}
 */
export function generateInfluenceMap(grid, rand = Math.random) {
  const w = grid.width;
  const h = grid.height;
  const map = new Float32Array(w * h);

  for (let a = 0; a < INFLUENCE_ATTRACTORS; a++) {
    const ax = rand() * w;
    const ay = rand() * h;
    const strength = 0.5 + rand() * 0.5;
    const radius = Math.max(w, h) * (0.3 + rand() * 0.3);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - ax;
        const dy = y - ay;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const falloff = Math.max(0, 1 - dist / radius);
        map[y * w + x] += strength * falloff;
      }
    }
  }

  let max = 0;
  for (let i = 0; i < map.length; i++) {
    if (map[i] > max) {
      max = map[i];
    }
  }
  if (max > 0) {
    for (let i = 0; i < map.length; i++) {
      map[i] /= max;
    }
  }

  return map;
}

// ── Shape placement ───────────────────────────────────────────────

/**
 * Scores a candidate shape placement by influence density + distance from reference point.
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {Float32Array} influenceMap
 * @param {object} shape — rotation with solidRows/width/height
 * @param {number} x
 * @param {number} y
 * @param {number} refX
 * @param {number} refY
 * @returns {number}
 */
export function scoreShapePlacement(grid, influenceMap, shape, x, y, refX, refY) {
  const w = grid.width;
  let totalInfluence = 0;
  let cellCount = 0;

  for (let row = 0; row < shape.height; row++) {
    const rowMask = shape.solidRows[row];
    for (let col = 0; col < shape.width; col++) {
      if (!(rowMask & (1 << col))) {
        continue;
      }
      totalInfluence += influenceMap[(y + row) * w + (x + col)];
      cellCount++;
    }
  }

  const avgInfluence = cellCount > 0 ? totalInfluence / cellCount : 0;

  // Distance bonus — prefer placements further from the reference point
  const cx = x + shape.width / 2;
  const cy = y + shape.height / 2;
  const dist = Math.sqrt((cx - refX) * (cx - refX) + (cy - refY) * (cy - refY));
  const maxDist = Math.sqrt(w * w + grid.height * grid.height);
  const distBonus = (dist / maxDist) * 0.3;

  return avgInfluence + distBonus;
}

/**
 * Tries random candidate positions and returns the highest-scoring valid placement.
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {Float32Array} influenceMap
 * @param {object} shape
 * @param {number} refX
 * @param {number} refY
 * @param {() => number} [rand=Math.random]
 * @returns {{ x: number, y: number, score: number }|null}
 */
export function findBestPlacement(grid, influenceMap, shape, refX, refY, rand = Math.random) {
  let bestScore = -1;
  let bestX = -1;
  let bestY = -1;

  for (let i = 0; i < PLACEMENT_CANDIDATES; i++) {
    const x = Math.floor(rand() * grid.width);
    const y = Math.floor(rand() * grid.height);

    if (!canPlaceStage(grid, shape, x, y)) {
      continue;
    }

    const score = scoreShapePlacement(grid, influenceMap, shape, x, y, refX, refY);
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
      bestY = y;
    }
  }

  if (bestScore < 0) {
    return null;
  }
  return { x: bestX, y: bestY, score: bestScore };
}

/**
 * Picks a random set of crystal shapes scaled to the current act index.
 *
 * @param {number} actIndex
 * @param {() => number} [rand=Math.random]
 * @returns {object[]}
 */
export function pickShapesForAct(actIndex, rand = Math.random) {
  let count;
  if (actIndex <= 3) {
    count = 1;
  } else if (actIndex <= 8) {
    count = 2;
  } else {
    count = 3 + Math.floor((actIndex - 9) / 4);
  }

  const shapes = [];
  for (let i = 0; i < count; i++) {
    const crystalIdx = Math.floor(rand() * CRYSTALS.length);
    const crystal = CRYSTALS[crystalIdx];
    // Use stage 1 (index 0) for initial placement
    const stage0 = crystal.stages[0];
    const rotIdx = Math.floor(rand() * stage0.rotations.length);
    shapes.push(stage0.rotations[rotIdx]);
  }
  return shapes;
}

// ── Food placement ────────────────────────────────────────────────

function isFoodBlocked(grid, x, y) {
  if (grid.isBlockedCell(x, y)) {
    return true;
  }
  const t = grid.terrain[y * grid.width + x];
  return t === TERRAIN_TELEGRAPH || t === TERRAIN_CURRENT;
}

/**
 * Places food at a random unblocked, non-terrain cell (with fallback full scan).
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {() => number} [rand=Math.random]
 */
export function placeFood(grid, rand = Math.random) {
  for (let attempts = 0; attempts < 200; attempts++) {
    const x = Math.floor(rand() * grid.width);
    const y = Math.floor(rand() * grid.height);
    if (!isFoodBlocked(grid, x, y)) {
      grid.foodX = x;
      grid.foodY = y;
      return;
    }
  }
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!isFoodBlocked(grid, x, y)) {
        grid.foodX = x;
        grid.foodY = y;
        return;
      }
    }
  }
}

// ── Grid generation ──────────────────────────────────────────────

/**
 * Generates a fresh crystalline grid: clears masks, places shapes, spawns snake and food.
 *
 * @param {import('../game/index.js').Game} game
 */
export function generateGrid(game) {
  const grid = game.grid;

  grid.clearMasks("wall");
  grid.clearMasks("snake");
  grid.clearMasks("reserved");
  grid.terrain.fill(0);

  // One-shot PRNG for the initial layout — derived from the act seed so
  // two runs at the same act produce identical crystal placements.
  const rand = splitmix32(mixSeeds(game.actSeed, SUBSEED_CRYSTALLINE));
  const foodRand = game.foodRand ?? rand;

  const spawnX = Math.floor(grid.width / 2);
  const spawnY = Math.floor(grid.height / 2);
  const dx = 1;
  const dy = 0;

  const snakeLen = game.snake.snakeLength > 0 ? game.snake.snakeLength : 3;

  buildReservedSpawnZone(grid, spawnX, spawnY, snakeLen, dx, dy);

  const influenceMap = generateInfluenceMap(grid, rand);

  const shapes = pickShapesForAct(game.actIndex, rand);
  for (let i = 0; i < shapes.length; i++) {
    const placement = findBestPlacement(grid, influenceMap, shapes[i], spawnX, spawnY, rand);
    if (placement) {
      placeStage(grid, shapes[i], placement.x, placement.y);
    }
  }

  grid.clearMasks("reserved");

  game.snake.init(grid, spawnX, spawnY, snakeLen, dx, dy);

  placeFood(grid, foodRand);

  initLattice(game);
}

/**
 * Advances the crystalline grid by one step (lattice growth + food placement).
 *
 * @param {import('../game/index.js').Game} game
 */
export function advanceGrid(game) {
  const grid = game.grid;

  advanceLattice(game);

  placeFood(grid, game.foodRand ?? Math.random);
}
