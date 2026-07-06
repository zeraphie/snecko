// generator.js — Brood mutation: empty grid; the player places kin at
// act start (placement step lands in Step 4).
//
// Step 1: empty grid + center snake spawn. Kin placement, real-time
// cull cadence, and Reginald all land in later steps.

import { placeFood } from "../index.js";
import { initCull, advanceCull } from "../../mechanics/cull/index.js";
import { enterPlacement } from "./placement.js";
import { SHIELDS_PER_ACT } from "../../mechanics/cull/constants.js";
import { mixSeeds, splitmix32 } from "../../rng.js";
import { SUBSEED_BROOD_WALLS } from "../../seed-streams.js";
import { TERRAIN_CATACOMB } from "../../grid/constants.js";
import { canPlaceStage, placeStage } from "../crystalline/crystals.js";

/** Number of sparse wall SHAPES scattered on the grid at act start. */
const SPARSE_WALL_SHAPES_MIN = 6;
const SPARSE_WALL_SHAPES_MAX = 8;
/** No walls placed within this Chebyshev distance of the snake spawn. */
const SPARSE_WALL_SPAWN_BUFFER = 2;
/** Grid divided into `SECTOR_COLS × SECTOR_ROWS` regions for even spread. */
const SECTOR_COLS = 3;
const SECTOR_ROWS = 3;

/**
 * Shape library for sparse walls — bar / L / U silhouettes encoded in
 * the same `{ width, height, solidRows[] }` bitmask format crystalline
 * uses for its crystal stages, so we can reuse `canPlaceStage` /
 * `placeStage` from `../crystalline/crystals.js` directly. Bit 0 of
 * each row is column 0; a set bit means "solid wall cell". Rotations
 * are pre-baked. `interiorRows` is omitted — brood walls have no
 * hollow-interior semantics (a U-shape's interior is just an empty
 * traversable cell, not a `TERRAIN_INTERIOR` marker).
 */
const SPARSE_WALL_SHAPES = [
  // Horizontal bars 3-5.
  makeSparseWallShape(3, 1, [0b111]),
  makeSparseWallShape(4, 1, [0b1111]),
  makeSparseWallShape(5, 1, [0b11111]),
  // Vertical bars 3-5.
  makeSparseWallShape(1, 3, [0b1, 0b1, 0b1]),
  makeSparseWallShape(1, 4, [0b1, 0b1, 0b1, 0b1]),
  makeSparseWallShape(1, 5, [0b1, 0b1, 0b1, 0b1, 0b1]),
  // L shapes — 5 cells, 3×3 box, all four rotations.
  //   X..     XXX     ..X     XXX
  //   X..     X..     ..X     ..X
  //   XXX     X..     XXX     ..X
  makeSparseWallShape(3, 3, [0b001, 0b001, 0b111]), // corner bottom-left
  makeSparseWallShape(3, 3, [0b111, 0b001, 0b001]), // corner top-left
  makeSparseWallShape(3, 3, [0b100, 0b100, 0b111]), // corner bottom-right
  makeSparseWallShape(3, 3, [0b111, 0b100, 0b100]), // corner top-right
  // U shapes — 4×3 with a 2-cell opening (up/down), 3×3 with a 1-cell
  // opening (left/right). Snake can navigate around/through them.
  //   X..X    XXXX    XXX     XXX
  //   X..X    X..X    ..X     X..
  //   XXXX    X..X    XXX     XXX
  makeSparseWallShape(4, 3, [0b1001, 0b1001, 0b1111]), // opens up
  makeSparseWallShape(4, 3, [0b1111, 0b1001, 0b1001]), // opens down
  makeSparseWallShape(3, 3, [0b111, 0b100, 0b111]), // opens left
  makeSparseWallShape(3, 3, [0b111, 0b001, 0b111]), // opens right
];

