// loader.js — Canvas loader animation

import { DOT_POSITIONS } from "../../core/loader.js";

export function drawLoader(dots) {
  const ctx = this._ctx;
  const cw = this._canvas.width;
  const ch = this._canvas.height;

  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, cw, ch);

  const dotSize = 10;
  const gap = 16;
  const gridPx = dotSize * 3 + gap * 2;
  const ox = (cw - gridPx) / 2;
  const oy = (ch - gridPx) / 2;

  for (let i = 0; i < 9; i++) {
    const { row, col } = DOT_POSITIONS[i];
    const cx = ox + col * (dotSize + gap) + dotSize / 2;
    const cy = oy + row * (dotSize + gap) + dotSize / 2;

    ctx.globalAlpha = dots[i];
    ctx.fillStyle = "#cbdbfc";
    ctx.beginPath();
    ctx.arc(cx, cy, dotSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}
