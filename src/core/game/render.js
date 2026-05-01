// render.js — Board drawing and frame rendering

import { Snake } from "../snake/index.js";
import {
  CELL_WALL,
  CELL_WALL_LOW,
  CELL_FOOD,
  CELL_SNAKE,
  CELL_CURRENT_RIGHT,
  CELL_CURRENT_LEFT,
  CELL_CURRENT_DOWN,
  CELL_CURRENT_UP,
  CELL_TELEGRAPH,
  CELL_WORMHOLE_A,
  CELL_WORMHOLE_B,
  CELL_RED_FOOD,
  CELL_BOSS_BODY,
  CELL_BOSS_DAMAGED,
  CELL_BOSS_WEAK,
  CELL_PROJECTILE,
  CELL_PLAYER_INVUL,
  CELL_BOSS_HIT,
  CELL_WALL_ARENA,
  CELL_ANCHOR_LOCK,
  CELL_DANGER_TRAIL,
  CELL_ECHO_ZONE,
  CELL_PLAYER_BULLET,
  CELL_EXHAUST,
} from "../../render/renderer.js";
import { getPlayerCells } from "../boss/player.js";
import { TERRAIN_LOW, TERRAIN_CURRENT, TERRAIN_TELEGRAPH } from "../board/constants.js";
import { getScreen } from "../../screens/registry.js";

// ── Helpers ────────────────────────────────────────────

function currentCellType(mechanic, x, y) {
  if (mechanic && mechanic.type === "currents") {
    const cell = mechanic.cells.find((c) => c.x === x && c.y === y);

    if (cell) {
      if (cell.flowDx === 1) {
        return CELL_CURRENT_RIGHT;
      }
      if (cell.flowDx === -1) {
        return CELL_CURRENT_LEFT;
      }
      if (cell.flowDy === 1) {
        return CELL_CURRENT_DOWN;
      }
      if (cell.flowDy === -1) {
        return CELL_CURRENT_UP;
      }
    }
  }
  return CELL_CURRENT_RIGHT; // fallback
}

// ── Public API ─────────────────────────────────────────

/**
 * Draws the boss arena: arena walls, boss body/weak cells, projectiles, and
 * the player plane at board.playerX / board.playerY facing _playerFacing.
 *
 * Draw order (back-to-front):
 *   1. Arena walls
 *   2. Boss body / weak-point cells
 *   3. Projectiles
 *   4. Player plane body cells (CELL_SNAKE)
 *   5. Player tip (drawSnakeHead) — always on top
 *
 * Body cells (indices 1-5) are skipped if they fall outside the board or on a
 * wall — handles the spawn position near the south wall gracefully.
 */
