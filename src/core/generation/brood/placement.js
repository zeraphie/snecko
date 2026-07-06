// placement.js — Brood placement state machine.
//
// At act start, the player places the brood pool (6 shapes, D5) on an
// empty grid via cursor input. Each placement writes the shape's cells
// to the grid (as walls for now — Step 5 swaps in dedicated brood cell
// types). When all 6 are placed, control transitions to STATE_PLAYING.
//
// Step 4: state machine + cursor movement + rotation + Tab cycling +
// confirm + undo. **No placement rules** — confirms always succeed.
// Rules (overlap, snake buffer, path guarantee) land in Step 5.
//
// State lives at `game._broodPlacement`:
//   activeShapeId  — current ghost shape (one of SHAPE_IDS)
//   rotation       — current rotation index for the active shape
//   cursorX/Y      — cursor position on the grid
//   placed         — list of confirmed placements:
//                    { shapeId, rotation, x, y, cells: [[ax, ay], ...] }
//                    (cells stored absolute for cheap undo + render)
//   unplaced       — shape ids still in the pool (active included)

import { STATE_BROOD_PLACEMENT, STATE_PLAYING } from "../../game/constants.js";
import { TERRAIN_KIN_HEAD, TERRAIN_KIN_BODY, TERRAIN_NONE } from "../../grid/constants.js";
import { mixSeeds, splitmix32 } from "../../rng.js";
import { SUBSEED_BROOD } from "../../seed-streams.js";
import { placeFood } from "../index.js";
import { HATCHLING_NAMES, KINDS } from "../../../text/cull/index.js";
import { SHAPES, SHAPE_IDS, shapeCells } from "./shapes.js";
import { MINES_PER_ACT } from "../../mechanics/cull/constants.js";

/** Placement mode discriminator. See `game._broodPlacement.mode`. */
export const PLACEMENT_MODE_KIN = "kin";
export const PLACEMENT_MODE_MINES = "mines";

/**
 * Initialises the placement state and transitions the game into the
 * brood-placement screen. Called from `generateBroodGrid` at act start.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function enterPlacement(game) {
  const cx = game.snake.snakeX[game.snake.headIndex];
  const cy = game.snake.snakeY[game.snake.headIndex];

  // Assign each shape a name + kind up front (Q1). Cycles through a
  // shuffled name pool so the six kin are guaranteed unique within an
  // act. Seeded from the act seed so replays produce the same names.
  const rand = splitmix32(mixSeeds((game.actSeed ?? 0) | 0, SUBSEED_BROOD));
  const identities = assignIdentities(rand);

  game._broodPlacement = {
    mode: PLACEMENT_MODE_KIN,
    activeShapeId: SHAPE_IDS[0],
    rotation: 0,
    cursorX: cx,
    cursorY: cy,
    placed: [],
    unplaced: SHAPE_IDS.slice(),
    identities,
    // Mine placement (Phase 3) — becomes active once every kin is
    // placed. `minesPlaced` holds `{x, y}` records for cursor undo /
    // `exitPlacement` to hand off to `game.mechanic.mines`.
    minesPlaced: [],
    minesRemaining: MINES_PER_ACT,
  };
  game.state = STATE_BROOD_PLACEMENT;
}

/**
 * Builds the `{ shapeId: { name, kind } }` map for the act. Names are
 * sampled without replacement from `HATCHLING_NAMES`; kind is rolled
 * per-shape.
 *
 * @param {() => number} rand
 * @returns {Record<string, { name: string, kind: string }>}
 */
