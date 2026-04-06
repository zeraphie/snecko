// canvas.js — CanvasRenderer for browser

import {
  CELL_EMPTY,
  CELL_WALL,
  CELL_WALL_LOW,
  CELL_SNAKE,
  CELL_SNAKE_HEAD,
  CELL_FOOD,
  CELL_CURRENT_RIGHT,
  CELL_CURRENT_LEFT,
  CELL_CURRENT_DOWN,
  CELL_CURRENT_UP,
  CELL_TELEGRAPH,
  CELL_WORMHOLE_A,
  CELL_WORMHOLE_B,
} from "./renderer.js";
import { LOGO_PIXELS, LOGO_COLORS, LOGO_WIDTH, LOGO_HEIGHT } from "../utils/logo.js";

const COLORS = {};
COLORS[CELL_EMPTY] = null;
COLORS[CELL_WALL] = "#5C3D11";
COLORS[CELL_WALL_LOW] = "#7A5529";
COLORS[CELL_SNAKE] = "#27ae60";
COLORS[CELL_SNAKE_HEAD] = "#5ddb8a";
COLORS[CELL_FOOD] = "#f1c40f";
COLORS[CELL_CURRENT_RIGHT] = "#00e5ff";
COLORS[CELL_CURRENT_LEFT] = "#00e5ff";
COLORS[CELL_CURRENT_DOWN] = "#00e5ff";
COLORS[CELL_CURRENT_UP] = "#00e5ff";
COLORS[CELL_TELEGRAPH] = "#555566";

const BG_LIGHT = "#222034";
const BG_DARK = "#1a1a2e";
const HUD_BG = "#16162a";
const TEXT_COLOR = "#cbdbfc";

export class CanvasRenderer {
  constructor(canvas, cellSize, boardWidth, boardHeight) {
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

  drawCell(x, y, type) {
    if (type === CELL_EMPTY) return;
    if (type === CELL_FOOD) {
      this._drawPentagon(x, y);
      return;
    }
    if (type === CELL_WORMHOLE_A || type === CELL_WORMHOLE_B) {
      this._drawPortal(x, y, type);
      return;
    }
    if (
      type === CELL_CURRENT_RIGHT ||
      type === CELL_CURRENT_LEFT ||
      type === CELL_CURRENT_DOWN ||
      type === CELL_CURRENT_UP
    ) {
      this._drawCurrentArrow(x, y, type);
      return;
    }
    this._ctx.fillStyle = COLORS[type];
    this._ctx.fillRect(x * this._cellSize, y * this._cellSize, this._cellSize, this._cellSize);
  }

  _drawPentagon(gx, gy) {
    const cs = this._cellSize;
    const cx = gx * cs + cs / 2;
    const cy = gy * cs + cs / 2;
    const r = cs * 0.45;
    const ctx = this._ctx;
    const alpha = 0.6 + 0.4 * Math.sin(this._animTime * 2.5);
    ctx.fillStyle = COLORS[CELL_FOOD];
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = ((Math.PI * 2) / 5) * i - Math.PI / 2;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawCurrentArrow(gx, gy, type) {
    const cs = this._cellSize;
    const px = gx * cs;
    const py = gy * cs;
    const ctx = this._ctx;
    const m = cs * 0.2; // margin
    const mid = cs / 2;

    // Phase-offset alpha pulse: brightness wave travels along flow direction
    let flowDot;
    if (type === CELL_CURRENT_RIGHT) flowDot = gx;
    else if (type === CELL_CURRENT_LEFT) flowDot = -gx;
    else if (type === CELL_CURRENT_DOWN) flowDot = gy;
    else flowDot = -gy;

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

  drawSnakeHead(gx, gy, dx, dy) {
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
    const ctx = this._ctx;
    ctx.font = "12px monospace";
    ctx.textBaseline = "middle";

    // Line 1: stats
    const y1 = this._gridH + 12;
    const mins = String(Math.floor(time / 60)).padStart(2, "0");
    const secs = String(Math.floor(time % 60)).padStart(2, "0");
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(
      `Lv ${level}  Food: ${foodEaten}/${foodRequired}  Score: ${score}  Time: ${mins}:${secs}`,
      8,
      y1
    );

    // Line 2: upgrades
    const y2 = this._gridH + 34;
    const parts = [];
    if (passives && passives.length > 0) {
      for (const p of passives) {
        if (p.remainingFood !== undefined) {
          parts.push(`${p.id}(${p.remainingFood}fd)`);
        } else {
          parts.push(`${p.id}(${p.remainingLevels}Lv)`);
        }
      }
    }
    if (consumables && consumables.length > 0) {
      for (let i = 0; i < consumables.length; i++) {
        const c = consumables[i];
        const sel = i === selectedConsumable;
        parts.push(sel ? `[${c.id} x${c.charges}]` : `${c.id} x${c.charges}`);
      }
    }
    if (parts.length > 0) {
      ctx.fillStyle = "#888";
      ctx.fillText(parts.join("  "), 8, y2);
    }
  }

  drawScreen(name, lines) {
    const ctx = this._ctx;
    ctx.fillStyle = name === "dead" ? "rgba(0, 0, 0, 1)" : "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // Logo pixel size — scale so logo is ~100px wide
    const logoPx = Math.floor(100 / LOGO_WIDTH);
    const logoW = LOGO_WIDTH * logoPx;
    const logoH = LOGO_HEIGHT * logoPx;
    const logoGap = 20;

    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lineHeight = 24;
    const textBlockH = lines.length * lineHeight;
    const totalH = logoH + logoGap + textBlockH;
    const startY = (this._gridH - totalH) / 2;

    // Draw logo centered (rotated 90° on death)
    const logoCX = this._gridW / 2;
    const logoCY = startY + logoH / 2;
    if (name === "dead") {
      ctx.save();
      ctx.translate(logoCX, logoCY);
      ctx.rotate(-Math.PI / 2);
      this._drawLogo(-logoW / 2, -logoH / 2, logoPx);
      ctx.restore();
    } else {
      this._drawLogo(logoCX - logoW / 2, startY, logoPx);
    }

    // Draw text below logo
    const textStartY = startY + logoH + logoGap;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], this._gridW / 2, textStartY + i * lineHeight);
    }
    ctx.textAlign = "left";
  }

