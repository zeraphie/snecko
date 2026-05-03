// generator.js — Catacombs mutation: pre-generated maze with fixed corridors.
//
// 31×31 grid → 10×10 cell maze, period 3 (2-wide corridors + 1-wide walls
// between cells). Outer wall is the maze's left/top border; the bottom and
// right border come from the period closing on row/col 30.
//
// Layout for a cell (cx, cy) where cx, cy ∈ [0, 9]:
//   - corridor cells: rows 3·cy+1..3·cy+2, cols 3·cx+1..3·cx+2 (2×2 block)
//   - vertical wall between (cx,cy) and (cx+1,cy): col 3·cx+3, rows
//     3·cy+1..3·cy+2
//   - horizontal wall between (cx,cy) and (cx,cy+1): row 3·cy+3, cols
//     3·cx+1..3·cx+2
//
// Generation: recursive backtracker on the cell graph. The board is
// initialised "all walls" then corridors and selected connections are
// carved out.

import { placeFood } from "../index.js";
import { mixSeeds, splitmix32 } from "../../rng.js";
import { SUBSEED_CATACOMBS } from "../../seed-streams.js";
import { initRifts, advanceRifts } from "../../mechanics/rifts.js";

const CELL_PERIOD = 3; // 2 corridor + 1 wall
const CELLS_W = 10;
const CELLS_H = 10;
/** Forward straight-cell requirement at spawn so the player can read the first corner. */
const SPAWN_FORWARD_RUN = 4;
/** Extra connections opened after the backtracker tree, for non-tree topology. */
const EXTRA_LOOPS = 3;

/**
 * Generates a catacombs grid (recursive-backtracker maze + spawn + food).
 *
 * @param {import('../../game/index.js').Game} game
 */
export function generateCatacombsGrid(game) {
  const grid = game.grid;
  const w = grid.width;
  const h = grid.height;

  grid.clearMasks("wall");
  grid.clearMasks("snake");
  grid.clearMasks("reserved");
  grid.terrain.fill(0);

  // 1. Fill everything as wall.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      grid.setCell("wall", x, y);
    }
  }

  // 2. Carve every cell's 2×2 corridor interior.
  for (let cy = 0; cy < CELLS_H; cy++) {
    for (let cx = 0; cx < CELLS_W; cx++) {
      const baseX = CELL_PERIOD * cx + 1;
      const baseY = CELL_PERIOD * cy + 1;
      grid.clearCell("wall", baseX, baseY);
      grid.clearCell("wall", baseX + 1, baseY);
      grid.clearCell("wall", baseX, baseY + 1);
      grid.clearCell("wall", baseX + 1, baseY + 1);
    }
  }

  // 3. Recursive backtracker — pick connections to carve.
  const rand = splitmix32(mixSeeds(game.actSeed | 0, SUBSEED_CATACOMBS));
  carveMaze(grid, rand);

  // 3b. Punch a few extra openings so the maze has cycles, not just a tree.
  punchExtraLoops(grid, rand, EXTRA_LOOPS);

  // 4. Place the snake at a spawn that satisfies the straight-run rule.
  const snakeLen = game.snake.snakeLength > 0 ? game.snake.snakeLength : 3;
  const spawn = findSpawn(grid, snakeLen, rand);
  if (spawn) {
    game.snake.init(grid, spawn.x, spawn.y, snakeLen, spawn.dx, spawn.dy);
  } else {
    // Fallback — should not happen with the recursive-backtracker output.
    game.snake.init(grid, 1, 1, snakeLen, 1, 0);
  }

  // 5. Food.
  placeFood(grid, game.foodRand ?? Math.random);

  // 6. Rifts mechanic.
  initRifts(game);
}