function assignIdentities(rand) {
  const pool = HATCHLING_NAMES.slice();
  // Fisher–Yates partial shuffle for the first SHAPE_IDS.length picks.
  for (let i = 0; i < SHAPE_IDS.length; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  const out = {};
  for (let i = 0; i < SHAPE_IDS.length; i++) {
    const id = SHAPE_IDS[i];
    out[id] = {
      name: pool[i],
      kind: KINDS[Math.floor(rand() * KINDS.length)],
    };
  }
  return out;
}

/**
 * Returns the absolute cells the ghost shape would occupy at the
 * current cursor + rotation. Used by both the renderer (ghost preview)
 * and `confirmPlacement` (write to grid).
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {Array<[number, number]>}
 */
export function ghostCells(game) {
  const p = game._broodPlacement;
  if (!p) {
    return [];
  }
  if (p.mode === PLACEMENT_MODE_MINES) {
    return [[p.cursorX, p.cursorY]];
  }
  const shape = SHAPES[p.activeShapeId];
  const offsets = shapeCells(shape, p.rotation);
  return offsets.map(([dx, dy]) => [p.cursorX + dx, p.cursorY + dy]);
}

/**
 * Validates the active ghost-shape placement against the four rules
 * (D19):
 *
 *   1. All cells in bounds.
 *   2. No overlap with already-placed kin (wall cells).
 *   3. Snake-spawn buffer — no ghost cell on the snake's body or
 *      orthogonally adjacent to it.
 *   4. Path guarantee — after the candidate placement, the snake can
 *      reach every remaining open cell via 4-cardinal moves
 *      (flood-fill).
 *
 * Cheap to call on every cursor move: BFS visits at most ~grid.w *
 * grid.h cells (~961 at default 31×31).
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {boolean}
 */
export function isPlacementValid(game) {
  const p = game._broodPlacement;
  if (!p) {
    return false;
  }
  if (p.mode === PLACEMENT_MODE_MINES) {
    return isMinePlacementValid(game);
  }
  const cells = ghostCells(game);
  const grid = game.grid;
  const w = grid.width;
  const h = grid.height;

  // 1. Bounds + intra-shape uniqueness (shape data should already be
  //    valid; defending against misconfigured shapes is cheap).
  const ghostSet = new Set();
  for (const [x, y] of cells) {
    if (x < 0 || x >= w || y < 0 || y >= h) {
      return false;
    }
    const key = y * w + x;
    if (ghostSet.has(key)) {
      return false;
    }
    ghostSet.add(key);
  }

  // 2. Overlap with placed kin (wall mask catches them).
  for (const [x, y] of cells) {
    if (grid.isWallCell(x, y)) {
      return false;
    }
  }

  // 3. Snake overlap + 1-cell orthogonal buffer.
  for (const [x, y] of cells) {
    if (grid.isSnakeCell(x, y)) {
      return false;
    }
    if (x + 1 < w && grid.isSnakeCell(x + 1, y)) {
      return false;
    }
    if (x - 1 >= 0 && grid.isSnakeCell(x - 1, y)) {
      return false;
    }
    if (y + 1 < h && grid.isSnakeCell(x, y + 1)) {
      return false;
    }
    if (y - 1 >= 0 && grid.isSnakeCell(x, y - 1)) {
      return false;
    }
  }

  // 4. Path guarantee: every non-blocked cell must be reachable from
  //    the snake head via 4-cardinal moves through non-blocked cells.
  //    Blocked = wall (already-placed kin) OR ghost cell (candidate
  //    placement). Snake body cells are treated as walkable since the
  //    tail vacates them as the snake moves.
  const startX = game.snake.snakeX[game.snake.headIndex];
  const startY = game.snake.snakeY[game.snake.headIndex];

  const isBlocked = (x, y) => grid.isWallCell(x, y) || ghostSet.has(y * w + x);

  const visited = new Uint8Array(w * h);
  visited[startY * w + startX] = 1;
  const queue = [startX, startY];
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
      if (isBlocked(nx, ny)) {
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
      if (!isBlocked(x, y)) {
        totalOpen++;
      }
    }
  }
  return reached === totalOpen;
}

/**
 * Validity check for the mine phase. A mine can drop on any cell that
 * isn't the snake, isn't already a wall (kin / sparse wall / memorial),
 * and isn't already carrying a mine. Cheap — no flood-fill.
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {boolean}
 */
function isMinePlacementValid(game) {
  const p = game._broodPlacement;
  if (!p || p.mode !== PLACEMENT_MODE_MINES) {
    return false;
  }
  if (p.minesRemaining <= 0) {
    return false;
  }
  const grid = game.grid;
  const w = grid.width;
  const h = grid.height;
  const x = p.cursorX;
  const y = p.cursorY;
  if (x < 0 || x >= w || y < 0 || y >= h) {
    return false;
  }
  if (grid.isSnakeCell(x, y)) {
    return false;
  }
  if (grid.isWallCell(x, y)) {
    return false;
  }
  // Duplicate mine.
  for (const m of p.minesPlaced) {
    if (m.x === x && m.y === y) {
      return false;
    }
  }
  return true;
}

/**
 * Moves the placement cursor by (dx, dy), clamping to grid bounds.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} dx
 * @param {number} dy
 */
export function movePlacementCursor(game, dx, dy) {
  const p = game._broodPlacement;
  if (!p) {
    return;
  }
  const w = game.grid.width;
  const h = game.grid.height;
  p.cursorX = Math.max(0, Math.min(w - 1, p.cursorX + dx));
  p.cursorY = Math.max(0, Math.min(h - 1, p.cursorY + dy));
}

/**
 * Advances the active shape's rotation by one state (wraps via the
 * shape's rotation count).
 *
 * @param {import('../../game/index.js').Game} game
 */
export function rotatePlacementShape(game) {
  const p = game._broodPlacement;
  if (!p) {
    return;
  }
  const shape = SHAPES[p.activeShapeId];
  p.rotation = (p.rotation + 1) % shape.rotations.length;
}

