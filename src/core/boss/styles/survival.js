// survival.js — Survival boss style.
//
// Snake survives the boss for a fixed duration; no HP, no projectiles,
// no row lock. A 2×2 blob (catacombs corridor width) chases via BFS.
// Win = SURVIVAL_WIN_TICKS elapsed. Lose = any blob cell overlaps any
// snake cell, or the existing snake death rules (wall, self).
//
// Path-shifts continue during the fight on a tick cadence (driving the
// catacombs rifts mechanic at SURVIVAL_PATH_SHIFT_TICKS / RIFT_CADENCE
// per cycle step). When a flip closes on the blob's footprint, the blob
// is pushed back along -lastDir to the nearest valid 2×2 placement and
// stunned for SURVIVAL_BOSS_STUN_TICKS — flips never kill the blob.

import {
  BOSS_TICK_MS,
  BOSS_INTRO_TICKS,
  SURVIVAL_WIN_TICKS,
  SURVIVAL_BLOB_SIZE,
  SURVIVAL_BOSS_TICK_INTERVAL,
  SURVIVAL_RIFT_INTERVAL_TICKS,
  SURVIVAL_BOSS_STUN_TICKS,
  DEATH_WALL,
  DEATH_SELF,
  DEATH_BLOB,
} from "../../game/constants.js";
import { LABELS } from "../../../text/labels.js";
import { advanceRifts } from "../../mechanics/rifts.js";

const NSEW = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

// ── BFS pathfinding helpers ────────────────────────────────────────

/**
 * BFS distance from (sx, sy) to every reachable cell. Walls are blocked;
 * snake cells are passable so the blob can pursue and ultimately overlap.
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {number} sx
 * @param {number} sy
 * @returns {Int16Array} dist[y * width + x] — -1 if unreachable
 */
function bfsDistances(grid, sx, sy) {
  const w = grid.width;
  const h = grid.height;
  const dist = new Int16Array(w * h).fill(-1);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) {
    return dist;
  }
  if (grid.isWallCell(sx, sy)) {
    return dist;
  }
  const queue = [sy * w + sx];
  dist[sy * w + sx] = 0;
  let qhead = 0;
  while (qhead < queue.length) {
    const pos = queue[qhead++];
    const x = pos % w;
    const y = (pos / w) | 0;
    const d = dist[pos];
    const nbs = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (let i = 0; i < 4; i++) {
      const nx = nbs[i][0];
      const ny = nbs[i][1];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
        continue;
      }
      const ni = ny * w + nx;
      if (dist[ni] !== -1) {
        continue;
      }
      if (grid.isWallCell(nx, ny)) {
        continue;
      }
      dist[ni] = d + 1;
      queue.push(ni);
    }
  }
  return dist;
}

/**
 * True iff every cell in the blob's 2×2 footprint at (x, y) is in-bounds
 * and non-wall. Snake cells don't disqualify (they're traversable for the
 * blob — the blob lands on a snake cell to deal the killing touch).
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {number} x
 * @param {number} y
 */
