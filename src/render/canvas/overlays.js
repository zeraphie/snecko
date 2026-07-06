// overlays.js — Canvas targeting and wormhole overlays

import { CELL_WORMHOLE_A } from "../renderer.js";
import { drawCell } from "../../core/grid/cell/index.js";

export function drawTargetingOverlay(cursorX, cursorY, boardW, boardH) {
  const ctx = this._ctx;
  const cs = this._cellSize;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      let bx = cursorX + dx;
      let by = cursorY + dy;
      if (bx < 0) {
        bx += boardW;
      } else if (bx >= boardW) {
        bx -= boardW;
      }
      if (by < 0) {
        by += boardH;
      } else if (by >= boardH) {
        by -= boardH;
      }

      const isCenter = dx === 0 && dy === 0;
      ctx.fillStyle = isCenter ? "rgba(255, 80, 80, 0.6)" : "rgba(255, 80, 80, 0.25)";
      ctx.fillRect(bx * cs, by * cs, cs, cs);
    }
  }

  ctx.strokeStyle = "#ff5050";
  ctx.lineWidth = 2;
  ctx.strokeRect(cursorX * cs, cursorY * cs, cs, cs);
}

/**
 * Brood-placement HUD: replaces the standard HUD during placement.
 * Shows what's being placed, what's next (Tetris-style mini preview),
 * progress count, and control hints.
 *
 * @param {{
 *   activeLabel: string,
 *   nextLabel: string | null,
 *   nextShapeCells: Array<[number, number]>,
 *   placedCount: number,
 *   totalCount: number,
 * }} info
 */
export function drawBroodPlacementHud(info) {
  const ctx = this._ctx;
  const hudY = this._gridH;
  const hudH = this._hudHeight;

  // Two-line text block on the left.
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const next = info.nextLabel ?? "—";
  ctx.fillText(
    `Placing ${info.activeLabel}   Next ${next}   Placed ${info.placedCount}/${info.totalCount}`,
    8,
    hudY + 4
  );
  ctx.font = "11px monospace";
  ctx.fillStyle = "#aaa";
  ctx.fillText(
    "Arrows move   R rotate   Tab next   Enter place   Backspace undo   Esc menu",
    8,
    hudY + 24
  );

  // Tetris-style next-shape preview, right-aligned within the HUD
  // band. Normalises the next shape's cells so the preview sits in
  // a fixed-size box regardless of the shape's anchor.
  if (info.nextShapeCells.length > 0) {
    const box = 6; // 6×6 cell preview grid
    const cell = 5; // 5px per preview cell
    const previewW = box * cell;
    const previewX = this._gridW - previewW - 8;
    const previewY = hudY + (hudH - box * cell) / 2;

    // Frame.
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.strokeRect(previewX, previewY, previewW, box * cell);

    // Centre the shape inside the box by normalising offsets.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [dx, dy] of info.nextShapeCells) {
      if (dx < minX) {
        minX = dx;
      }
      if (dy < minY) {
        minY = dy;
      }
      if (dx > maxX) {
        maxX = dx;
      }
      if (dy > maxY) {
        maxY = dy;
      }
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const offX = Math.floor((box - w) / 2);
    const offY = Math.floor((box - h) / 2);

    ctx.fillStyle = "#3399ff";
    for (const [dx, dy] of info.nextShapeCells) {
      const gx = previewX + (offX + dx - minX) * cell;
      const gy = previewY + (offY + dy - minY) * cell;
      ctx.fillRect(gx + 1, gy + 1, cell - 2, cell - 2);
    }
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
}

/**
 * Brood-placement ghost preview. Head cell renders as a solid block
 * with outline; body cells as a softer fill. Blue when valid, red when
 * invalid (Step 5 wires the rule check; Step 4 always valid).
 *
 * @param {Array<[number, number]>} ghostCells
 * @param {number} cursorX
 * @param {number} cursorY
 * @param {boolean} valid
 */
export function drawBroodPlacementOverlay(ghostCells, cursorX, cursorY, valid) {
  const ctx = this._ctx;
  const cs = this._cellSize;
  const color = valid ? "#3399ff" : "#ff5050";

  for (const [x, y] of ghostCells) {
    const isHead = x === cursorX && y === cursorY;
    ctx.globalAlpha = isHead ? 0.65 : 0.3;
    ctx.fillStyle = color;
    ctx.fillRect(x * cs, y * cs, cs, cs);
  }
  ctx.globalAlpha = 1;

  // Head outline so the cursor is unambiguous against the ghost body.
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(cursorX * cs, cursorY * cs, cs, cs);
}

/**
 * Marks a placed mine — small warm-amber dot centred in the cell.
 * Rendered during placement (all mines the player has laid so far)
 * and during play (all active mines the player has visible; Reginald
 * doesn't "see" them but the player does).
 *
 * @param {number} x
 * @param {number} y
 */
export function drawMineCell(x, y) {
  const ctx = this._ctx;
  const cs = this._cellSize;
  const cx = x * cs + cs / 2;
  const cy = y * cs + cs / 2;
  const r = Math.max(2, Math.floor(cs / 4));
  ctx.fillStyle = "#e0c060";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7a5a10";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Marks an actively-shielded kin cell with a bright blue outline. The
 * underlying kin cell renders first; this strokes over it inset by 1px
 * so adjacent shielded cells form a continuous border around the shape
 * rather than a chequered grid of single-cell rings.
 *
 * @param {number} x
 * @param {number} y
 */
export function drawShieldedKinCell(x, y) {
  const ctx = this._ctx;
  const cs = this._cellSize;
  ctx.strokeStyle = "#3ec0ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2);
}

/**
 * Shield-placement overlay: cursor + highlighted-kin shape, amber so
 * it reads as "protect this".
 *
 * @param {number} cursorX
 * @param {number} cursorY
 * @param {Array<[number, number]>} highlightCells
 */
export function drawShieldPlacementOverlay(cursorX, cursorY, highlightCells) {
  const ctx = this._ctx;
  const cs = this._cellSize;
  const color = "#ffd866";
  // Soft amber fill over each cell of the eligible kin so the whole
  // shape reads as "covered by this shield".
  if (highlightCells && highlightCells.length > 0) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    for (const [x, y] of highlightCells) {
      ctx.fillRect(x * cs, y * cs, cs, cs);
    }
    ctx.globalAlpha = 1;
  }
  // Cursor outline regardless of whether a kin is under it — keep the
  // cursor visible over empty cells too.
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(cursorX * cs, cursorY * cs, cs, cs);
}

export function drawWormholeOverlay(cursorX, cursorY, phase, portalA, _boardW, _boardH) {
  const ctx = this._ctx;
  const cs = this._cellSize;

  if (phase === 2 && portalA) {
    drawCell(portalA.x, portalA.y, CELL_WORMHOLE_A);
  }

  const color = phase === 1 ? "#ff6600" : "#3399ff";
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = color;
  ctx.fillRect(cursorX * cs, cursorY * cs, cs, cs);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(cursorX * cs, cursorY * cs, cs, cs);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(phase === 1 ? "Place Portal A" : "Place Portal B", this._gridW / 2, this._gridH + 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
}
