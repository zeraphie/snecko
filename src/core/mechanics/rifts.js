// rifts.js — Catacombs mechanic: the maze rifts open and reseal.
//
// The maze base layout is fixed at act start (see
// `generation/catacombs/generator.js`). This mechanic mutates one
// branching node every `RIFT_CADENCE` food-bites: a closed inter-cell
// wall opens and an open inter-cell wall closes — the maze topology
// shifts slightly while staying connected.
//
// Per-bite lifecycle (one cycle = RIFT_CADENCE bites):
//   linger × (RIFT_CADENCE - 2) → telegraph_rift → rift → linger …
// `telegraph_rift` paints the soon-to-flip cells with TERRAIN_TELEGRAPH;
// `rift` clears the telegraph and applies the flip.
//
// Determinism: the rift sequence is pre-computed in batches from the
// seeded `mech.rand`. When the batch runs out it's refilled. Batches are
// validated against the live maze + snake state at use time; an invalid
// batch entry is skipped.

import { mixSeeds, splitmix32 } from "../rng.js";
import { SUBSEED_RIFTS } from "../seed-streams.js";
import { TERRAIN_TELEGRAPH, TERRAIN_NONE } from "../grid/constants.js";

/** Bites per rift cycle. Lifecycle = (CADENCE-2) lingers + telegraph + rift. */
const RIFT_CADENCE = 5;
/** Pre-computed rifts per batch. Refilled when the cursor runs out. */
const RIFT_BATCH_SIZE = 5;

const CELL_PERIOD = 3;
const CELLS_W = 10;
const CELLS_H = 10;

/**
 * Initialises the rifts mechanic on a freshly generated catacombs grid.
 * The first batch of rifts is pre-computed against the initial maze +
 * snake position.
 *
 * @param {import('../game/index.js').Game} game
 */
export function initRifts(game) {
  const rand = splitmix32(mixSeeds(game.actSeed | 0, SUBSEED_RIFTS));
  game.mechanic = {
    type: "rifts",
    state: "linger",
    rand,
    biteCounter: 0,
    pendingRift: null,
    riftBatch: [],
  };
  refillBatch(game);
}

/**
 * Advances the mechanic by one food-bite. Stays in `linger` for the first
 * (CADENCE-2) bites of each cycle, transitions to `telegraph_rift` to
 * paint the warning, then to `rift` to apply the flip and reset.
 *
 * @param {import('../game/index.js').Game} game
 */
export function advanceRifts(game) {
  const mech = game.mechanic;
  if (!mech || mech.type !== "rifts") {
    return;
  }

  mech.biteCounter++;

  if (mech.state === "linger") {
    if (mech.biteCounter % RIFT_CADENCE === RIFT_CADENCE - 1) {
      enterTelegraphRift(game);
    }
    return;
  }

  if (mech.state === "telegraph_rift") {
    applyRift(game);
    return;
  }
}

// ── State transitions ────────────────────────────────────────────

function enterTelegraphRift(game) {
  const mech = game.mechanic;
  const grid = game.grid;

  let rift = popRift(game);
  // If the queued rift is invalid against current state, try the next.
  while (rift && !isRiftSafe(grid, game.snake, rift)) {
    rift = popRift(game);
  }
  if (!rift) {
    // No valid rift right now — stay in linger; the cycle ticks past.
    return;
  }

  paintRiftTelegraph(grid, rift);
  mech.pendingRift = rift;
  mech.state = "telegraph_rift";
}

function applyRift(game) {
  const mech = game.mechanic;
  const grid = game.grid;
  const rift = mech.pendingRift;

  clearRiftTelegraph(grid, rift);
  // Re-validate against the snake's current position — the snake moved
  // one bite since we picked this rift.
  if (isRiftSafe(grid, game.snake, rift)) {
    applyRiftToGrid(grid, rift);
  }

  mech.pendingRift = null;
  mech.state = "linger";
}

// ── Rift selection + batching ────────────────────────────────────

function popRift(game) {
  const mech = game.mechanic;
  if (mech.riftBatch.length === 0) {
    refillBatch(game);
  }
  return mech.riftBatch.shift() ?? null;
}

function refillBatch(game) {
  const mech = game.mechanic;
  const grid = game.grid;
  for (let i = 0; i < RIFT_BATCH_SIZE; i++) {
    const rift = pickRandomRift(grid, mech.rand);
    if (rift) mech.riftBatch.push(rift);
  }
}

/**
 * Picks an `(open, close)` rift that preserves connectivity:
 * - `open` is a currently-closed inter-cell wall (becomes open).
 * - `close` is a currently-open inter-cell wall whose closing doesn't
 *   disconnect the maze.
 *
 * Returns null when no valid pair exists (e.g. maze fully open).
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {() => number} rand
 * @returns {{ open: object, close: object } | null}
 */
function pickRandomRift(grid, rand) {
  const closed = listInterCellWalls(grid, true);
  const open = listInterCellWalls(grid, false);
  if (closed.length === 0 || open.length === 0) return null;

  const openTarget = closed[Math.floor(rand() * closed.length)];

  // Try open walls in shuffled order, pick the first one whose closure
  // keeps the maze connected after also opening `openTarget`.
  const shuffled = open.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  for (const candidate of shuffled) {
    if (preservesConnectivityAfterRift(grid, openTarget, candidate)) {
      return { open: openTarget, close: candidate };
    }
  }
  return null;
}

// ── Wall enumeration ─────────────────────────────────────────────

