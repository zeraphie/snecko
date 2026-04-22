// screens.js — Canvas full-screen overlays (start, dead, draft, contraband)

import { LOGO_PIXELS, LOGO_COLORS, LOGO_WIDTH, LOGO_HEIGHT } from "../../utils/logo.js";
import { TEXT_COLOR } from "./colors.js";

function _drawLogo(ox, oy, px) {
  const ctx = this._ctx;
  for (let i = 0; i < LOGO_PIXELS.length; i++) {
    const p = LOGO_PIXELS[i];
    ctx.fillStyle = LOGO_COLORS[p.color];
    ctx.fillRect(ox + p.x * px, oy + p.y * px, px, px);
  }
}

export function drawScreen(name, lines) {
  const ctx = this._ctx;
  ctx.fillStyle = name === "dead" ? "rgba(0, 0, 0, 1)" : "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

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

  const logoCX = this._gridW / 2;
  const logoCY = startY + logoH / 2;
  if (name === "dead") {
    ctx.save();
    ctx.translate(logoCX, logoCY);
    ctx.rotate(-Math.PI / 2);
    _drawLogo.call(this, -logoW / 2, -logoH / 2, logoPx);
    ctx.restore();
  } else {
    _drawLogo.call(this, logoCX - logoW / 2, startY, logoPx);
  }

  const textStartY = startY + logoH + logoGap;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], this._gridW / 2, textStartY + i * lineHeight);
  }
  ctx.textAlign = "left";
}

export function drawDraftScreen(choices, mutation, selectedIndex, mutationAccepted) {
  const ctx = this._ctx;
  const w = this._gridW;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = "bold 20px monospace";
  ctx.fillText("L E V E L   U P", w / 2, 30);

  const cardW = Math.min(w - 40, 320);
  const cardH = 50;
  const gap = 8;
  const totalCards = choices.length + (mutation ? 1 : 0);
  const totalH = totalCards * cardH + (totalCards - 1) * gap + 30;
  const startY = Math.max(55, (this._canvas.height - totalH) / 2);
  const cardX = (w - cardW) / 2;

  for (let i = 0; i < choices.length; i++) {
    const def = choices[i];
    const y = startY + i * (cardH + gap);
    const selected = i === selectedIndex;

    ctx.fillStyle = selected ? "#2a3a5c" : "#1a1a2e";
    ctx.fillRect(cardX, y, cardW, cardH);

    ctx.strokeStyle = selected ? "#27ae60" : "#444";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(cardX, y, cardW, cardH);

    ctx.textAlign = "left";
    ctx.fillStyle = selected ? "#27ae60" : "#666";
    ctx.font = "bold 14px monospace";
    const label = selected ? "\u25b6 " + def.name : def.name;
    ctx.fillText(label, cardX + 10, y + 20);

    ctx.textAlign = "right";
    ctx.fillStyle = "#888";
    ctx.font = "11px monospace";
    const badge = def.type === "passive" ? "+" + def.duration + " Rounds" : "x" + def.charges;
    ctx.fillText(badge, cardX + cardW - 10, y + 20);

    ctx.textAlign = "left";
    ctx.fillStyle = "#aaa";
    ctx.font = "11px monospace";
    ctx.fillText(def.desc, cardX + 10, y + 38);
  }

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

export function drawContrabandScreen(choices, selectedIndex, collected) {
  const ctx = this._ctx;
  const w = this._gridW;

  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#e74c3c";
  ctx.font = "bold 22px monospace";
  ctx.fillText("C O N T R A B A N D", w / 2, 28);

  ctx.fillStyle = "#555";
  ctx.font = "11px monospace";
  ctx.fillText("These upgrades are not on the flight manifest.", w / 2, 50);

  const cardW = Math.min(w - 40, 320);
  const cardH = 52;
  const gap = 8;
  const totalH = (choices ? choices.length : 0) * (cardH + gap);
  const startY = Math.max(70, (this._gridH - totalH) / 2);
  const cardX = (w - cardW) / 2;

  if (choices) {
    for (let i = 0; i < choices.length; i++) {
      const item = choices[i];
      const y = startY + i * (cardH + gap);
      const selected = i === selectedIndex;

      ctx.fillStyle = selected ? "#2a0a0a" : "#111118";
      ctx.fillRect(cardX, y, cardW, cardH);

      ctx.strokeStyle = selected ? "#e74c3c" : "#333";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(cardX, y, cardW, cardH);

      ctx.textAlign = "left";
      ctx.fillStyle = selected ? "#e74c3c" : "#888";
      ctx.font = "bold 13px monospace";
      const label = selected ? "\u25b6 " + item.name : item.name;
      ctx.fillText(label, cardX + 10, y + 18);

      ctx.fillStyle = "#666";
      ctx.font = "11px monospace";
      ctx.fillText(item.desc, cardX + 10, y + 38);
    }
  }

  const holdCount = collected ? collected.length : 0;
  const stashY = startY + totalH + 16;
  ctx.textAlign = "center";
  ctx.fillStyle = "#444";
  ctx.font = "11px monospace";
  ctx.fillText(`In the hold: ${holdCount} item${holdCount !== 1 ? "s" : ""}`, w / 2, stashY);

  ctx.fillStyle = "#333";
  ctx.font = "12px monospace";
  ctx.fillText("\u2191\u2193 select, Enter confirm", w / 2, stashY + 20);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
}
