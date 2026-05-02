// generator.js — Wildlands terrain generation using FBM noise

import { createPermTable, fbm2 } from "./noise.js";
import { bfsReachable } from "../common/solvability.js";
import { TERRAIN_NONE, TERRAIN_LOW, TERRAIN_HIGH, TERRAIN_CURRENT } from "../../grid/constants.js";
import { initCurrents, advanceCurrents } from "../../mechanics/currents.js";

const SPAWN_CLEAR_RADIUS = 4;
const LOW_THRESHOLD = 0.15; // fbm > this → low wall
const HIGH_THRESHOLD = 0.45; // fbm > this → high wall
const OCTAVES = 4;
const LACUNARITY = 2.0;
const PERSISTENCE = 0.5;
const SCALE = 0.18; // controls feature size relative to grid

/**
 * Generates a wildlands grid using FBM noise terrain with low/high walls.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function generateWildlandsGrid(game) {
  const grid = game.grid;
  const w = grid.width;
  const h = grid.height;

  grid.clearMasks("wall");
  grid.clearMasks("snake");
  grid.clearMasks("reserved");
  grid.terrain.fill(TERRAIN_NONE);

  const seed = Date.now() ^ (game.actIndex * 7919);
  const perm = createPermTable(seed);

  const spawnX = Math.floor(w / 2);
  const spawnY = Math.floor(h / 2);

  // Generate terrain from FBM
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Clear zone around spawn
      const dx = x - spawnX;
      const dy = y - spawnY;
      if (Math.abs(dx) <= SPAWN_CLEAR_RADIUS && Math.abs(dy) <= SPAWN_CLEAR_RADIUS) {
        continue;
      }

      const n = fbm2(x * SCALE, y * SCALE, OCTAVES, LACUNARITY, PERSISTENCE, perm);

      if (n > HIGH_THRESHOLD) {
        grid.setCell("wall", x, y);
        grid.terrain[y * w + x] = TERRAIN_HIGH;
      } else if (n > LOW_THRESHOLD) {
        grid.setCell("wall", x, y);
        grid.terrain[y * w + x] = TERRAIN_LOW;
      }
    }
  }

  // Init snake
  const snakeLen = game.snake.snakeLength > 0 ? game.snake.snakeLength : 3;
  game.snake.init(grid, spawnX, spawnY, snakeLen, 1, 0);

  // Place food with solvability check
  placeWildlandsFood(grid, spawnX, spawnY);

  // Initialize currents mechanic
  initCurrents(game);
}

/**
 * Advances the wildlands grid (currents phase + food placement).
 *
 * @param {import('../../game/index.js').Game} game
 */
export function advanceWildlandsGrid(game) {
  // Advance currents phase
  advanceCurrents(game);

  // Place new food (avoid current cells)
  const snake = game.snake;
  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];
  placeWildlandsFood(game.grid, hx, hy);
}

function placeWildlandsFood(grid, fromX, fromY) {
  // Try random positions, verify reachable via BFS
  for (let attempts = 0; attempts < 200; attempts++) {
    const x = Math.floor(Math.random() * grid.width);
    const y = Math.floor(Math.random() * grid.height);
    if (grid.isBlockedCell(x, y)) {
      continue;
    }
    if (grid.terrain[y * grid.width + x] === TERRAIN_CURRENT) {
      continue;
    }
    if (bfsReachable(grid, fromX, fromY, x, y)) {
      grid.foodX = x;
      grid.foodY = y;
      return;
    }
  }
  // Fallback: scan all cells
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.isBlockedCell(x, y)) {
        continue;
      }
      if (grid.terrain[y * grid.width + x] === TERRAIN_CURRENT) {
        continue;
      }
      if (bfsReachable(grid, fromX, fromY, x, y)) {
        grid.foodX = x;
        grid.foodY = y;
        return;
      }
    }
  }
}
