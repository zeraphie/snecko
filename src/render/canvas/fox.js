// fox.js — Canvas overlay for the fox cutscene.
//
// Phase/position math lives in `core/animation/fox-phase.js`; this file
// is only responsible for getting from a cell-space (x, y) + frame name
// to drawn pixels (palette lookup, sub-cell scaling, freeze tint).
//
// Sprite is authored at 16×16 source pixels; each source pixel is drawn
// at half a cell width, so the fox occupies ~8×8 cells on screen — small
// enough to read as "a lil fox visited" rather than dominating the play
// field.

import { FOX_DURATION_MS } from "../../core/upgrades/consumables/fox.js";
import { computeFoxFrame } from "../../core/animation/fox-phase.js";

/**
 * Per-frame canvas overlay. Called from `renderFrame` after the
 * current screen has drawn (with `skipFlush`), so the fox lands on top
 * of grid + HUD.
 *
 * @this {import('./index.js').CanvasRenderer}
 * @param {import('../../core/game/index.js').Game} game
 */
export function drawFoxAnim(game) {
  const anim = game._foxAnim;
  if (!anim) {
    return;
  }
  const animData = game.manifest?.animations?.fox?.canvas;
  if (!animData) {
    return;
  }

  const elapsed = Date.now() - anim.startTime;
  const info = computeFoxFrame(anim, elapsed, FOX_DURATION_MS, this._boardWidth, this._boardHeight);
  const frame = animData.frames[info.frameName];
  if (!frame) {
    return;
  }

  // ── Resolve fox screen position ───────────────────────────────
  const cs = this._cellSize;
  const pixelSize = cs / 2; // each sprite pixel = half a cell
  const foxW = frame.width * pixelSize;
  const foxH = frame.height * pixelSize;
  // Anchor the sprite's centre to the path-driven cell coords.
  const screenX = info.x * cs + cs / 2 - foxW / 2;
  const screenY = info.y * cs + cs / 2 - foxH / 2;

  // ── Light freeze tint over the playfield ─────────────────────
  const ctx = this._ctx;
  ctx.save();
  ctx.fillStyle = "rgba(20, 20, 40, 0.35)";
  ctx.fillRect(0, 0, this._gridW, this._gridH);

  // ── Draw the sprite pixel-by-pixel ───────────────────────────
  const palette = animData.palette ?? {};
  for (let py = 0; py < frame.height; py++) {
    const row = frame.rows[py];
    for (let px = 0; px < frame.width; px++) {
      const ch = row[px];
      const color = palette[ch];
      if (!color) {
        continue;
      }
      ctx.fillStyle = color;
      ctx.fillRect(screenX + px * pixelSize, screenY + py * pixelSize, pixelSize, pixelSize);
    }
  }
  ctx.restore();
}