  _drawLogo(ox, oy, px) {
    const ctx = this._ctx;
    for (let i = 0; i < LOGO_PIXELS.length; i++) {
      const p = LOGO_PIXELS[i];
      ctx.fillStyle = LOGO_COLORS[p.color];
      ctx.fillRect(ox + p.x * px, oy + p.y * px, px, px);
    }
  }

  drawDraftScreen(choices, mutation, selectedIndex, mutationAccepted) {
    const ctx = this._ctx;
    const w = this._gridW;

    // Full black background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Title
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "bold 20px monospace";
    ctx.fillText("L E V E L   U P", w / 2, 30);

    // Vertical card list
    const cardW = Math.min(w - 40, 320);
    const cardH = 50;
    const gap = 8;
    const totalCards = choices.length + (mutation ? 1 : 0);
    const totalH = totalCards * cardH + (totalCards - 1) * gap + 30; // +30 for instructions
    const startY = Math.max(55, (this._canvas.height - totalH) / 2);
    const cardX = (w - cardW) / 2;

    for (let i = 0; i < choices.length; i++) {
      const def = choices[i];
      const y = startY + i * (cardH + gap);
      const selected = i === selectedIndex;

      // Card background
      ctx.fillStyle = selected ? "#2a3a5c" : "#1a1a2e";
      ctx.fillRect(cardX, y, cardW, cardH);

      // Card border
      ctx.strokeStyle = selected ? "#27ae60" : "#444";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(cardX, y, cardW, cardH);

      // Selection marker + name (left-aligned)
      ctx.textAlign = "left";
      ctx.fillStyle = selected ? "#27ae60" : "#666";
      ctx.font = "bold 14px monospace";
      const label = selected ? "\u25b6 " + def.name : def.name;
      ctx.fillText(label, cardX + 10, y + 20);

      // Type badge (right-aligned)
      ctx.textAlign = "right";
      ctx.fillStyle = "#888";
      ctx.font = "11px monospace";
      const badge = def.type === "passive" ? "+" + def.duration + " Rounds" : "x" + def.charges;
      ctx.fillText(badge, cardX + cardW - 10, y + 20);

      // Description
      ctx.textAlign = "left";
      ctx.fillStyle = "#aaa";
      ctx.font = "11px monospace";
      ctx.fillText(def.desc, cardX + 10, y + 38);
    }

    // Mutation slot
    if (mutation) {
      const mY = startY + choices.length * (cardH + gap);

      ctx.fillStyle = mutationAccepted ? "#3a2040" : "#1a1a2e";
      ctx.fillRect(cardX, mY, cardW, cardH);

      ctx.strokeStyle = mutationAccepted ? "#e74c3c" : "#6a3a3a";
      ctx.lineWidth = mutationAccepted ? 2 : 1;
      ctx.strokeRect(cardX, mY, cardW, cardH);

      ctx.textAlign = "left";
      ctx.fillStyle = mutationAccepted ? "#e74c3c" : "#6a3a3a";
      ctx.font = "bold 14px monospace";
      const mLabel = mutationAccepted
        ? "\u25b6 MUTATION: " + mutation.name
        : "MUTATION: " + mutation.name;
      ctx.fillText(mLabel, cardX + 10, mY + 20);

      ctx.fillStyle = "#aaa";
      ctx.font = "11px monospace";
      ctx.fillText(mutation.desc, cardX + 10, mY + 38);
    }

    // Instructions
    const instrY = startY + totalCards * (cardH + gap) + 10;
    ctx.textAlign = "center";
    ctx.fillStyle = "#666";
    ctx.font = "12px monospace";
    ctx.fillText(
      "\u2191\u2193 select" + (mutation ? ", \u2190\u2192 mutation" : "") + ", Enter confirm",
      w / 2,
      instrY
    );

    ctx.textAlign = "left";
  }

