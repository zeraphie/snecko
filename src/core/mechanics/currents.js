// currents.js — Wildlands mechanic: FBM-based winding rivers

import { generateRiver } from "../generation/wildlands/river.js";
import { TERRAIN_CURRENT, TERRAIN_NONE } from "../grid/constants.js";
import { mixSeeds, splitmix32 } from "../rng.js";
import { SUBSEED_CURRENTS } from "../seed-streams.js";

const STATE_TELEGRAPH = 0;
const STATE_FLOW = 1;
const STATE_SURGE = 2;
const STATE_SHIFT = 3;
const STATE_COUNT = 4;

// ── Public API ────────────────────────────────────────────────────

/**
 * Initialises the currents mechanic on a freshly generated wildlands grid.
 *
 * @param {import('../game/index.js').Game} game
 */
export function initCurrents(game) {
  game.mechanic = {
    type: "currents",
    state: STATE_TELEGRAPH,
    cells: [],
    contactApplied: false,
  };
  generateWildlandsRiver(game);
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
  if (!mech || mech.type !== "currents") {
    return;
  }

  mech.state = (mech.state + 1) % STATE_COUNT;

  if (mech.state === STATE_SURGE) {
    widenRiver(game);
  } else if (mech.state === STATE_SHIFT) {
    clearCurrentTerrain(game);
    generateWildlandsRiver(game);
  }

  // Repaint terrain for current phase
  clearCurrentTerrain(game);
  if (mech.state !== STATE_SHIFT) {
    paintCurrentTerrain(game);
  }
  // Shift immediately transitions to telegraph of new river
  if (mech.state === STATE_SHIFT) {
    mech.state = STATE_TELEGRAPH;
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
  if (!mech || mech.type !== "currents") {
    return;
  }
  if (mech.state !== STATE_FLOW && mech.state !== STATE_SURGE) {
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
  const steps = mech.state === STATE_SURGE ? 2 : 1;
  const grid = game.grid;

  for (let i = 0; i < steps; i++) {
    const cx = snake.snakeX[snake.headIndex];
    const cy = snake.snakeY[snake.headIndex];
    let nx = cx + cell.flowDx;
    let ny = cy + cell.flowDy;

    // Wrap
    if (nx < 0) {
      nx = grid.width - 1;
    } else if (nx >= grid.width) {
      nx = 0;
    }
    if (ny < 0) {
      ny = grid.height - 1;
    } else if (ny >= grid.height) {
      ny = 0;
    }

    // Absorb drift if it would hit a wall or self
    if (grid.isWallCell(nx, ny)) {
      return;
    }
    if (grid.isSnakeCell(nx, ny)) {
      return;
    }

    // Apply the bonus move — advance head, remove tail
    const headIdx = (snake.headIndex + 1) % snake.constructor.MAX_CELLS;
    snake.snakeX[headIdx] = nx;
    snake.snakeY[headIdx] = ny;
    grid.setCell("snake", nx, ny);

    // Remove tail to keep length constant
    const tailX = snake.snakeX[snake.tailIndex];
    const tailY = snake.snakeY[snake.tailIndex];
    grid.clearCell("snake", tailX, tailY);
    snake.tailIndex = (snake.tailIndex + 1) % snake.constructor.MAX_CELLS;
    snake.headIndex = headIdx;
  }
}

// ── Internal helpers ──────────────────────────────────────────────

function generateWildlandsRiver(game) {
  const grid = game.grid;
  const mech = game.mechanic;

  // Seed noise + axis/lateral picks from the act seed so two runs at
  // the same act produce identical rivers.
  const seed = mixSeeds(game.actSeed, SUBSEED_CURRENTS);
  const rand = splitmix32(seed);
  const axis = rand() < 0.5 ? 0 : 1;

  mech.cells = generateRiver({ grid, axis, seed, rand });
}

function widenRiver(game) {
  const grid = game.grid;
  const mech = game.mechanic;
  const existing = new Set(mech.cells.map((c) => c.x + "," + c.y));
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
      if (px < 0) {
        px = grid.width - 1;
      } else if (px >= grid.width) {
        px = 0;
      }
      if (py < 0) {
        py = grid.height - 1;
      } else if (py >= grid.height) {
        py = 0;
      }

      const key = px + "," + py;
      if (existing.has(key)) {
        continue;
      }
      if (grid.isWallCell(px, py)) {
        continue;
      }
      if (grid.isSnakeCell(px, py)) {
        continue;
      }
      existing.add(key);
      added.push({ x: px, y: py, flowDx: cell.flowDx, flowDy: cell.flowDy });
    }
  }

  mech.cells.push(...added);
}

function paintCurrentTerrain(game) {
  const grid = game.grid;
  const w = grid.width;
  for (const cell of game.mechanic.cells) {
    grid.terrain[cell.y * w + cell.x] = TERRAIN_CURRENT;
  }
}

function clearCurrentTerrain(game) {
  const grid = game.grid;
  const terrain = grid.terrain;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === TERRAIN_CURRENT) {
      terrain[i] = TERRAIN_NONE;
    }
  }
}
