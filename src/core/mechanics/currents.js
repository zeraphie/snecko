// currents.js — Wildlands mechanic: FBM-based winding rivers

import { createPermTable, fbm2 } from '../generation/wildlands/noise.js';
import { TERRAIN_CURRENT, TERRAIN_NONE } from '../board/constants.js';

const PHASE_TELEGRAPH = 0;
const PHASE_FLOW = 1;
const PHASE_SURGE = 2;
const PHASE_SHIFT = 3;
const PHASE_COUNT = 4;

// ── Public API ────────────────────────────────────────────────────

/**
 * Initialises the currents mechanic on a freshly generated wildlands board.
 *
 * @param {import('../game/index.js').Game} game
 */
export function initCurrents(game) {
  game.mechanic = {
    type: 'currents',
    phase: PHASE_TELEGRAPH,
    cells: [],
    contactApplied: false,
  };
  generateRiver(game);
  paintCurrentTerrain(game);
}

/**
 * Advances currents by one phase (called each food eaten).
 * Cycles through telegraph → flow → surge → shift.
 *
 * @param {import('../game/index.js').Game} game
 */
export function advanceCurrents(game) {
  const mech = game.mechanic;
  if (!mech || mech.type !== 'currents') {
    return;
  }

  mech.phase = (mech.phase + 1) % PHASE_COUNT;

  if (mech.phase === PHASE_SURGE) {
    widenRiver(game);
  } else if (mech.phase === PHASE_SHIFT) {
    clearCurrentTerrain(game);
    generateRiver(game);
  }

  // Repaint terrain for current phase
  clearCurrentTerrain(game);
  if (mech.phase !== PHASE_SHIFT) {
    paintCurrentTerrain(game);
  }
  // Shift immediately transitions to telegraph of new river
  if (mech.phase === PHASE_SHIFT) {
    mech.phase = PHASE_TELEGRAPH;
    paintCurrentTerrain(game);
  }

  mech.contactApplied = false;
}

/**
 * Applies current drift after snake.step(). Moves the snake head along
 * the flow direction if standing on a current cell during flow/surge phase.
 *
 * @param {import('../game/index.js').Game} game
 */
export function applyCurrentDrift(game) {
  const mech = game.mechanic;
  if (!mech || mech.type !== 'currents') {
    return;
  }
  if (mech.phase !== PHASE_FLOW && mech.phase !== PHASE_SURGE) {
    return;
  }

  const snake = game.snake;
  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];

  // Find if head is on a current cell
  const cell = mech.cells.find((c) => c.x === hx && c.y === hy);
  if (!cell) {
    mech.contactApplied = false;
    return;
  }

  if (mech.contactApplied) {
    return;
  }
  mech.contactApplied = true;

  // Apply drift: bonus move(s) in flow direction
  const steps = mech.phase === PHASE_SURGE ? 2 : 1;
  const board = game.board;

  for (let i = 0; i < steps; i++) {
    const cx = snake.snakeX[snake.headIndex];
    const cy = snake.snakeY[snake.headIndex];
    let nx = cx + cell.flowDx;
    let ny = cy + cell.flowDy;

    // Wrap
    if (nx < 0) nx = board.width - 1;
    else if (nx >= board.width) nx = 0;
    if (ny < 0) ny = board.height - 1;
    else if (ny >= board.height) ny = 0;

    // Absorb drift if it would hit a wall or self
    if (board.isWallCell(nx, ny)) {
      return;
    }
    if (board.isSnakeCell(nx, ny)) {
      return;
    }

    // Apply the bonus move — advance head, remove tail
    const headIdx = (snake.headIndex + 1) % snake.constructor.MAX_CELLS;
    snake.snakeX[headIdx] = nx;
    snake.snakeY[headIdx] = ny;
    board.setCell('snake', nx, ny);

    // Remove tail to keep length constant
    const tailX = snake.snakeX[snake.tailIndex];
    const tailY = snake.snakeY[snake.tailIndex];
    board.clearCell('snake', tailX, tailY);
    snake.tailIndex = (snake.tailIndex + 1) % snake.constructor.MAX_CELLS;
    snake.headIndex = headIdx;
  }
}

// ── Internal helpers ──────────────────────────────────────────────