  drawTargetingOverlay(cursorX, cursorY, boardW, boardH) {
    const ctx = this._ctx;
    const cs = this._cellSize;

    // Draw blast radius preview (3x3)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        let bx = cursorX + dx;
        let by = cursorY + dy;
        if (bx < 0) bx += boardW;
        else if (bx >= boardW) bx -= boardW;
        if (by < 0) by += boardH;
        else if (by >= boardH) by -= boardH;

        const isCenter = dx === 0 && dy === 0;
        ctx.fillStyle = isCenter ? "rgba(255, 80, 80, 0.6)" : "rgba(255, 80, 80, 0.25)";
        ctx.fillRect(bx * cs, by * cs, cs, cs);
      }
    }

    // Cursor crosshair border
    ctx.strokeStyle = "#ff5050";
    ctx.lineWidth = 2;
    ctx.strokeRect(cursorX * cs, cursorY * cs, cs, cs);
  }

  _drawPortal(gx, gy, type) {
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

    // Inner ring
    ctx.globalAlpha = pulse * 0.5;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawWormholeOverlay(cursorX, cursorY, phase, portalA, boardW, boardH) {
    const ctx = this._ctx;
    const cs = this._cellSize;

    // Draw already-placed portal A during phase 2
    if (phase === 2 && portalA) {
      this._drawPortal(portalA.x, portalA.y, CELL_WORMHOLE_A);
    }

    // Draw cursor
    const color = phase === 1 ? "#ff6600" : "#3399ff";
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = color;
    ctx.fillRect(cursorX * cs, cursorY * cs, cs, cs);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(cursorX * cs, cursorY * cs, cs, cs);

    // Phase label
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      phase === 1 ? "Place Portal A" : "Place Portal B",
      this._gridW / 2,
      this._gridH + 2
    );
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
  }

  flush() {
    // no-op — canvas draws are immediate
  }
}
