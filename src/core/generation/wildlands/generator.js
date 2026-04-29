// generator.js — Wildlands terrain generation using FBM noise

import { createPermTable, fbm2 } from "./noise.js";
import { bfsReachable } from "../common/solvability.js";
import { TERRAIN_NONE, TERRAIN_LOW, TERRAIN_HIGH, TERRAIN_CURRENT } from "../../board/constants.js";
import { initCurrents, advanceCurrents } from "../../mechanics/currents.js";

const SPAWN_CLEAR_RADIUS = 4;
const LOW_THRESHOLD = 0.15; // fbm > this → low wall
const HIGH_THRESHOLD = 0.45; // fbm > this → high wall
const OCTAVES = 4;
const LACUNARITY = 2.0;
const PERSISTENCE = 0.5;
const SCALE = 0.18; // controls feature size relative to board

/**
 * Generates a wildlands board using FBM noise terrain with low/high walls.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function generateWildlandsBoard(game) {
  const board = game.board;
  const w = board.width;
  const h = board.height;

  board.clearMasks("wall");
  board.clearMasks("snake");
  board.clearMasks("reserved");
  board.terrain.fill(TERRAIN_NONE);

  const seed = Date.now() ^ (game.boardIndex * 7919);
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
        board.setCell("wall", x, y);
        board.terrain[y * w + x] = TERRAIN_HIGH;
      } else if (n > LOW_THRESHOLD) {
        board.setCell("wall", x, y);
        board.terrain[y * w + x] = TERRAIN_LOW;
      }
    }
  }

  // Init snake
  const snakeLen = game.snake.snakeLength > 0 ? game.snake.snakeLength : 3;
  game.snake.init(board, spawnX, spawnY, snakeLen, 1, 0);

  // Place food with solvability check
  placeWildlandsFood(board, spawnX, spawnY);

  // Initialize currents mechanic
  initCurrents(game);
}

/**
 * Advances the wildlands board (currents phase + food placement).
 *
 * @param {import('../../game/index.js').Game} game
 */
export function advanceWildlandsBoard(game) {
  // Advance currents phase
  advanceCurrents(game);

  // Place new food (avoid current cells)
  const snake = game.snake;
  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];
  placeWildlandsFood(game.board, hx, hy);
}

function placeWildlandsFood(board, fromX, fromY) {
  // Try random positions, verify reachable via BFS
  for (let attempts = 0; attempts < 200; attempts++) {
    const x = Math.floor(Math.random() * board.width);
    const y = Math.floor(Math.random() * board.height);
    if (board.isBlockedCell(x, y)) {
      continue;
    }
    if (board.terrain[y * board.width + x] === TERRAIN_CURRENT) {
      continue;
    }
    if (bfsReachable(board, fromX, fromY, x, y)) {
      board.foodX = x;
      board.foodY = y;
      return;
    }
  }
  // Fallback: scan all cells
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.isBlockedCell(x, y)) {
        continue;
      }
      if (board.terrain[y * board.width + x] === TERRAIN_CURRENT) {
        continue;
      }
      if (bfsReachable(board, fromX, fromY, x, y)) {
        board.foodX = x;
        board.foodY = y;
        return;
      }
    }
  }
}