/**
 * Wraps a shape literal in the `Stage` structure crystalline's placer
 * expects — solid rows plus a matching all-zero `interiorRows` mask.
 * Brood walls have no hollow-interior semantics, so nothing lands in
 * `interiorRows`; the field just needs to exist so `placeStage` can
 * read it without crashing.
 */
function makeSparseWallShape(width, height, solidRows) {
  return {
    width,
    height,
    solidRows,
    interiorRows: Array.from({ length: height }, () => 0),
  };
}

/**
 * Generates a fresh brood grid: clears all masks and lays an empty
 * grid. Snake spawns at the centre for act 1 (subsequent-act
 * last-position spawn lands in Step 6). Initialises the cull mechanic,
 * then transitions to the brood-placement screen. Food is placed at
 * the end of placement (in `exitPlacement`), not here — otherwise a
 * placed kin can land on the food cell and bury it.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function generateBroodGrid(game) {
  const grid = game.grid;

  grid.clearMasks("wall");
  grid.clearMasks("snake");
  grid.clearMasks("reserved");
  grid.terrain.fill(0);
  // Clear stale food coords from a prior act/mutation; placement
  // takes over until `exitPlacement` places the first food.
  grid.foodX = -1;
  grid.foodY = -1;

  // D20: act 1 spawns at grid centre; subsequent acts reuse the snake's
  // last position when it left a previous brood act (captured in
  // `confirmDraft`). Any out-of-bounds last position falls back to
  // centre as a safety net.
  let spawnX = Math.floor(grid.width / 2);
  let spawnY = Math.floor(grid.height / 2);
  let dx = 1;
  let dy = 0;
  const last = game._lastSnake;
  if (last && last.x >= 0 && last.x < grid.width && last.y >= 0 && last.y < grid.height) {
    spawnX = last.x;
    spawnY = last.y;
    dx = last.dx;
    dy = last.dy;
  }

  const snakeLen = game.snake.snakeLength > 0 ? game.snake.snakeLength : 3;
  game.snake.init(grid, spawnX, spawnY, snakeLen, dx, dy);

  // Sparse walls — scattered obstacles that block placement, movement,
  // and throws. Cull targeting also skips them (Reginald sees them and
  // wouldn't waste a throw on one). Placed before kin placement so the
  // path-guarantee flood-fill in `isPlacementValid` sees them as
  // pre-existing walls.
  scatterSparseWalls(game, spawnX, spawnY);

  initCull(game);
  grantBroodShields(game);

  // Hand off to the placement state machine. The placement step writes
  // kin cells to the grid and re-places food on exit; STATE_PLAYING is
  // entered once all 6 shapes are placed.
  enterPlacement(game);
}

/**
 * Scatters `SPARSE_WALL_SHAPES_MIN..MAX` wall SHAPES across the grid,
 * deterministic from `actSeed`. Each shape is a pre-defined pattern
 * (bars, Ls, Us) from `SPARSE_WALL_SHAPES`. Placement is bounded — a
 * shape is rejected if any of its cells:
 *   - fall outside the grid,
 *   - land within the snake-spawn buffer,
 *   - overlap an existing wall.
 * Uses the catacomb terrain marker so the render pipeline picks up the
 * catacomb stone texture for free.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} spawnX — snake spawn cell x
 * @param {number} spawnY — snake spawn cell y
 */
