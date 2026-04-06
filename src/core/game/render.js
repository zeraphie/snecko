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
} from "../../render/renderer.js";
import { TERRAIN_LOW, TERRAIN_CURRENT, TERRAIN_TELEGRAPH } from "../board/constants.js";
import {
  STATE_DRAFT,
  STATE_START,
  STATE_DEAD,
  STATE_TARGETING,
  STATE_WORMHOLE,
} from "./constants.js";

function currentCellType(mechanic, x, y) {
  if (mechanic && mechanic.type === "currents") {
    const cell = mechanic.cells.find((c) => c.x === x && c.y === y);
    if (cell) {
      if (cell.flowDx === 1) return CELL_CURRENT_RIGHT;
      if (cell.flowDx === -1) return CELL_CURRENT_LEFT;
      if (cell.flowDy === 1) return CELL_CURRENT_DOWN;
      if (cell.flowDy === -1) return CELL_CURRENT_UP;
    }
  }
  return CELL_CURRENT_RIGHT; // fallback
}

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

export function renderFrame() {
  const renderer = this.renderer;
  if (!renderer) return;

  // Draft screen handles its own output (no clear/flush needed)
  if (this.state === STATE_DRAFT) {
    if (renderer.drawDraftScreen) {
      renderer.drawDraftScreen(
        this._draftPool.choices,
        this._draftPool.mutation,
        this._draftSelection,
        this._draftMutationAccepted
      );
    } else {
      renderer.clear();
      renderer.drawScreen("draft", ["L E V E L   U P", "", "Press Enter"]);
      renderer.flush();
    }
    return;
  }

  renderer.clear();

  if (this.state === STATE_START) {
    renderer.drawScreen("start", [
      "S N E C K O",
      "",
      "Arrow keys or WASD to move",
      "",
      "Press Space or Enter to start",
    ]);
    renderer.flush();
    return;
  }

  if (this.state === STATE_DEAD) {
    const cause = this.snake.deathCause || "unknown";
    renderer.drawScreen("dead", [
      "G A M E   O V E R",
      "",
      "Cause: " + cause,
      "Score: " + this.score,
      "Level: " + this.level,
      "Time: " + this.constructor.formatTime(this.runTime),
      "",
      "Press Space or Enter to restart",
    ]);
    renderer.flush();
    return;
  }

  this._drawBoard();
  if (this.state === STATE_TARGETING && this._bombCursor && renderer.drawTargetingOverlay) {
    renderer.drawTargetingOverlay(
      this._bombCursor.x,
      this._bombCursor.y,
      this.board.width,
      this.board.height
    );
  }
  if (this.state === STATE_WORMHOLE && this._wormholeCursor && renderer.drawWormholeOverlay) {
    renderer.drawWormholeOverlay(
      this._wormholeCursor.x,
      this._wormholeCursor.y,
      this._wormholePhase,
      this._wormholeA,
      this.board.width,
      this.board.height
    );
  }
  renderer.drawHUD(
    this.score,
    this.boardIndex,
    this.runTime,
    this.level,
    this.foodEaten,
    this.foodRequired,
    this.upgrades.passives,
    this.upgrades.consumables,
    this._selectedConsumable
  );
  renderer.flush();
}
