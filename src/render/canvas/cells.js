// cells.js — Canvas cell drawing: drawCell + shape helpers

import {
  CELL_EMPTY,
  CELL_FOOD,
  CELL_RED_FOOD,
  CELL_BOSS_WEAK,
  CELL_PLAYER_INVUL,
  CELL_ANCHOR_LOCK,
  CELL_DANGER_TRAIL,
  CELL_ECHO_ZONE,
  CELL_BOSS_HIT,
  CELL_BOSS_DAMAGED,
  CELL_EXHAUST,
  CELL_WORMHOLE_A,
  CELL_WORMHOLE_B,
  CELL_CURRENT_RIGHT,
  CELL_CURRENT_LEFT,
  CELL_CURRENT_DOWN,
  CELL_CURRENT_UP,
} from "../renderer.js";
import { COLORS } from "./colors.js";

export function drawCell(x, y, type) {
  if (type === CELL_EMPTY) {
    return;
  }
  if (type === CELL_FOOD) {
    _drawPentagon.call(this, x, y, 2.5);
    return;
  }
  if (type === CELL_RED_FOOD) {
    _drawPentagon.call(this, x, y, 4.0);
    return;
  }
  if (type === CELL_BOSS_WEAK) {
    const alpha = 0.6 + 0.4 * Math.sin(this._animTime * 5.0);
    this._ctx.globalAlpha = alpha;
    this._ctx.fillStyle = COLORS[CELL_BOSS_WEAK];
    this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
    this._ctx.globalAlpha = 1;
    return;
  }
  if (type === CELL_PLAYER_INVUL) {
    const alpha = 0.5 + 0.5 * Math.abs(Math.sin(this._animTime * 10.0));
    this._ctx.globalAlpha = alpha;
    this._ctx.fillStyle = COLORS[CELL_PLAYER_INVUL];
    this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
    this._ctx.globalAlpha = 1;
    return;
  }
  if (type === CELL_ANCHOR_LOCK) {
    const alpha = 0.55 + 0.45 * Math.abs(Math.sin(this._animTime * 6.0));
    this._ctx.globalAlpha = alpha;
    this._ctx.fillStyle = COLORS[CELL_ANCHOR_LOCK];
    this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
    this._ctx.globalAlpha = 1;
    return;
  }
  if (type === CELL_DANGER_TRAIL) {
    const alpha = 0.4 + 0.3 * Math.abs(Math.sin(this._animTime * 8.0));
    this._ctx.globalAlpha = alpha;
    this._ctx.fillStyle = COLORS[CELL_DANGER_TRAIL];
    this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
    this._ctx.globalAlpha = 1;
    return;
  }
  if (type === CELL_ECHO_ZONE) {
    const alpha = 0.25 + 0.2 * Math.abs(Math.sin(this._animTime * 5.0));
    this._ctx.globalAlpha = alpha;
    this._ctx.fillStyle = COLORS[CELL_ECHO_ZONE];
    this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
    this._ctx.globalAlpha = 1;
    return;
  }
  if (type === CELL_BOSS_DAMAGED) {
    const alpha = 0.5 + 0.3 * Math.abs(Math.sin(this._animTime * 4.0));
    this._ctx.globalAlpha = alpha;
    this._ctx.fillStyle = COLORS[CELL_BOSS_DAMAGED];
    this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
    this._ctx.globalAlpha = 1;
    return;
  }
  if (type === CELL_EXHAUST) {
    const alpha = 0.4 + 0.6 * Math.random();
    this._ctx.globalAlpha = alpha;
    this._ctx.fillStyle = Math.random() > 0.5 ? "#e67e22" : "#e74c3c";
    this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
    this._ctx.globalAlpha = 1;
    return;
  }
  if (type === CELL_BOSS_HIT) {
    // Pulse between boss body purple and a lighter lavender — bright enough
    // to read as a hit, soft enough not to strobe.
    const t = Math.abs(Math.sin(this._animTime * 12.0));
    const r = Math.round(142 + (210 - 142) * t);
    const g = Math.round(68 + (150 - 68) * t);
    const b = Math.round(173 + (230 - 173) * t);
    this._ctx.fillStyle = `rgb(${r},${g},${b})`;
    this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
    return;
  }
  if (type === CELL_WORMHOLE_A || type === CELL_WORMHOLE_B) {
    _drawPortal.call(this, x, y, type);
    return;
  }
  if (
    type === CELL_CURRENT_RIGHT ||
    type === CELL_CURRENT_LEFT ||
    type === CELL_CURRENT_DOWN ||
    type === CELL_CURRENT_UP
  ) {
    _drawCurrentArrow.call(this, x, y, type);
    return;
  }
  this._ctx.fillStyle = COLORS[type];
  this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
}

function _drawPentagon(gx, gy, pulseHz) {
  const cs = this._cellSize;
  const cx = gx * cs + cs / 2;
  const cy = gy * cs + cs / 2;
  const r = cs * 0.45;
  const ctx = this._ctx;
  const alpha = 0.6 + 0.4 * Math.sin(this._animTime * pulseHz);
  ctx.fillStyle = pulseHz > 3 ? COLORS[CELL_RED_FOOD] : COLORS[CELL_FOOD];
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = ((Math.PI * 2) / 5) * i - Math.PI / 2;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function _drawCurrentArrow(gx, gy, type) {
  const cs = this._cellSize;
  const px = gx * cs;
  const py = gy * cs;
  const ctx = this._ctx;
  const m = cs * 0.2;
  const mid = cs / 2;

  let flowDot;
  if (type === CELL_CURRENT_RIGHT) {
    flowDot = gx;
  } else if (type === CELL_CURRENT_LEFT) {
    flowDot = -gx;
  } else if (type === CELL_CURRENT_DOWN) {
    flowDot = gy;
  } else {
    flowDot = -gy;
  }

  const alpha = 0.3 + 0.25 * Math.sin(this._animTime * 3.5 - flowDot * 0.8);
  ctx.fillStyle = "#00e5ff";
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  if (type === CELL_CURRENT_RIGHT) {
    ctx.moveTo(px + m, py + m);
    ctx.lineTo(px + cs - m, py + mid);
    ctx.lineTo(px + m, py + cs - m);
  } else if (type === CELL_CURRENT_LEFT) {
    ctx.moveTo(px + cs - m, py + m);
    ctx.lineTo(px + m, py + mid);
    ctx.lineTo(px + cs - m, py + cs - m);
  } else if (type === CELL_CURRENT_DOWN) {
    ctx.moveTo(px + m, py + m);
    ctx.lineTo(px + mid, py + cs - m);
    ctx.lineTo(px + cs - m, py + m);
  } else {
    ctx.moveTo(px + m, py + cs - m);
    ctx.lineTo(px + mid, py + m);
    ctx.lineTo(px + cs - m, py + cs - m);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function _drawPortal(gx, gy, type) {
  const cs = this._cellSize;
  const cx = gx * cs + cs / 2;
  const cy = gy * cs + cs / 2;
  const ctx = this._ctx;
  const isA = type === CELL_WORMHOLE_A;
  const color = isA ? "#ff6600" : "#3399ff";
  const pulse = 0.6 + 0.4 * Math.sin(this._animTime * 3 + (isA ? 0 : Math.PI));
  const r = cs * 0.4 * (0.8 + 0.2 * pulse);

  ctx.globalAlpha = pulse;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = pulse * 0.5;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
