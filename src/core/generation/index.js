// generation.js — Board generation: influence map, shape placement, food

import { Snake } from "../snake/index.js";
import { buildCrystals, canPlaceStage, placeStage } from "./crystalline/crystals.js";
import { initLattice, advanceLattice } from "../mechanics/lattice.js";
import { TERRAIN_TELEGRAPH, TERRAIN_CURRENT } from "../board/constants.js";

const CRYSTALS = buildCrystals();
const SPAWN_BUFFER = 3;
const INFLUENCE_ATTRACTORS = 4;
const PLACEMENT_CANDIDATES = 60;
const RESERVE_AHEAD = 3;
const RESERVE_RADIUS = 2;

// ── Reserve zone helpers ──────────────────────────────────────────

export function buildReservedSpawnZone(board, spawnX, spawnY, snakeLength, dx, dy) {
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
  if (dx > 0) maxX += ahead;
  else if (dx < 0) minX -= ahead;
  if (dy > 0) maxY += ahead;
  else if (dy < 0) minY -= ahead;

  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(board.width - 1, maxX);
  maxY = Math.min(board.height - 1, maxY);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      board.setCell("reserved", x, y);
    }
  }
}

export function buildReservedAroundSnake(board, snake) {
  const w = board.width;
  const h = board.height;

  let idx = snake.tailIndex;
  while (true) {
    const sx = snake.snakeX[idx];
    const sy = snake.snakeY[idx];
    for (let dy = -RESERVE_RADIUS; dy <= RESERVE_RADIUS; dy++) {
      for (let dx = -RESERVE_RADIUS; dx <= RESERVE_RADIUS; dx++) {
        const rx = sx + dx;
        const ry = sy + dy;
        if (rx >= 0 && rx < w && ry >= 0 && ry < h) {
          board.setCell("reserved", rx, ry);
        }
      }
    }
    if (idx === snake.headIndex) break;
    idx = (idx + 1) % Snake.MAX_CELLS;
  }

  const hx = snake.snakeX[snake.headIndex];
  const hy = snake.snakeY[snake.headIndex];
  for (let i = 1; i <= RESERVE_AHEAD; i++) {
    const ax = hx + snake.dirX * i;
    const ay = hy + snake.dirY * i;
    if (ax >= 0 && ax < w && ay >= 0 && ay < h) {
      board.setCell("reserved", ax, ay);
    }
  }
}

// ── Influence map ─────────────────────────────────────────────────

export function generateInfluenceMap(board) {
  const w = board.width;
  const h = board.height;
  const map = new Float32Array(w * h);

  for (let a = 0; a < INFLUENCE_ATTRACTORS; a++) {
    const ax = Math.random() * w;
    const ay = Math.random() * h;
    const strength = 0.5 + Math.random() * 0.5;
    const radius = Math.max(w, h) * (0.3 + Math.random() * 0.3);

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
    if (map[i] > max) max = map[i];
  }
  if (max > 0) {
    for (let i = 0; i < map.length; i++) {
      map[i] /= max;
    }
  }

  return map;
}

// ── Shape placement ───────────────────────────────────────────────

export function scoreShapePlacement(board, influenceMap, shape, x, y, refX, refY) {
  const w = board.width;
  let totalInfluence = 0;
  let cellCount = 0;

  for (let row = 0; row < shape.height; row++) {
    const rowMask = shape.solidRows[row];
    for (let col = 0; col < shape.width; col++) {
      if (!(rowMask & (1 << col))) continue;
      totalInfluence += influenceMap[(y + row) * w + (x + col)];
      cellCount++;
    }
  }

  const avgInfluence = cellCount > 0 ? totalInfluence / cellCount : 0;

  const cx = x + shape.width / 2;
  const cy = y + shape.height / 2;
  const dist = Math.sqrt((cx - refX) * (cx - refX) + (cy - refY) * (cy - refY));
  const maxDist = Math.sqrt(w * w + board.height * board.height);
  const distBonus = (dist / maxDist) * 0.3;

  return avgInfluence + distBonus;
}

export function findBestPlacement(board, influenceMap, shape, refX, refY) {
  let bestScore = -1;
  let bestX = -1;
  let bestY = -1;

  for (let i = 0; i < PLACEMENT_CANDIDATES; i++) {
    const x = Math.floor(Math.random() * board.width);
    const y = Math.floor(Math.random() * board.height);

    if (!canPlaceStage(board, shape, x, y)) continue;

    const score = scoreShapePlacement(board, influenceMap, shape, x, y, refX, refY);
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
      bestY = y;
    }
  }

  if (bestScore < 0) return null;
  return { x: bestX, y: bestY, score: bestScore };
}

export function pickShapesForBoard(boardIndex) {
  let count;
  if (boardIndex <= 3) count = 1;
  else if (boardIndex <= 8) count = 2;
  else count = 3 + Math.floor((boardIndex - 9) / 4);

  const shapes = [];
  for (let i = 0; i < count; i++) {
    const crystalIdx = Math.floor(Math.random() * CRYSTALS.length);
    const crystal = CRYSTALS[crystalIdx];
    // Use stage 1 (index 0) for initial placement
    const stage0 = crystal.stages[0];
    const rotIdx = Math.floor(Math.random() * stage0.rotations.length);
    shapes.push(stage0.rotations[rotIdx]);
  }
  return shapes;
}

// ── Food placement ────────────────────────────────────────────────

function isFoodBlocked(board, x, y) {
  if (board.isBlockedCell(x, y)) return true;
  const t = board.terrain[y * board.width + x];
  return t === TERRAIN_TELEGRAPH || t === TERRAIN_CURRENT;
}

export function placeFood(board) {
  for (let attempts = 0; attempts < 200; attempts++) {
    const x = Math.floor(Math.random() * board.width);
    const y = Math.floor(Math.random() * board.height);
    if (!isFoodBlocked(board, x, y)) {
      board.foodX = x;
      board.foodY = y;
      return;
    }
  }
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (!isFoodBlocked(board, x, y)) {
        board.foodX = x;
        board.foodY = y;
        return;
      }
    }
  }
}

// ── Board generation ──────────────────────────────────────────────

export function generateBoard(game) {
  const board = game.board;

  board.clearMasks("wall");
  board.clearMasks("snake");
  board.clearMasks("reserved");
  board.terrain.fill(0);

  const spawnX = Math.floor(board.width / 2);
  const spawnY = Math.floor(board.height / 2);
  const dx = 1;
  const dy = 0;

  const snakeLen = game.snake.snakeLength > 0 ? game.snake.snakeLength : 3;

  buildReservedSpawnZone(board, spawnX, spawnY, snakeLen, dx, dy);

  const influenceMap = generateInfluenceMap(board);

  const shapes = pickShapesForBoard(game.boardIndex);
  for (let i = 0; i < shapes.length; i++) {
    const placement = findBestPlacement(board, influenceMap, shapes[i], spawnX, spawnY);
    if (placement) {
      placeStage(board, shapes[i], placement.x, placement.y);
    }
  }

  board.clearMasks("reserved");

  game.snake.init(board, spawnX, spawnY, snakeLen, dx, dy);

  placeFood(board);

  initLattice(game);
}

export function advanceBoard(game) {
  const board = game.board;

  advanceLattice(game);

  placeFood(board);
}