/**
 * Per-bite advance for catacombs: tick the rifts mechanic, then re-place
 * food.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function advanceCatacombsGrid(game) {
  advanceRifts(game);
  placeFood(game.grid, game.foodRand ?? Math.random);
}

// ── Recursive backtracker ────────────────────────────────────────

function carveMaze(grid, rand) {
  const visited = new Uint8Array(CELLS_W * CELLS_H);
  const stack = [{ cx: 0, cy: 0 }];
  visited[0] = 1;

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const next = pickUnvisitedNeighbour(top.cx, top.cy, visited, rand);
    if (next === null) {
      stack.pop();
      continue;
    }
    carveConnection(grid, top.cx, top.cy, next.dx, next.dy);
    visited[next.cy * CELLS_W + next.cx] = 1;
    stack.push({ cx: next.cx, cy: next.cy });
  }
}

const NEIGHBOUR_DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

function pickUnvisitedNeighbour(cx, cy, visited, rand) {
  // Fisher–Yates a fresh copy of the directions.
  const dirs = NEIGHBOUR_DIRS.slice();
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = dirs[i];
    dirs[i] = dirs[j];
    dirs[j] = tmp;
  }
  for (const { dx, dy } of dirs) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || nx >= CELLS_W || ny < 0 || ny >= CELLS_H) continue;
    if (visited[ny * CELLS_W + nx]) continue;
    return { cx: nx, cy: ny, dx, dy };
  }
  return null;
}

function carveConnection(grid, cx, cy, dx, dy) {
  if (dx === 1) {
    const wallX = CELL_PERIOD * cx + CELL_PERIOD;
    grid.clearCell("wall", wallX, CELL_PERIOD * cy + 1);
    grid.clearCell("wall", wallX, CELL_PERIOD * cy + 2);
  } else if (dx === -1) {
    const wallX = CELL_PERIOD * cx;
    grid.clearCell("wall", wallX, CELL_PERIOD * cy + 1);
    grid.clearCell("wall", wallX, CELL_PERIOD * cy + 2);
  } else if (dy === 1) {
    const wallY = CELL_PERIOD * cy + CELL_PERIOD;
    grid.clearCell("wall", CELL_PERIOD * cx + 1, wallY);
    grid.clearCell("wall", CELL_PERIOD * cx + 2, wallY);
  } else {
    const wallY = CELL_PERIOD * cy;
    grid.clearCell("wall", CELL_PERIOD * cx + 1, wallY);
    grid.clearCell("wall", CELL_PERIOD * cx + 2, wallY);
  }
}

// ── Extra-loop pass ──────────────────────────────────────────────

/**
 * Picks `count` still-closed inter-cell walls and opens them so the maze
 * isn't a perfect tree. Closed walls are detected by checking whether
 * both cells of the 1×2 (or 2×1) gap between two cells are still wall.
 * If the maze has fewer closed walls than `count` (very small mazes),
 * silently does fewer.
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {() => number} rand
 * @param {number} count
 */
function punchExtraLoops(grid, rand, count) {
  const candidates = [];

  // Vertical walls between (cx, cy) and (cx+1, cy).
  for (let cy = 0; cy < CELLS_H; cy++) {
    for (let cx = 0; cx < CELLS_W - 1; cx++) {
      const wallX = CELL_PERIOD * cx + CELL_PERIOD;
      const a = CELL_PERIOD * cy + 1;
      const b = CELL_PERIOD * cy + 2;
      if (grid.isWallCell(wallX, a) && grid.isWallCell(wallX, b)) {
        candidates.push({ axis: "h", wallX, ya: a, yb: b });
      }
    }
  }

  // Horizontal walls between (cx, cy) and (cx, cy+1).
  for (let cy = 0; cy < CELLS_H - 1; cy++) {
    for (let cx = 0; cx < CELLS_W; cx++) {
      const wallY = CELL_PERIOD * cy + CELL_PERIOD;
      const a = CELL_PERIOD * cx + 1;
      const b = CELL_PERIOD * cx + 2;
      if (grid.isWallCell(a, wallY) && grid.isWallCell(b, wallY)) {
        candidates.push({ axis: "v", wallY, xa: a, xb: b });
      }
    }
  }

  const n = Math.min(count, candidates.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rand() * candidates.length);
    const c = candidates.splice(idx, 1)[0];
    if (c.axis === "h") {
      grid.clearCell("wall", c.wallX, c.ya);
      grid.clearCell("wall", c.wallX, c.yb);
    } else {
      grid.clearCell("wall", c.xa, c.wallY);
      grid.clearCell("wall", c.xb, c.wallY);
    }
  }
}

// ── Spawn search ─────────────────────────────────────────────────

/**
 * Finds a corridor cell + facing direction that satisfies the spawn
 * constraints AND gives the player the longest available straight run for
 * a gentler opening. Falls back to "any candidate meeting the floor" if
 * the maze happens to be unusually winding.
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {number} snakeLen
 * @param {() => number} rand
 * @returns {{ x: number, y: number, dx: number, dy: number } | null}
 */
function findSpawn(grid, snakeLen, rand) {
  const candidates = [];
  let maxForward = 0;
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (grid.isWallCell(x, y)) continue;
      for (const { dx, dy } of NEIGHBOUR_DIRS) {
        const forward = countStraightRun(grid, x, y, dx, dy);
        if (forward < SPAWN_FORWARD_RUN) continue;
        if (countStraightRun(grid, x, y, -dx, -dy) < snakeLen - 1) continue;
        candidates.push({ x, y, dx, dy, forward });
        if (forward > maxForward) maxForward = forward;
      }
    }
  }
  if (candidates.length === 0) return null;

  // Prefer the longer-run cohort. Tolerate a 1-cell gap below the max so
  // we don't always pick the same single longest corridor every act.
  const threshold = Math.max(SPAWN_FORWARD_RUN, maxForward - 1);
  const top = candidates.filter((c) => c.forward >= threshold);
  return top[Math.floor(rand() * top.length)];
}

function countStraightRun(grid, x, y, dx, dy) {
  let count = 0;
  for (let i = 1; ; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) break;
    if (grid.isWallCell(nx, ny)) break;
    count++;
  }
  return count;
}
