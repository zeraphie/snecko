// index.js — CanvasRenderer: constructor, clear, flush + prototype wiring

import { Renderer } from "../renderer.js";
import { BG_LIGHT, BG_DARK, HUD_BG } from "./colors.js";
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
import { drawLoader } from "./loader.js";
import { drawFoxAnim } from "./fox.js";

export class CanvasRenderer extends Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} cellSize
   * @param {number} boardWidth
   * @param {number} boardHeight
   */
  constructor(canvas, cellSize, boardWidth, boardHeight) {
    super();
    this._canvas = canvas;
    this._ctx = canvas.getContext("2d");
    this._cellSize = cellSize;
    this._boardWidth = boardWidth;
    this._boardHeight = boardHeight;
    this._gridW = boardWidth * cellSize;
    this._gridH = boardHeight * cellSize;
    this._hudHeight = 48;

    canvas.width = this._gridW;
    canvas.height = this._gridH + this._hudHeight;
    this._animTime = 0;
  }

  clear() {
    this._animTime = Date.now() / 1000;
    const ctx = this._ctx;
    const cs = this._cellSize;
    for (let y = 0; y < this._boardHeight; y++) {
      for (let x = 0; x < this._boardWidth; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? BG_LIGHT : BG_DARK;
        ctx.fillRect(x * cs, y * cs, cs, cs);
      }
    }
    ctx.fillStyle = HUD_BG;
    ctx.fillRect(0, this._gridH, this._gridW, this._hudHeight);
  }

  flush() {}

  cell(x, y, spec) {
    const cs = this._cellSize;
    const px = x * cs;
    const py = y * cs;
    if (spec.detailed) {
      spec.detailed(this._ctx, px, py, cs);
      return;
    }
    if (spec.color) {
      this._ctx.fillStyle = spec.color;
      this._ctx.fillRect(px, py, cs, cs);
    }
  }
}

// ── Prototype wiring ──────────────────────────────────────────────

CanvasRenderer.prototype.drawHUD = drawHUD;
CanvasRenderer.prototype.drawBossInfo = drawBossInfo;
CanvasRenderer.prototype.drawSurvivalInfo = drawSurvivalInfo;
CanvasRenderer.prototype.drawSoulslikeInfo = drawSoulslikeInfo;
CanvasRenderer.prototype.drawBossIntroOverlay = drawBossIntroOverlay;
CanvasRenderer.prototype.drawYouDiedOverlay = drawYouDiedOverlay;
CanvasRenderer.prototype.drawScreen = drawScreen;
CanvasRenderer.prototype.drawDraftScreen = drawDraftScreen;
CanvasRenderer.prototype.drawContrabandScreen = drawContrabandScreen;
CanvasRenderer.prototype.drawMutationPickerScreen = drawMutationPickerScreen;
CanvasRenderer.prototype.drawTargetingOverlay = drawTargetingOverlay;
CanvasRenderer.prototype.drawWormholeOverlay = drawWormholeOverlay;
CanvasRenderer.prototype.drawLoader = drawLoader;
CanvasRenderer.prototype.drawFoxAnim = drawFoxAnim;
