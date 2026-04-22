// terminal-renderer.js — TerminalRenderer class (orchestrator)
//
// Each visual concern lives in its own file under render/terminal/:
//   palette.js   – ANSI escape codes and colour constants
//   chars.js     – cell-type → glyph maps (bright + dim)
//   logo.js      – snake logo (upright + rotated)
//   hud.js       – HUD, boss info, boss intro overlay
//   screens.js   – draft, contraband, generic screens
//   overlays.js  – targeting + wormhole placement
//   flush.js     – frame compositor (writes buffer to stdout)
//   loader.js    – 3×3 dot-grid startup loader

import { CELL_EMPTY, CELL_SNAKE_HEAD } from "../renderer.js";
import { Renderer } from "../renderer.js";
import { ESC_HIDE_CURSOR, ESC_SHOW_CURSOR } from "./palette.js";
import { drawHUD, drawBossInfo, drawBossIntroOverlay } from "./hud.js";
import { drawScreen, drawDraftScreen, drawContrabandScreen } from "./screens.js";
import { drawTargetingOverlay, drawWormholeOverlay } from "./overlays.js";
import { flush } from "./flush.js";
import { drawLoader } from "./loader.js";

/** ANSI terminal renderer for Node.js. Buffers a frame into a string and writes to stdout. */
export class TerminalRenderer extends Renderer {
  /**
   * @param {NodeJS.WriteStream} stdout
   * @param {number} boardWidth
   * @param {number} boardHeight
   */
  constructor(stdout, boardWidth, boardHeight) {
    super();
    this._stdout = stdout;
    this._w = boardWidth;
    this._h = boardHeight;
    this._grid = [];
    this._headDir = { dx: 1, dy: 0 };
    this._headInvul = false;
    this._targeting = null;
    this._wormholeOverlay = null;
    this._headX = -1;
    this._headY = -1;
    this._hudLine = "";
    this._maxHudLen = 0;
    this._screenOverlay = null;
    this._introOverlay = null;
    this._animTime = 0;

    for (let y = 0; y < boardHeight; y++) {
      this._grid[y] = new Uint8Array(boardWidth);
    }

    stdout.write(ESC_HIDE_CURSOR);
  }

  // ── Lifecycle ────────────────────────────────────────────────

  clear() {
    this._animTime = Date.now() / 1000;
    for (let y = 0; y < this._h; y++) {
      this._grid[y].fill(CELL_EMPTY);
    }
    this._targeting = null;
    this._wormholeOverlay = null;
    this._headX = -1;
    this._headY = -1;
    this._headInvul = false;
    this._hudLine = "";
    this._screenOverlay = null;
    this._introOverlay = null;
  }

  destroy() {
    this._stdout.write(ESC_SHOW_CURSOR);
  }

  // ── Cell drawing ─────────────────────────────────────────────

  drawCell(x, y, type) {
    this._grid[y][x] = type;
  }

  drawSnakeHead(x, y, dx, dy) {
    this._grid[y][x] = CELL_SNAKE_HEAD;
    this._headX = x;
    this._headY = y;
    this._headDir.dx = dx;
    this._headDir.dy = dy;
    this._headInvul = false;
  }

  drawSnakeHeadInvul(x, y, dx, dy) {
    this._grid[y][x] = CELL_SNAKE_HEAD;
    this._headX = x;
    this._headY = y;
    this._headDir.dx = dx;
    this._headDir.dy = dy;
    this._headInvul = true;
  }

  // ── Delegated methods ────────────────────────────────────────

  drawTargetingOverlay(cursorX, cursorY, boardW, boardH) {
    drawTargetingOverlay(this, cursorX, cursorY, boardW, boardH);
  }

  drawWormholeOverlay(cursorX, cursorY, phase, portalA, boardW, boardH) {
    drawWormholeOverlay(this, cursorX, cursorY, phase, portalA, boardW, boardH);
  }

  drawBossIntroOverlay(name, ticksLeft, total) {
    drawBossIntroOverlay(this, name, ticksLeft, total);
  }

  drawBossInfo(name, hp, maxHp, phase) {
    drawBossInfo(this, name, hp, maxHp, phase);
  }

  drawHUD(
    score,
    board,
    time,
    level,
    foodEaten,
    foodRequired,
    passives,
    consumables,
    selectedConsumable
  ) {
    drawHUD(
      this,
      score,
      board,
      time,
      level,
      foodEaten,
      foodRequired,
      passives,
      consumables,
      selectedConsumable
    );
  }

  drawScreen(name, lines) {
    drawScreen(this, name, lines);
  }

  drawDraftScreen(choices, mutation, selectedIndex, mutationAccepted) {
    drawDraftScreen(this, choices, mutation, selectedIndex, mutationAccepted);
  }

  drawContrabandScreen(choices, selectedIndex, collected) {
    drawContrabandScreen(this, choices, selectedIndex, collected);
  }

  flush() {
    flush(this);
  }

  drawLoader(dots) {
    drawLoader(this, dots);
  }
}
