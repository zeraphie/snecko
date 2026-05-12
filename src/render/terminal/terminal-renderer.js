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

import { CELL_EMPTY } from "../renderer.js";
import { Renderer } from "../renderer.js";
import { ESC_HIDE_CURSOR, ESC_SHOW_CURSOR, RESET } from "./palette.js";
import { drawCell } from "../../core/grid/cell/index.js";
import {
  drawHUD,
  drawBossInfo,
  drawSurvivalInfo,
  drawSoulslikeInfo,
  drawBossIntroOverlay,
  drawYouDiedOverlay,
} from "./hud.js";
import {
  drawScreen,
  drawDraftScreen,
  drawContrabandScreen,
  drawMutationPickerScreen,
} from "./screens.js";
import { drawTargetingOverlay, drawWormholeOverlay } from "./overlays.js";
import { flush } from "./flush.js";
import { drawLoader } from "./loader.js";
import { drawFoxAnim } from "./fox.js";

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
    this._targeting = null;
    this._wormholeOverlay = null;
    this._hudLine = "";
    this._maxHudLen = 0;
    this._screenOverlay = null;
    this._introOverlay = null;
    this._animTime = 0;

    // Buffer holds either an integer cell type (legacy path → resolved
    // via CELL_CHARS at flush) or a pre-formatted ANSI string (new
    // adapter path: `cell()` stamps `glyphColor + glyph + RESET`).
    // flush.js distinguishes by typeof at emit time.
    for (let y = 0; y < boardHeight; y++) {
      this._grid[y] = Array.from({ length: boardWidth }, () => CELL_EMPTY);
    }

    stdout.write(ESC_HIDE_CURSOR);
  }

  // ── Lifecycle ────────────────────────────────────────────────

  clear() {
    this._animTime = Date.now() / 1000;
    // Populate the buffer with the registered EMPTY cell. CELL_EMPTY is
    // no longer in CELL_CHARS — `drawCell` routes through the registry,
    // calls `cell()` here, and stamps the pre-formatted glyph string
    // into each buffer slot. Subsequent draws (walls, snake, etc.)
    // overwrite the slots they cover.
    for (let y = 0; y < this._h; y++) {
      for (let x = 0; x < this._w; x++) {
        drawCell(x, y, CELL_EMPTY);
      }
    }
    this._targeting = null;
    this._wormholeOverlay = null;
    this._hudLine = "";
    this._screenOverlay = null;
    this._introOverlay = null;
  }

  destroy() {
    this._stdout.write(ESC_SHOW_CURSOR);
  }

  // ── Cell drawing ─────────────────────────────────────────────

  cell(x, y, spec) {
    // Stamp pre-formatted string into the buffer. flush.js emits
    // strings directly — animation lives in the cell file's render
    // method (animation = state-machine cell-type changes + per-frame
    // computed glyphColor; no central pulse logic here).
    const fg = spec.glyphColor || "";
    const glyph = spec.glyph || "";
    this._grid[y][x] = fg + glyph + RESET;
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

  drawYouDiedOverlay(causeText) {
    drawYouDiedOverlay(this, causeText);
  }

  drawBossInfo(name, hp, maxHp, phase) {
    drawBossInfo(this, name, hp, maxHp, phase);
  }

  drawSurvivalInfo(name, ticksLeft, totalTicks) {
    drawSurvivalInfo(this, name, ticksLeft, totalTicks);
  }

  drawSoulslikeInfo(snakeHp, snakeHpMax, stamina, staminaMax, bossName, bossHp, bossHpMax) {
    drawSoulslikeInfo(this, snakeHp, snakeHpMax, stamina, staminaMax, bossName, bossHp, bossHpMax);
  }

  drawHUD(
    score,
    actIndex,
    time,
    foodEaten,
    foodRequired,
    passives,
    consumables,
    bites,
    selectedConsumable
  ) {
    drawHUD(
      this,
      score,
      actIndex,
      time,
      foodEaten,
      foodRequired,
      passives,
      consumables,
      bites,
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

  drawMutationPickerScreen(mutationIds, selectedIndex) {
    drawMutationPickerScreen(this, mutationIds, selectedIndex);
  }

  flush() {
    flush(this);
  }

  drawLoader(dots) {
    drawLoader(this, dots);
  }

  drawFoxAnim(game) {
    drawFoxAnim(this, game);
  }
}