export function _drawBossArena() {
  const renderer = this.renderer;
  const board = this.board;

  // 1. Arena walls — anchor-lock cells (tracked in _bossModifiers) render as
  //    CELL_ANCHOR_LOCK (amber) instead of CELL_WALL_ARENA so the player can
  //    tell them apart and know they're temporary and clearable.
  const lockCellKey = (x, y) => `${x},${y}`;
  const lockCellSet = new Set();
  for (const mod of this._bossModifiers) {
    if (mod.type === "anchor_lock") {
      for (const c of mod.cells) {
        lockCellSet.add(lockCellKey(c.x, c.y));
      }
    }
  }

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.isWallCell(x, y)) {
        const cellType = lockCellSet.has(lockCellKey(x, y)) ? CELL_ANCHOR_LOCK : CELL_WALL_ARENA;
        renderer.drawCell(x, y, cellType);
      }
    }
  }

  // 1b. Sovereign current zones — draw as directional current arrows so the
  //     player can read the push direction at a glance.
  for (const mod of this._bossModifiers) {
    if (mod.type !== "sovereign_current") {
      continue;
    }
    const cellType =
      mod.dx === 1
        ? CELL_CURRENT_RIGHT
        : mod.dx === -1
          ? CELL_CURRENT_LEFT
          : mod.dy === 1
            ? CELL_CURRENT_DOWN
            : CELL_CURRENT_UP;
    for (const cell of mod.cells) {
      if (board.isInBounds(cell.x, cell.y) && !board.isWallCell(cell.x, cell.y)) {
        renderer.drawCell(cell.x, cell.y, cellType);
      }
    }
  }

  // 1c. Danger trail cells
  for (const mod of this._bossModifiers) {
    if (mod.type === "danger_trail" && board.isInBounds(mod.x, mod.y)) {
      renderer.drawCell(mod.x, mod.y, CELL_DANGER_TRAIL);
    }
  }

  // 1d. Echo zone cells
  for (const mod of this._bossModifiers) {
    if (mod.type === "echo_zone" && board.isInBounds(mod.x, mod.y)) {
      renderer.drawCell(mod.x, mod.y, CELL_ECHO_ZONE);
    }
  }

  // 2. Boss body cells — flash CELL_BOSS_HIT on weak hit (stagger) or per-cell
  //    body hit. Weak cell joins the body flash so a successful weak hit reads
  //    as a clear strike on the whole boss.
  if (this._boss) {
    const staggered = this._boss._staggerTicks > 0;
    for (const cell of this._boss.getCells()) {
      const cellFlashing = this._boss._cellFlashTicks[cell._shapeIdx] > 0;
      let type;
      if (cell.weak) {
        type = staggered ? CELL_BOSS_HIT : CELL_BOSS_WEAK;
      } else if (staggered || cellFlashing) {
        type = CELL_BOSS_HIT;
      } else if (cell.hp < this._boss._bodyHp) {
        type = CELL_BOSS_DAMAGED;
      } else {
        type = CELL_BOSS_BODY;
      }
      renderer.drawCell(cell.x, cell.y, type);
    }
  }

  // 3. Projectiles
  for (const p of this._projectiles) {
    if (board.isInBounds(p.x, p.y)) {
      renderer.drawCell(p.x, p.y, CELL_PROJECTILE);
    }
  }

  // 3b. Player bullets
  for (const pb of this._playerBullets) {
    if (board.isInBounds(pb.x, pb.y)) {
      renderer.drawCell(pb.x, pb.y, CELL_PLAYER_BULLET);
    }
  }

  // 4 & 5. Player plane — use invul cell types during the grace window
  if (board.playerX >= 0 && board.playerY >= 0) {
    const dir = this._playerFacing;
    const cells = getPlayerCells(board.playerX, board.playerY, dir.dx, dir.dy);
    const invul = this._playerInvulTicks > 0;

    // Exhaust flames below the tail (player always faces up)
    const tailY = board.playerY + 2;
    const fc = this._playerFireCounter || 0;
    // Primary flame — always visible
    const ey1 = tailY + 1;
    if (board.isInBounds(board.playerX, ey1) && !board.isWallCell(board.playerX, ey1)) {
      renderer.drawCell(board.playerX, ey1, CELL_EXHAUST);
    }
    // Wing flames — alternate sides
    const wingX = fc % 2 === 0 ? board.playerX - 1 : board.playerX + 1;
    if (fc % 3 !== 0 && board.isInBounds(wingX, ey1) && !board.isWallCell(wingX, ey1)) {
      renderer.drawCell(wingX, ey1, CELL_EXHAUST);
    }
    // Tongue — occasional
    const ey2 = tailY + 2;
    if (
      fc % 3 === 0 &&
      board.isInBounds(board.playerX, ey2) &&
      !board.isWallCell(board.playerX, ey2)
    ) {
      renderer.drawCell(board.playerX, ey2, CELL_EXHAUST);
    }

    // Body cells (indices 1-5): skip invalid positions
    for (let i = 1; i < cells.length; i++) {
      const c = cells[i];
      if (board.isInBounds(c.x, c.y) && !board.isWallCell(c.x, c.y)) {
        renderer.drawCell(c.x, c.y, invul ? CELL_PLAYER_INVUL : CELL_SNAKE);
      }
    }

    // Tip (index 0): directional head, cyan-flickering when invulnerable
    if (invul) {
      renderer.drawSnakeHeadInvul(board.playerX, board.playerY, dir.dx, dir.dy);
    } else {
      renderer.drawSnakeHead(board.playerX, board.playerY, dir.dx, dir.dy);
    }
  }
}

/** Draws all board cells (walls, food, terrain, snake, portals) to the renderer. */
export function _drawBoard() {
  const renderer = this.renderer;
  const board = this.board;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.isWallCell(x, y)) {
        const t = board.terrain[y * board.width + x];
        renderer.drawCell(x, y, t === TERRAIN_LOW ? CELL_WALL_LOW : CELL_WALL);
      } else if (x === board.foodX && y === board.foodY) {
        renderer.drawCell(x, y, CELL_FOOD);
      } else if (x === board.bossFoodX && y === board.bossFoodY) {
        renderer.drawCell(x, y, CELL_RED_FOOD);
      } else {
        const t = board.terrain[y * board.width + x];
        if (t === TERRAIN_CURRENT) {
          renderer.drawCell(x, y, currentCellType(this.mechanic, x, y));
        } else if (t === TERRAIN_TELEGRAPH) {
          renderer.drawCell(x, y, CELL_TELEGRAPH);
        }
      }
    }
  }

  const snake = this.snake;
  let idx = snake.tailIndex;
  while (idx !== snake.headIndex) {
    renderer.drawCell(snake.snakeX[idx], snake.snakeY[idx], CELL_SNAKE);
    idx = (idx + 1) % Snake.MAX_CELLS;
  }
  renderer.drawSnakeHead(
    snake.snakeX[snake.headIndex],
    snake.snakeY[snake.headIndex],
    snake.dirX,
    snake.dirY
  );

  // Draw wormhole portals on top
  if (this._wormholeA) {
    renderer.drawCell(this._wormholeA.x, this._wormholeA.y, CELL_WORMHOLE_A);
  }
  if (this._wormholeB) {
    renderer.drawCell(this._wormholeB.x, this._wormholeB.y, CELL_WORMHOLE_B);
  }
}

/** Renders a complete frame by dispatching to the registered screen for the current state. */
export function renderFrame() {
  const renderer = this.renderer;
  if (!renderer) {
    return;
  }

  const screen = getScreen(this.state);
  if (screen) {
    screen.draw(renderer, this);
  }
}
