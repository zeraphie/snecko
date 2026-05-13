// render.js — Grid drawing and frame rendering

import { Snake } from "../snake/index.js";
import {
  CELL_WALL,
  CELL_WALL_LOW,
  CELL_WALL_LOW_EDIBLE,
  CELL_WALL_HIGH,
  CELL_FOOD,
  CELL_SNAKE,
  CELL_SNAKE_HEAD,
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
  CELL_WALL_CATACOMB,
  CELL_WALL_CRYSTAL,
  CELL_CRYSTAL_TELEGRAPH,
  CELL_ANCHOR_LOCK,
  CELL_DANGER_TRAIL,
  CELL_ECHO_ZONE,
  CELL_PLAYER_BULLET,
  CELL_EXHAUST,
} from "../../render/renderer.js";
import { drawCell } from "../grid/cell/index.js";
import { setActiveRenderer } from "../../render/active.js";
import { getPlayerCells } from "../boss/player.js";
import {
  TERRAIN_LOW,
  TERRAIN_HIGH,
  TERRAIN_CURRENT,
  TERRAIN_TELEGRAPH,
  TERRAIN_CATACOMB,
  TERRAIN_CRYSTAL,
  TERRAIN_CRYSTAL_TELEGRAPH,
} from "../grid/constants.js";
import { getScreen } from "../../screens/registry.js";
import { STATE_PLAYING, STATE_BOSS } from "./constants.js";

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
 * the player plane at grid.playerX / grid.playerY facing _playerFacing.
 *
 * Draw order (back-to-front):
 *   1. Arena walls
 *   2. Boss body / weak-point cells
 *   3. Projectiles
 *   4. Player plane body cells (CELL_SNAKE)
 *   5. Player tip (drawSnakeHead) — always on top
 *
 * Body cells (indices 1-5) are skipped if they fall outside the grid or on a
 * wall — handles the spawn position near the south wall gracefully.
 */
export function _drawBossArena() {
  const grid = this.grid;

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

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.isWallCell(x, y)) {
        const cellType = lockCellSet.has(lockCellKey(x, y)) ? CELL_ANCHOR_LOCK : CELL_WALL_ARENA;
        drawCell(x, y, cellType);
      }
    }
  }

  // 1b. Algorithm current — telegraph cells render as warning, flow cells
  //     render as per-cell directional arrows so the player can read each
  //     cell's push direction (the river winds, so neighbours can differ).
  for (const mod of this._bossModifiers) {
    if (mod.type !== "algorithm_current") {
      continue;
    }
    for (const cell of mod.cells) {
      if (!grid.isInBounds(cell.x, cell.y) || grid.isWallCell(cell.x, cell.y)) {
        continue;
      }
      let cellType;
      if (mod.state === "telegraph") {
        cellType = CELL_TELEGRAPH;
      } else {
        cellType =
          cell.flowDx === 1
            ? CELL_CURRENT_RIGHT
            : cell.flowDx === -1
              ? CELL_CURRENT_LEFT
              : cell.flowDy === 1
                ? CELL_CURRENT_DOWN
                : CELL_CURRENT_UP;
      }
      drawCell(cell.x, cell.y, cellType);
    }
  }

  // 1c. Danger trail cells
  for (const mod of this._bossModifiers) {
    if (mod.type === "danger_trail" && grid.isInBounds(mod.x, mod.y)) {
      drawCell(mod.x, mod.y, CELL_DANGER_TRAIL);
    }
  }

  // 1d. Echo zone cells
  for (const mod of this._bossModifiers) {
    if (mod.type === "echo_zone" && grid.isInBounds(mod.x, mod.y)) {
      drawCell(mod.x, mod.y, CELL_ECHO_ZONE);
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
      drawCell(cell.x, cell.y, type);
    }
  }

  // 3. Projectiles
  for (const p of this._projectiles) {
    if (grid.isInBounds(p.x, p.y)) {
      drawCell(p.x, p.y, CELL_PROJECTILE);
    }
  }

  // 3b. Player bullets
  for (const pb of this._playerBullets) {
    if (grid.isInBounds(pb.x, pb.y)) {
      drawCell(pb.x, pb.y, CELL_PLAYER_BULLET);
    }
  }

  // 4 & 5. Player plane — use invul cell types during the grace window
  if (grid.playerX >= 0 && grid.playerY >= 0) {
    const dir = this._playerFacing;
    const cells = getPlayerCells(grid.playerX, grid.playerY, dir.dx, dir.dy);
    const invul = this._playerInvulTicks > 0;

    // Exhaust flames below the tail (player always faces up)
    const tailY = grid.playerY + 2;
    const fc = this._playerFireCounter || 0;
    // Primary flame — always visible
    const ey1 = tailY + 1;
    if (grid.isInBounds(grid.playerX, ey1) && !grid.isWallCell(grid.playerX, ey1)) {
      drawCell(grid.playerX, ey1, CELL_EXHAUST);
    }
    // Wing flames — alternate sides
    const wingX = fc % 2 === 0 ? grid.playerX - 1 : grid.playerX + 1;
    if (fc % 3 !== 0 && grid.isInBounds(wingX, ey1) && !grid.isWallCell(wingX, ey1)) {
      drawCell(wingX, ey1, CELL_EXHAUST);
    }
    // Tongue — occasional
    const ey2 = tailY + 2;
    if (fc % 3 === 0 && grid.isInBounds(grid.playerX, ey2) && !grid.isWallCell(grid.playerX, ey2)) {
      drawCell(grid.playerX, ey2, CELL_EXHAUST);
    }

    // Body cells (indices 1-5): skip invalid positions
    for (let i = 1; i < cells.length; i++) {
      const c = cells[i];
      if (grid.isInBounds(c.x, c.y) && !grid.isWallCell(c.x, c.y)) {
        drawCell(c.x, c.y, invul ? CELL_PLAYER_INVUL : CELL_SNAKE);
      }
    }

    // Tip (index 0): directional head, cyan-flickering when invulnerable
    drawCell(grid.playerX, grid.playerY, CELL_SNAKE_HEAD, {
      facing: { dx: dir.dx, dy: dir.dy },
      invul,
    });
  }
}

