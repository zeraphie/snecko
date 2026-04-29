// snake.js — Canvas snake head rendering

import { CELL_SNAKE, CELL_SNAKE_HEAD, CELL_PLAYER_INVUL } from "../renderer.js";
import { COLORS } from "./colors.js";

export function drawSnakeHead(gx, gy, dx, dy) {
  const cs = this._cellSize;
  const px = gx * cs;
  const py = gy * cs;
  const ctx = this._ctx;

  ctx.fillStyle = COLORS[CELL_SNAKE_HEAD];
  ctx.fillRect(px, py, cs, cs);

  ctx.fillStyle = COLORS[CELL_SNAKE];
  ctx.beginPath();
  const inset = cs * 0.25;
  if (dx === 1) {
    ctx.moveTo(px + cs - inset, py + cs / 2);
    ctx.lineTo(px + inset, py + inset);
    ctx.lineTo(px + inset, py + cs - inset);
  } else if (dx === -1) {
    ctx.moveTo(px + inset, py + cs / 2);
    ctx.lineTo(px + cs - inset, py + inset);
    ctx.lineTo(px + cs - inset, py + cs - inset);
  } else if (dy === -1) {
    ctx.moveTo(px + cs / 2, py + inset);
    ctx.lineTo(px + inset, py + cs - inset);
    ctx.lineTo(px + cs - inset, py + cs - inset);
  } else {
    ctx.moveTo(px + cs / 2, py + cs - inset);
    ctx.lineTo(px + inset, py + inset);
    ctx.lineTo(px + cs - inset, py + inset);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawSnakeHeadInvul(gx, gy, dx, dy) {
  const cs = this._cellSize;
  const px = gx * cs;
  const py = gy * cs;
  const ctx = this._ctx;

  const alpha = 0.5 + 0.5 * Math.abs(Math.sin(this._animTime * 10.0));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS[CELL_PLAYER_INVUL];
  ctx.fillRect(px, py, cs, cs);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#006080";
  ctx.beginPath();
  const inset = cs * 0.25;
  if (dx === 1) {
    ctx.moveTo(px + cs - inset, py + cs / 2);
    ctx.lineTo(px + inset, py + inset);
    ctx.lineTo(px + inset, py + cs - inset);
  } else if (dx === -1) {
    ctx.moveTo(px + inset, py + cs / 2);
    ctx.lineTo(px + cs - inset, py + inset);
    ctx.lineTo(px + cs - inset, py + cs - inset);
  } else if (dy === -1) {
    ctx.moveTo(px + cs / 2, py + inset);
    ctx.lineTo(px + inset, py + cs - inset);
    ctx.lineTo(px + cs - inset, py + cs - inset);
  } else {
    ctx.moveTo(px + cs / 2, py + cs - inset);
    ctx.lineTo(px + inset, py + inset);
    ctx.lineTo(px + cs - inset, py + inset);
  }
  ctx.closePath();
  ctx.fill();
}