/**
 * Tab key: cycles to the next unplaced shape (wraps). Resets rotation
 * to 0 on the new shape.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function cyclePlacementShape(game) {
  const p = game._broodPlacement;
  if (!p) {
    return;
  }
  const idx = p.unplaced.indexOf(p.activeShapeId);
  const next = (idx + 1) % p.unplaced.length;
  p.activeShapeId = p.unplaced[next];
  p.rotation = 0;
}

/**
 * Confirms the active shape's placement: writes its cells to the grid,
 * records the placement, and advances to the next unplaced shape (or
 * exits placement when the pool is empty). Step 4 has no validation —
 * confirms always succeed.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function confirmPlacement(game) {
  const p = game._broodPlacement;
  if (!p) {
    return;
  }
  if (!isPlacementValid(game)) {
    return;
  }
  if (p.mode === PLACEMENT_MODE_MINES) {
    p.minesPlaced.push({ x: p.cursorX, y: p.cursorY });
    p.minesRemaining--;
    if (p.minesRemaining <= 0) {
      exitPlacement(game);
    }
    return;
  }
  const cells = ghostCells(game);
  // Write each cell to the grid as a wall (blocks snake + food spawn)
  // and paint the kin-head / kin-body terrain marker so the renderer
  // routes to the right brood cell type (D6, D7). Out-of-bounds cells
  // are ignored for Step 4; bounds validation lands in Step 5.
  const w = game.grid.width;
  const h = game.grid.height;
  for (let i = 0; i < cells.length; i++) {
    const [ax, ay] = cells[i];
    if (ax >= 0 && ax < w && ay >= 0 && ay < h) {
      game.grid.setCell("wall", ax, ay);
      // First entry in the cell list is always the head (offsets
      // anchor at [0, 0]).
      game.grid.terrain[ay * w + ax] = i === 0 ? TERRAIN_KIN_HEAD : TERRAIN_KIN_BODY;
    }
  }
  const identity = p.identities[p.activeShapeId];
  p.placed.push({
    shapeId: p.activeShapeId,
    rotation: p.rotation,
    x: p.cursorX,
    y: p.cursorY,
    cells,
    name: identity.name,
    kind: identity.kind,
  });
  p.unplaced = p.unplaced.filter((id) => id !== p.activeShapeId);

  if (p.unplaced.length === 0) {
    // Every kin down — switch to the mine phase instead of exiting.
    // `exitPlacement` runs once mines are placed.
    p.mode = PLACEMENT_MODE_MINES;
    return;
  }
  p.activeShapeId = p.unplaced[0];
  p.rotation = 0;
}

/**
 * Undoes the most recent placement: clears its cells from the grid,
 * returns its shape to the unplaced pool, and re-selects it as the
 * active shape. No-op if nothing has been placed yet.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function undoPlacement(game) {
  const p = game._broodPlacement;
  if (!p) {
    return;
  }
  // Mine mode: pop the most recent mine. If none remain to undo and we
  // haven't placed the last kin yet (unplaced.length > 0 shouldn't
  // happen in this branch), stay put. Otherwise, if there are still no
  // mines placed, drop back to kin mode and pop the last kin — treating
  // "undo at the start of mine phase" as "back to last kin".
  if (p.mode === PLACEMENT_MODE_MINES) {
    if (p.minesPlaced.length > 0) {
      const last = p.minesPlaced.pop();
      p.minesRemaining++;
      p.cursorX = last.x;
      p.cursorY = last.y;
      return;
    }
    // No mines yet — step back into kin mode and undo the last kin.
    p.mode = PLACEMENT_MODE_KIN;
    // Fall through to the kin-undo branch below.
  }
  if (p.placed.length === 0) {
    return;
  }
  const last = p.placed.pop();
  const w = game.grid.width;
  const h = game.grid.height;
  for (const [ax, ay] of last.cells) {
    if (ax >= 0 && ax < w && ay >= 0 && ay < h) {
      game.grid.clearCell("wall", ax, ay);
      game.grid.terrain[ay * w + ax] = TERRAIN_NONE;
    }
  }
  // Reinsert in the original SHAPE_IDS order so Tab cycling stays
  // predictable.
  const order = SHAPE_IDS.filter((id) => p.unplaced.includes(id) || id === last.shapeId);
  p.unplaced = order;
  p.activeShapeId = last.shapeId;
  p.rotation = last.rotation;
  p.cursorX = last.x;
  p.cursorY = last.y;
}

/**
 * Completes the placement step: copies placed shapes into
 * `game.mechanic.kin` (Step 7 paints them with brood cell types) and
 * transitions to STATE_PLAYING. The cull mechanic begins on the next
 * tick.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function exitPlacement(game) {
  const p = game._broodPlacement;
  if (!p) {
    return;
  }
  game.mechanic.kin = p.placed.map((entry) => ({
    shapeId: entry.shapeId,
    rotation: entry.rotation,
    x: entry.x,
    y: entry.y,
    cells: entry.cells,
    name: entry.name,
    kind: entry.kind,
    alive: true,
    shielded: false,
  }));
  // Hand off placed mines to the cull mechanic — Set of "x,y" so the
  // impact resolver can `.has(...)` in O(1).
  game.mechanic.mines = new Set(p.minesPlaced.map((m) => m.x + "," + m.y));
  game._broodPlacement = null;
  // Place food now that the grid is final — the generator skips food
  // at boot so it doesn't get buried under a kin during placement.
  placeFood(game.grid, game.foodRand ?? Math.random);
  game.state = STATE_PLAYING;
  game.lastTickTime = Date.now();
}