function scatterSparseWalls(game, spawnX, spawnY) {
  const grid = game.grid;
  const rand = splitmix32(mixSeeds((game.actSeed ?? 0) | 0, SUBSEED_BROOD_WALLS));
  const span = SPARSE_WALL_SHAPES_MAX - SPARSE_WALL_SHAPES_MIN + 1;
  const target = SPARSE_WALL_SHAPES_MIN + Math.floor(rand() * span);
  const w = grid.width;
  const h = grid.height;

  // Mark the snake-spawn buffer as "reserved" so crystalline's
  // `canPlaceStage` naturally rejects any shape that would land on it.
  // Cleared once scattering is done so it doesn't leak into kin
  // placement.
  reserveSpawnBuffer(grid, spawnX, spawnY, w, h);

  // Sector geometry — grid split into `SECTOR_COLS × SECTOR_ROWS`
  // regions. Each shape's anchor is picked from the sector with the
  // fewest placed shapes so far, giving even spread across the board.
  const sectorW = Math.floor(w / SECTOR_COLS);
  const sectorH = Math.floor(h / SECTOR_ROWS);
  const sectorCount = Array.from({ length: SECTOR_ROWS * SECTOR_COLS }, () => 0);

  let placed = 0;
  // Bump attempt cap alongside the target — with 6-8 shapes and the
  // isolation rollback, more retries can be needed to land the target.
  for (let attempts = 0; attempts < 800 && placed < target; attempts++) {
    // Find sectors with the fewest walls, break ties randomly.
    const minCount = Math.min(...sectorCount);
    const eligible = [];
    for (let i = 0; i < sectorCount.length; i++) {
      if (sectorCount[i] === minCount) {
        eligible.push(i);
      }
    }
    const sectorIdx = eligible[Math.floor(rand() * eligible.length)];
    const sCol = sectorIdx % SECTOR_COLS;
    const sRow = Math.floor(sectorIdx / SECTOR_COLS);
    const sMinX = sCol * sectorW;
    const sMaxX = sCol === SECTOR_COLS - 1 ? w : (sCol + 1) * sectorW;
    const sMinY = sRow * sectorH;
    const sMaxY = sRow === SECTOR_ROWS - 1 ? h : (sRow + 1) * sectorH;

    const shape = SPARSE_WALL_SHAPES[Math.floor(rand() * SPARSE_WALL_SHAPES.length)];
    const ax = sMinX + Math.floor(rand() * (sMaxX - sMinX));
    const ay = sMinY + Math.floor(rand() * (sMaxY - sMinY));
    if (!canPlaceStage(grid, shape, ax, ay)) {
      continue;
    }
    // Place tentatively, then verify no isolated region resulted (a
    // U-shape opening at the grid edge would trap its interior, and
    // the kin-placement path-guarantee flood-fill would then fail
    // everywhere). Roll back and retry if isolation is detected.
    placeStage(grid, shape, ax, ay);
    stampShapeTerrain(grid, shape, ax, ay, TERRAIN_CATACOMB);
    if (!allOpenCellsReachable(grid, spawnX, spawnY, w, h)) {
      unplaceShape(grid, shape, ax, ay);
      continue;
    }
    sectorCount[sectorIdx]++;
    placed++;
  }

  // Clear the spawn-buffer reservations — they were only needed to
  // scope wall placement, not kin placement.
  releaseSpawnBuffer(grid, spawnX, spawnY, w, h);
}

/**
 * Marks the Chebyshev-distance-`SPARSE_WALL_SPAWN_BUFFER` neighbourhood
 * around the snake spawn as reserved. `canPlaceStage` rejects any
 * shape whose solid cells overlap a reserved cell, giving us the
 * spawn buffer without a bespoke check.
 */
function reserveSpawnBuffer(grid, spawnX, spawnY, w, h) {
  for (let dy = -SPARSE_WALL_SPAWN_BUFFER; dy <= SPARSE_WALL_SPAWN_BUFFER; dy++) {
    for (let dx = -SPARSE_WALL_SPAWN_BUFFER; dx <= SPARSE_WALL_SPAWN_BUFFER; dx++) {
      const x = spawnX + dx;
      const y = spawnY + dy;
      if (x < 0 || x >= w || y < 0 || y >= h) {
        continue;
      }
      grid.setCell("reserved", x, y);
    }
  }
}

