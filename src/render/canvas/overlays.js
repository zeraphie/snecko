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