function generateRiver(game) {
  const board = game.board;
  const w = board.width;
  const h = board.height;
  const mech = game.mechanic;

  // Seed noise from game state
  const seed = Date.now() ^ (game.boardIndex * 3571);
  const perm = createPermTable(seed);

  // Pick random axis and flow direction
  const axis = Math.random() < 0.5 ? 0 : 1;
  const flowDx = axis === 0 ? 1 : 0;
  const flowDy = axis === 1 ? 1 : 0;

  // Lateral parameters
  const startLateral = axis === 0 ? Math.floor(Math.random() * h) : Math.floor(Math.random() * w);
  const maxSteps = axis === 0 ? w : h;
  const lateralSize = axis === 0 ? h : w;
  const amplitude = lateralSize * 0.4;

  // Walk along the river, sampling noise for lateral offset
  const cells = [];
  const visited = new Set();

  for (let step = 0; step < maxSteps; step++) {
    // Sample noise at this position along the river for lateral offset
    const n = fbm2(step * 0.15, seed * 0.017, 3, 2.0, 0.5, perm);
    const lateral = Math.round(startLateral + n * amplitude);

    let x, y;
    if (axis === 0) {
      x = step;
      y = Math.max(0, Math.min(h - 1, lateral));
    } else {
      x = Math.max(0, Math.min(w - 1, lateral));
      y = step;
    }

    const key = x + ',' + y;
    if (!visited.has(key) && !board.isWallCell(x, y) && !board.isSnakeCell(x, y)) {
      visited.add(key);
      cells.push({ x, y, flowDx, flowDy });
    }

    // Fill gaps: if lateral shifted by >1 from previous step,
    // fill intermediate cells so the river stays connected
    if (step > 0) {
      const prevN = fbm2((step - 1) * 0.15, seed * 0.017, 3, 2.0, 0.5, perm);
      const prevLateral = Math.round(startLateral + prevN * amplitude);
      const diff = lateral - prevLateral;
      if (Math.abs(diff) > 1) {
        const dir = diff > 0 ? 1 : -1;
        for (let l = prevLateral + dir; l !== lateral; l += dir) {
          let fx, fy;
          if (axis === 0) {
            fx = step;
            fy = Math.max(0, Math.min(h - 1, l));
          } else {
            fx = Math.max(0, Math.min(w - 1, l));
            fy = step;
          }
          const fkey = fx + ',' + fy;
          if (!visited.has(fkey) && !board.isWallCell(fx, fy) && !board.isSnakeCell(fx, fy)) {
            visited.add(fkey);
            cells.push({ x: fx, y: fy, flowDx, flowDy });
          }
        }
      }
    }
  }

  mech.cells = cells;
}

function widenRiver(game) {
  const board = game.board;
  const mech = game.mechanic;
  const existing = new Set(mech.cells.map((c) => c.x + ',' + c.y));
  const added = [];

  for (const cell of mech.cells) {
    // Add perpendicular neighbors
    const perps =
      cell.flowDx !== 0
        ? [
            { x: cell.x, y: cell.y - 1 },
            { x: cell.x, y: cell.y + 1 },
          ]
        : [
            { x: cell.x - 1, y: cell.y },
            { x: cell.x + 1, y: cell.y },
          ];

    for (const p of perps) {
      let px = p.x;
      let py = p.y;
      if (px < 0) px = board.width - 1;
      else if (px >= board.width) px = 0;
      if (py < 0) py = board.height - 1;
      else if (py >= board.height) py = 0;

      const key = px + ',' + py;
      if (existing.has(key)) continue;
      if (board.isWallCell(px, py)) continue;
      if (board.isSnakeCell(px, py)) continue;
      existing.add(key);
      added.push({ x: px, y: py, flowDx: cell.flowDx, flowDy: cell.flowDy });
    }
  }

  mech.cells.push(...added);
}

function paintCurrentTerrain(game) {
  const board = game.board;
  const w = board.width;
  for (const cell of game.mechanic.cells) {
    board.terrain[cell.y * w + cell.x] = TERRAIN_CURRENT;
  }
}

function clearCurrentTerrain(game) {
  const board = game.board;
  const terrain = board.terrain;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === TERRAIN_CURRENT) terrain[i] = TERRAIN_NONE;
  }
}