/** Reverse of `reserveSpawnBuffer` — called after wall scattering. */
function releaseSpawnBuffer(grid, spawnX, spawnY, w, h) {
  for (let dy = -SPARSE_WALL_SPAWN_BUFFER; dy <= SPARSE_WALL_SPAWN_BUFFER; dy++) {
    for (let dx = -SPARSE_WALL_SPAWN_BUFFER; dx <= SPARSE_WALL_SPAWN_BUFFER; dx++) {
      const x = spawnX + dx;
      const y = spawnY + dy;
      if (x < 0 || x >= w || y < 0 || y >= h) {
        continue;
      }
      grid.clearCell("reserved", x, y);
    }
  }
}

/**
 * Walks the shape's solid bitmask and writes `terrainValue` to each
 * solid cell. `placeStage` writes the wall mask but doesn't touch
 * terrain for solid cells — we need to tag them with `TERRAIN_CATACOMB`
 * so the render pipeline picks up the catacomb stone texture.
 */
function stampShapeTerrain(grid, shape, ax, ay, terrainValue) {
  const w = grid.width;
  for (let row = 0; row < shape.height; row++) {
    const solidMask = shape.solidRows[row];
    const by = ay + row;
    if (by < 0 || by >= grid.height) {
      continue;
    }
    for (let col = 0; col < shape.width; col++) {
      if (!(solidMask & (1 << col))) {
        continue;
      }
      const bx = ax + col;
      if (bx < 0 || bx >= w) {
        continue;
      }
      grid.terrain[by * w + bx] = terrainValue;
    }
  }
}

/**
 * Clears every cell the shape occupies — wall mask + terrain marker.
 * Used to roll back a shape whose placement created an isolated region.
 */
function unplaceShape(grid, shape, ax, ay) {
  const w = grid.width;
  for (let row = 0; row < shape.height; row++) {
    const solidMask = shape.solidRows[row];
    const by = ay + row;
    if (by < 0 || by >= grid.height) {
      continue;
    }
    for (let col = 0; col < shape.width; col++) {
      if (!(solidMask & (1 << col))) {
        continue;
      }
      const bx = ax + col;
      if (bx < 0 || bx >= w) {
        continue;
      }
      grid.clearCell("wall", bx, by);
      grid.terrain[by * w + bx] = 0;
    }
  }
}

/**
 * BFS from the snake spawn over non-wall cells. Returns true iff every
 * non-wall cell in the grid is reachable — i.e. the wall configuration
 * doesn't isolate any part of the board.
 */
function allOpenCellsReachable(grid, spawnX, spawnY, w, h) {
  const visited = new Uint8Array(w * h);
  const queue = [spawnX, spawnY];
  visited[spawnY * w + spawnX] = 1;
  let head = 0;
  let reached = 1;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];
    const candidates = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of candidates) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        continue;
      }
      const idx = ny * w + nx;
      if (visited[idx]) {
        continue;
      }
      if (grid.isWallCell(nx, ny)) {
        continue;
      }
      visited[idx] = 1;
      reached++;
      queue.push(nx, ny);
    }
  }
  let totalOpen = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grid.isWallCell(x, y)) {
        totalOpen++;
      }
    }
  }
  return reached === totalOpen;
}

/**
 * Refreshes the shield consumable for the new act: clears any leftover
 * charges from the previous act and grants a fresh SHIELDS_PER_ACT.
 * Shields don't persist across acts.
 *
 * @param {import('../../game/index.js').Game} game
 */
function grantBroodShields(game) {
  if (!game.upgrades) {
    return;
  }
  const list = game.upgrades.consumables;
  if (list) {
    const i = list.findIndex((c) => c.id === "shield");
    if (i >= 0) {
      list.splice(i, 1);
    }
  }
  game.upgrades.addConsumable?.("shield", SHIELDS_PER_ACT);
}

/**
 * Advances the brood grid by one food-bite step.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function advanceBroodGrid(game) {
  advanceCull(game);
  placeFood(game.grid, game.foodRand ?? Math.random);
}