/**
 * Lists every inter-cell wall, filtered by whether the gap is currently
 * closed (both gap cells are walls) or open (both gap cells are non-walls).
 * Returns wall descriptors with the two affected board cells.
 *
 * @param {import('../grid/index.js').Grid} grid
 * @param {boolean} closed — true = list closed walls, false = open walls
 */
function listInterCellWalls(grid, closed) {
  const result = [];

  // Vertical walls (between (cx, cy) and (cx+1, cy)).
  for (let cy = 0; cy < CELLS_H; cy++) {
    for (let cx = 0; cx < CELLS_W - 1; cx++) {
      const wallX = CELL_PERIOD * cx + CELL_PERIOD;
      const ya = CELL_PERIOD * cy + 1;
      const yb = CELL_PERIOD * cy + 2;
      const wallA = grid.isWallCell(wallX, ya);
      const wallB = grid.isWallCell(wallX, yb);
      if (wallA === closed && wallB === closed) {
        result.push({ axis: "v", cells: [{ x: wallX, y: ya }, { x: wallX, y: yb }] });
      }
    }
  }

  // Horizontal walls (between (cx, cy) and (cx, cy+1)).
  for (let cy = 0; cy < CELLS_H - 1; cy++) {
    for (let cx = 0; cx < CELLS_W; cx++) {
      const wallY = CELL_PERIOD * cy + CELL_PERIOD;
      const xa = CELL_PERIOD * cx + 1;
      const xb = CELL_PERIOD * cx + 2;
      const wallA = grid.isWallCell(xa, wallY);
      const wallB = grid.isWallCell(xb, wallY);
      if (wallA === closed && wallB === closed) {
        result.push({ axis: "h", cells: [{ x: xa, y: wallY }, { x: xb, y: wallY }] });
      }
    }
  }

  return result;
}

// ── Connectivity check ──────────────────────────────────────────

/**
 * True if applying the rift (open `openTarget`, close `closeTarget`)
 * leaves the maze fully connected. Mutates the grid temporarily and
 * restores it before returning.
 */
function preservesConnectivityAfterRift(grid, openTarget, closeTarget) {
  // Apply provisionally.
  for (const cell of openTarget.cells) grid.clearCell("wall", cell.x, cell.y);
  for (const cell of closeTarget.cells) grid.setCell("wall", cell.x, cell.y);

  const ok = isMazeFullyConnected(grid);

  // Undo.
  for (const cell of openTarget.cells) grid.setCell("wall", cell.x, cell.y);
  for (const cell of closeTarget.cells) grid.clearCell("wall", cell.x, cell.y);

  return ok;
}

function isMazeFullyConnected(grid) {
  // BFS from one corridor cell (cell 0,0's interior — board 1,1) and check
  // every other corridor cell is reachable.
  const w = grid.width;
  const h = grid.height;
  const visited = new Uint8Array(w * h);
  const queue = [];
  const startX = 1;
  const startY = 1;
  queue.push([startX, startY]);
  visited[startY * w + startX] = 1;
  let reached = 0;
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    reached++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (visited[ny * w + nx]) continue;
      if (grid.isWallCell(nx, ny)) continue;
      visited[ny * w + nx] = 1;
      queue.push([nx, ny]);
    }
  }

  // Total non-wall cells across the maze.
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grid.isWallCell(x, y)) total++;
    }
  }
  return reached === total;
}

// ── Snake-path safety ────────────────────────────────────────────

/**
 * True iff the rift is safe to apply right now: neither flip cell is
 * occupied by the snake, and neither lies on the head's straight forward
 * projection (the player's current path).
 */
function isRiftSafe(grid, snake, rift) {
  // Snake-occupied cells block both flips immediately.
  for (const cell of [...rift.open.cells, ...rift.close.cells]) {
    if (grid.isSnakeCell(cell.x, cell.y)) return false;
  }
  // The rift's close cells shouldn't lie on the snake's straight forward
  // path — the player committed to that corridor.
  const projection = forwardProjection(grid, snake);
  for (const cell of rift.close.cells) {
    for (const proj of projection) {
      if (proj.x === cell.x && proj.y === cell.y) return false;
    }
  }
  return true;
}

function forwardProjection(grid, snake) {
  const cells = [];
  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];
  const dx = snake.dirX;
  const dy = snake.dirY;
  for (let i = 1; i <= 8; i++) {
    const nx = hx + dx * i;
    const ny = hy + dy * i;
    if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) break;
    if (grid.isWallCell(nx, ny)) break;
    cells.push({ x: nx, y: ny });
  }
  return cells;
}

// ── Apply / paint helpers ────────────────────────────────────────

function applyRiftToGrid(grid, rift) {
  for (const cell of rift.open.cells) grid.clearCell("wall", cell.x, cell.y);
  for (const cell of rift.close.cells) grid.setCell("wall", cell.x, cell.y);
}

function paintRiftTelegraph(grid, rift) {
  const w = grid.width;
  for (const cell of [...rift.open.cells, ...rift.close.cells]) {
    grid.terrain[cell.y * w + cell.x] = TERRAIN_TELEGRAPH;
  }
}

function clearRiftTelegraph(grid, rift) {
  if (!rift) return;
  const w = grid.width;
  for (const cell of [...rift.open.cells, ...rift.close.cells]) {
    if (grid.terrain[cell.y * w + cell.x] === TERRAIN_TELEGRAPH) {
      grid.terrain[cell.y * w + cell.x] = TERRAIN_NONE;
    }
  }
}

export { RIFT_CADENCE };