/** Draws all grid cells (walls, food, terrain, snake, portals) to the renderer. */
export function _drawGrid() {
  const grid = this.grid;
  const ironJawActive = this.upgrades.hasBites("iron_jaw");
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.isWallCell(x, y)) {
        const t = grid.terrain[y * grid.width + x];
        let cell;
        if (t === TERRAIN_LOW) {
          cell = ironJawActive ? CELL_WALL_LOW_EDIBLE : CELL_WALL_LOW;
        } else if (t === TERRAIN_HIGH) {
          cell = CELL_WALL_HIGH;
        } else if (t === TERRAIN_CATACOMB) {
          cell = CELL_WALL_CATACOMB;
        } else if (t === TERRAIN_CRYSTAL) {
          cell = CELL_WALL_CRYSTAL;
        } else {
          cell = CELL_WALL;
        }
        drawCell(x, y, cell);
      } else if (x === grid.foodX && y === grid.foodY) {
        drawCell(x, y, CELL_FOOD);
      } else if (x === grid.bossFoodX && y === grid.bossFoodY) {
        drawCell(x, y, CELL_RED_FOOD);
      } else {
        const t = grid.terrain[y * grid.width + x];
        if (t === TERRAIN_CURRENT) {
          drawCell(x, y, currentCellType(this.mechanic, x, y));
        } else if (t === TERRAIN_TELEGRAPH) {
          drawCell(x, y, CELL_TELEGRAPH);
        } else if (t === TERRAIN_CRYSTAL_TELEGRAPH) {
          drawCell(x, y, CELL_CRYSTAL_TELEGRAPH);
        }
      }
    }
  }

  // Crystal cluster overlay — drawn as one continuous shape per active
  // crystal lifecycle so the cluster reads as "one shape with spikes"
  // rather than per-cell facets. Optional method (canvas only).
  this.renderer?.drawCrystalClusters?.(this);

  const snake = this.snake;
  let idx = snake.tailIndex;
  while (idx !== snake.headIndex) {
    drawCell(snake.snakeX[idx], snake.snakeY[idx], CELL_SNAKE);
    idx = (idx + 1) % Snake.MAX_CELLS;
  }
  drawCell(snake.snakeX[snake.headIndex], snake.snakeY[snake.headIndex], CELL_SNAKE_HEAD, {
    facing: { dx: snake.dirX, dy: snake.dirY },
  });

  // Draw wormhole portals on top
  if (this._wormholeA) {
    drawCell(this._wormholeA.x, this._wormholeA.y, CELL_WORMHOLE_A);
  }
  if (this._wormholeB) {
    drawCell(this._wormholeB.x, this._wormholeB.y, CELL_WORMHOLE_B);
  }
}

/** Renders a complete frame by dispatching to the registered screen for the current state. */
export function renderFrame() {
  const renderer = this.renderer;
  if (!renderer) {
    return;
  }

  // Sync the active renderer so the cell adapter (and any cell file
  // import that touches `activeRenderer`) writes to whatever renderer
  // the game currently has — including test mocks swapped in mid-run.
  setActiveRenderer(renderer);

  const screen = getScreen(this.state);
  if (!screen) {
    return;
  }

  // Fox cutscene overlays the current frame. Terminal stamps glyphs into
  // the cell buffer that flush writes — so for the playing / boss screens
  // (where fox can legitimately fire) we defer flush, stamp the fox, then
  // flush. Canvas works either way since its flush is a no-op, but going
  // through the same path keeps the layering consistent.
  if (this._foxAnim && (this.state === STATE_PLAYING || this.state === STATE_BOSS)) {
    screen.draw(renderer, this, { skipFlush: true });
    renderer.drawFoxAnim?.(this);
    renderer.flush();
  } else {
    screen.draw(renderer, this);
  }
}