function isValidBlobPlacement(grid, x, y) {
  for (let dy = 0; dy < SURVIVAL_BLOB_SIZE; dy++) {
    for (let dx = 0; dx < SURVIVAL_BLOB_SIZE; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height) {
        return false;
      }
      if (grid.isWallCell(cx, cy)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Distance of a 2×2 placement to the BFS source: minimum BFS distance
 * across the 4 cells of the footprint. Returns -1 if any cell is
 * unreachable, since pursuing a blob with one wall-locked corner is a
 * meaningless "victory".
 *
 * @param {Int16Array} dist
 * @param {number} w — grid width
 * @param {number} x
 * @param {number} y
 */
function placementDist(dist, w, x, y) {
  let min = Infinity;
  for (let dy = 0; dy < SURVIVAL_BLOB_SIZE; dy++) {
    for (let dx = 0; dx < SURVIVAL_BLOB_SIZE; dx++) {
      const d = dist[(y + dy) * w + (x + dx)];
      if (d < 0) {
        return -1;
      }
      if (d < min) {
        min = d;
      }
    }
  }
  return min;
}

/**
 * Finds the 2×2 placement furthest from (sx, sy) by BFS. Used to spawn
 * the blob at fight entry — the player should see "incoming threat from
 * the far end of the maze", not "blob next to me already". Returns null
 * if no valid placement is reachable.
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {number} sx
 * @param {number} sy
 * @returns {{x:number, y:number} | null}
 */
export function findFurthestPlacement(grid, sx, sy) {
  const dist = bfsDistances(grid, sx, sy);
  const w = grid.width;
  let best = null;
  let bestDist = -1;
  for (let y = 0; y <= grid.height - SURVIVAL_BLOB_SIZE; y++) {
    for (let x = 0; x <= grid.width - SURVIVAL_BLOB_SIZE; x++) {
      if (!isValidBlobPlacement(grid, x, y)) {
        continue;
      }
      const d = placementDist(dist, w, x, y);
      if (d > bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/**
 * Plans the next blob move. Two-stage decision:
 *
 *   1. **Mid-corridor commit** — if the blob has a `lastDir` and exactly
 *      one valid non-backward neighbour exists, commit to that move
 *      (provided it brings the blob closer to the snake). This keeps
 *      the blob sliding down a corridor instead of constantly re-evaluating
 *      mid-passage, which would otherwise let it pick technically-valid
 *      diagonal-ish turns through 2-cell openings.
 *
 *   2. **Junction replan** — at intersections (≥2 valid non-backward
 *      neighbours) or dead ends (0 valid non-backward neighbours), do
 *      a full BFS gradient descent: pick the neighbour with the lowest
 *      min-distance. Ties favour `lastDir` via iteration order.
 *
 * Returns {dx:0,dy:0} when no candidate strictly beats the current
 * footprint distance — i.e. the blob is already as close as it can get,
 * or genuinely stuck.
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {{x:number,y:number,lastDx:number,lastDy:number}} blob
 * @param {number} snakeHeadX
 * @param {number} snakeHeadY
 * @returns {{dx:number, dy:number}}
 */
export function planBlobMove(grid, blob, snakeHeadX, snakeHeadY) {
  const dist = bfsDistances(grid, snakeHeadX, snakeHeadY);
  const w = grid.width;
  const currentDist = placementDist(dist, w, blob.x, blob.y);

  // Stage 1: in-corridor lock-in. Skip if no lastDir.
  if (blob.lastDx !== 0 || blob.lastDy !== 0) {
    const backDx = -blob.lastDx;
    const backDy = -blob.lastDy;
    const forwards = [];
    for (const c of NSEW) {
      if (c.dx === backDx && c.dy === backDy) {
        continue;
      }
      if (isValidBlobPlacement(grid, blob.x + c.dx, blob.y + c.dy)) {
        forwards.push(c);
      }
    }
    if (forwards.length === 1) {
      const fwd = forwards[0];
      const d = placementDist(dist, w, blob.x + fwd.dx, blob.y + fwd.dy);
      // Commit when forward doesn't worsen distance. Strict-less would
      // freeze the blob on plateau cells (BFS distance can hold flat
      // for a tick mid-passage when the 2×2 footprint straddles cells).
      // Only fall through to replan when forward actually moves *away*
      // from the snake — i.e. we've passed it and need to turn back.
      if (d >= 0 && d <= currentDist) {
        return fwd;
      }
    }
  }

  // Stage 2: junction replan. Iterate lastDir first so it wins ties.
  const order = [];
  if (blob.lastDx !== 0 || blob.lastDy !== 0) {
    order.push({ dx: blob.lastDx, dy: blob.lastDy });
  }
  for (const c of NSEW) {
    if (c.dx === blob.lastDx && c.dy === blob.lastDy) {
      continue;
    }
    order.push(c);
  }

  let bestDir = { dx: 0, dy: 0 };
  let bestDist = currentDist;
  for (const c of order) {
    const nx = blob.x + c.dx;
    const ny = blob.y + c.dy;
    if (!isValidBlobPlacement(grid, nx, ny)) {
      continue;
    }
    const d = placementDist(dist, w, nx, ny);
    if (d < 0) {
      continue;
    }
    if (d < bestDist) {
      bestDist = d;
      bestDir = c;
    }
  }
  return bestDir;
}

// ── Collision helpers ──────────────────────────────────────────────

/**
 * True iff any cell of the 2×2 blob overlaps any snake cell.
 *
 * @param {import('../../game/index.js').Game} game
 */
function snakeTouchesBlob(game) {
  const blob = game._bossSurvival.blob;
  const grid = game.grid;
  for (let dy = 0; dy < SURVIVAL_BLOB_SIZE; dy++) {
    for (let dx = 0; dx < SURVIVAL_BLOB_SIZE; dx++) {
      if (grid.isSnakeCell(blob.x + dx, blob.y + dy)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True iff any cell of the 2×2 blob is now a wall — checked after a
 * path-shift flip lands so the blob can be pushed back to a corridor.
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {{x:number,y:number}} blob
 */
function blobOverlapsWall(grid, blob) {
  for (let dy = 0; dy < SURVIVAL_BLOB_SIZE; dy++) {
    for (let dx = 0; dx < SURVIVAL_BLOB_SIZE; dx++) {
      if (grid.isWallCell(blob.x + dx, blob.y + dy)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Pushes the blob back along `-lastDir` to the nearest valid 2×2
 * placement after a flip closes on it. Falls back to a BFS search for
 * any nearest valid placement when the blob has no `lastDir` (just
 * spawned and got hit by a flip — unlikely but possible) or the push
 * direction is fully walled.
 *
 * Returns the new {x, y} top-left, or null if no valid placement exists
 * within search range (shouldn't happen with rift connectivity guarantees).
 *
 * @param {import('../../grid/index.js').Grid} grid
 * @param {{x:number,y:number,lastDx:number,lastDy:number}} blob
 */
function pushBlob(grid, blob) {
  // Linear walk in -lastDir direction first.
  const pushDx = -blob.lastDx;
  const pushDy = -blob.lastDy;
  if (pushDx !== 0 || pushDy !== 0) {
    let nx = blob.x + pushDx;
    let ny = blob.y + pushDy;
    // Bound the walk by grid extent.
    const maxSteps = grid.width + grid.height;
    for (let i = 0; i < maxSteps; i++) {
      if (
        nx < 0 ||
        ny < 0 ||
        nx > grid.width - SURVIVAL_BLOB_SIZE ||
        ny > grid.height - SURVIVAL_BLOB_SIZE
      ) {
        break;
      }
      if (isValidBlobPlacement(grid, nx, ny)) {
        return { x: nx, y: ny };
      }
      nx += pushDx;
      ny += pushDy;
    }
  }

  // Fallback: BFS for the nearest valid placement in any direction.
  const visited = new Uint8Array(grid.width * grid.height);
  const queue = [{ x: blob.x, y: blob.y }];
  visited[blob.y * grid.width + blob.x] = 1;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (isValidBlobPlacement(grid, cur.x, cur.y)) {
      return { x: cur.x, y: cur.y };
    }
    for (const c of NSEW) {
      const nx = cur.x + c.dx;
      const ny = cur.y + c.dy;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) {
        continue;
      }
      if (visited[ny * grid.width + nx]) {
        continue;
      }
      visited[ny * grid.width + nx] = 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

// ── Style contract ─────────────────────────────────────────────────

/**
 * Initialises survival-style state. The catacombs maze stays on the grid
 * (no arena swap). Spawns the blob at the BFS-furthest valid 2×2
 * placement from the snake head, sets the intro window, and seeds the
 * countdown.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {import('../bosses/index.js').BossDef} _def
 */
export function setup(game, def) {
  // Practice mode (boss picker / boss rush) enters via _enterPracticeBossFight
  // which constructs a fresh Snake (snakeLength === 0). In that case the grid
  // is whatever the previous mutation/run left behind — possibly no maze at
  // all — so the boss def's bootGrid hook lays a playable maze + snake spawn.
  // Skipped in normal play because the run's generateGrid already produced a
  // valid catacombs grid before red-food entry.
  if (game.snake.snakeLength === 0 && def?.bootGrid) {
    def.bootGrid(game);
  }

  // Survival has no food / boss-food — clear any cells the host mutation
  // (or bootGrid) may have placed so they don't render mid-fight or get
  // accidentally eaten. The catacombs maze, walls, and snake stay put.
  game.grid.foodX = -1;
  game.grid.foodY = -1;
  game.grid.bossFoodX = -1;
  game.grid.bossFoodY = -1;

  // Minimal `_boss` shim so callers reading `game._boss.name` (HUD, tests,
  // boss-rush queue) keep working without a style check. Survival has no
  // BossEntity — the chasing blob lives in `game._bossSurvival.blob`.
  game._boss = {
    name: LABELS.bosses[def.id]?.name ?? def.id ?? "Boss",
  };
  game._fight = null;
  game._heldDirection = null;
  game._playerFacing = { dx: 0, dy: -1 };

  const headX = game.snake.snakeX[game.snake.headIndex];
  const headY = game.snake.snakeY[game.snake.headIndex];
  const spawn = findFurthestPlacement(game.grid, headX, headY);

  game._bossSurvival = {
    ticksLeft: SURVIVAL_WIN_TICKS,
    introTicks: BOSS_INTRO_TICKS,
    snakeLengthAtEntry: game.snake.snakeLength,
    blob: {
      x: spawn ? spawn.x : 1,
      y: spawn ? spawn.y : 1,
      lastDx: 0,
      lastDy: 0,
      stunTicks: 0,
    },
    bossStepCounter: 0,
    shiftCounter: 0,
  };
  game._lastBossTickTime = Date.now();
}

/**
 * One survival tick (gated by BOSS_TICK_MS). During the intro window the
 * snake and blob are both frozen — only the intro counter advances. After
 * the intro: snake auto-advances (food rules suppressed since survival
 * never spawns food), blob steps every SURVIVAL_BOSS_TICK_INTERVAL ticks
 * via BFS gradient-descent, both ends of the move check for blob-on-snake
 * collision, and the survival countdown ticks down toward victory.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function tick(game) {
  const now = Date.now();
  if (now - game._lastBossTickTime < BOSS_TICK_MS) {
    return;
  }
  game._lastBossTickTime = now;

  const sv = game._bossSurvival;

  // Intro window — both sides frozen.
  if (sv.introTicks > 0) {
    sv.introTicks--;
    return;
  }

  // Snake step — wraps around grid edges as in regular play, but the
  // catacombs hard border catches it as a wall first.
  const result = game.snake.step(game.grid);
  if (result === "wall") {
    game._exitBossDeath(DEATH_WALL);
    return;
  }
  if (result === "self") {
    game._exitBossDeath(DEATH_SELF);
    return;
  }
  if (result === "dead") {
    game._exitBossDeath(DEATH_SELF);
    return;
  }
  // "food" / "boss-food" / "ok" — survival doesn't spawn food, but if a
  // stale food cell were eaten the snake would just grow; harmless.

  if (snakeTouchesBlob(game)) {
    game._exitBossDeath(DEATH_BLOB);
    return;
  }

  // Blob step (gated by SURVIVAL_BOSS_TICK_INTERVAL — 1 = match player).
  sv.bossStepCounter++;
  if (sv.bossStepCounter >= SURVIVAL_BOSS_TICK_INTERVAL) {
    sv.bossStepCounter = 0;
    if (sv.blob.stunTicks > 0) {
      sv.blob.stunTicks--;
    } else {
      const headX = game.snake.snakeX[game.snake.headIndex];
      const headY = game.snake.snakeY[game.snake.headIndex];
      const move = planBlobMove(game.grid, sv.blob, headX, headY);
      if (move.dx !== 0 || move.dy !== 0) {
        sv.blob.x += move.dx;
        sv.blob.y += move.dy;
        sv.blob.lastDx = move.dx;
        sv.blob.lastDy = move.dy;
      }
    }
    if (snakeTouchesBlob(game)) {
      game._exitBossDeath(DEATH_BLOB);
      return;
    }
  }

  // Path-shift driver: drive the catacombs rifts mechanic on a tick
  // cadence (RIFT_CADENCE = 5 cycle steps × SURVIVAL_RIFT_INTERVAL_TICKS
  // = SURVIVAL_PATH_SHIFT_TICKS total). When a flip lands and walls any
  // of the blob's footprint, push the blob back along -lastDir and stun.
  sv.shiftCounter++;
  if (sv.shiftCounter >= SURVIVAL_RIFT_INTERVAL_TICKS) {
    sv.shiftCounter = 0;
    advanceRifts(game);
    if (blobOverlapsWall(game.grid, sv.blob)) {
      const dest = pushBlob(game.grid, sv.blob);
      if (dest) {
        sv.blob.x = dest.x;
        sv.blob.y = dest.y;
        sv.blob.lastDx = 0;
        sv.blob.lastDy = 0;
      }
      sv.blob.stunTicks = SURVIVAL_BOSS_STUN_TICKS;
      // Snake-touches-blob check after relocation (rare but possible).
      if (snakeTouchesBlob(game)) {
        game._exitBossDeath(DEATH_BLOB);
        return;
      }
    }
  }

  sv.ticksLeft--;
  if (sv.ticksLeft <= 0) {
    game._exitBossVictory();
  }
}

/**
 * Forwards player directional input to the snake's `setNextDirection` so
 * the snake responds 4-directionally on the maze (no Y-lock). Bullet-hell
 * uses a different model (`_heldDirection`); the dispatcher routes to
 * each style's handler.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} dx
 * @param {number} dy
 */
export function onInput(game, dx, dy) {
  // Honour the shared-contract intro freeze.
  if (game._bossSurvival && game._bossSurvival.introTicks > 0) {
    return;
  }
  game.snake.setNextDirection(dx, dy);
}

/**
 * Clears survival-specific state. Called from the dispatcher's
 * `_exitBossVictory` / `_exitBossDeath` before style-agnostic transitions.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function teardown(game) {
  game._boss = null;
  game._bossSurvival = null;
  game._heldDirection = null;
}
