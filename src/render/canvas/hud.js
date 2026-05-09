// hud.js — Canvas HUD, boss info, and boss intro overlay

import { TEXT_COLOR } from "./colors.js";
import { LABELS } from "../../text/labels.js";

export function drawHUD(
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
  const ctx = this._ctx;
  ctx.font = "12px monospace";
  ctx.textBaseline = "middle";

  const y1 = this._gridH + 12;
  const mins = String(Math.floor(time / 60)).padStart(2, "0");
  const secs = String(Math.floor(time % 60)).padStart(2, "0");
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(
    `${LABELS.hud.act} ${actIndex}  ${LABELS.hud.progress}: ${foodEaten}/${foodRequired}  ${LABELS.hud.score}: ${score}  ${LABELS.hud.time}: ${mins}:${secs}`,
    8,
    y1
  );

  const y2 = this._gridH + 34;
  const parts = [];
  if (passives && passives.length > 0) {
    for (const p of passives) {
      const short = LABELS.upgrades[p.id]?.short ?? p.id;
      parts.push(`${short} ${p.remainingBites} ${LABELS.hud.bites}`);
    }
  }
  if (bites && bites.length > 0) {
    for (const b of bites) {
      const short = LABELS.upgrades[b.id]?.short ?? b.id;
      parts.push(`${short} ${b.charges} ${LABELS.hud.bites}`);
    }
  }
  if (consumables && consumables.length > 0) {
    for (let i = 0; i < consumables.length; i++) {
      const c = consumables[i];
      const short = LABELS.upgrades[c.id]?.short ?? c.id;
      const sel = i === selectedConsumable;
      parts.push(sel ? `[${short} x${c.charges}]` : `${short} x${c.charges}`);
    }
  }
  if (parts.length > 0) {
    ctx.fillStyle = "#888";
    ctx.fillText(parts.join("  "), 8, y2);
  }
}

export function drawBossInfo(name, hp, maxHp, phase) {
  const ctx = this._ctx;
  const y2 = this._gridH + 34;

  ctx.fillStyle = "#16162a";
  ctx.fillRect(0, y2 - 8, this._gridW, 20);

  ctx.font = "12px monospace";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#e74c3c";
  ctx.textAlign = "left";
  ctx.fillText(name, 8, y2);

  const BAR_SEGMENTS = 10;
  const SEG_W = 8;
  const SEG_H = 10;
  const barX = 8 + ctx.measureText(name).width + 10;
  const barY = y2 - SEG_H / 2;
  const filled = maxHp > 0 ? Math.round((hp / maxHp) * BAR_SEGMENTS) : 0;

  for (let i = 0; i < BAR_SEGMENTS; i++) {
    ctx.fillStyle = i < filled ? "#e74c3c" : "#3a1010";
    ctx.fillRect(barX + i * (SEG_W + 1), barY, SEG_W, SEG_H);
  }

  const hpX = barX + BAR_SEGMENTS * (SEG_W + 1) + 6;
  ctx.fillStyle = "#888";
  ctx.fillText(`${hp}/${maxHp}`, hpX, y2);

  const phaseColors = { 0: "#444", 1: "#ccc", 2: "#f39c12", 3: "#e74c3c" };
  const badgeX = hpX + ctx.measureText(`${hp}/${maxHp}`).width + 10;
  ctx.fillStyle = phaseColors[phase] ?? "#444";
  ctx.fillText(`[${LABELS.boss.phases[phase] ?? ""}]`, badgeX, y2);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
}

export function drawSurvivalInfo(name, ticksLeft, totalTicks) {
  const ctx = this._ctx;
  const y2 = this._gridH + 34;

  ctx.fillStyle = "#16162a";
  ctx.fillRect(0, y2 - 8, this._gridW, 20);

  ctx.font = "12px monospace";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#e74c3c";
  ctx.textAlign = "left";
  ctx.fillText(name, 8, y2);

  // Countdown bar — depletes left-to-right as ticksLeft drops.
  const BAR_SEGMENTS = 10;
  const SEG_W = 8;
  const SEG_H = 10;
  const barX = 8 + ctx.measureText(name).width + 10;
  const barY = y2 - SEG_H / 2;
  const filled = totalTicks > 0 ? Math.round((ticksLeft / totalTicks) * BAR_SEGMENTS) : 0;
  for (let i = 0; i < BAR_SEGMENTS; i++) {
    ctx.fillStyle = i < filled ? "#5ddb8a" : "#1a3a23";
    ctx.fillRect(barX + i * (SEG_W + 1), barY, SEG_W, SEG_H);
  }

  // mm:ss remaining at BOSS_TICK_MS = 120 ms/tick.
  const secs = Math.max(0, Math.ceil((ticksLeft * 120) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const timeX = barX + BAR_SEGMENTS * (SEG_W + 1) + 6;
  ctx.fillStyle = "#888";
  ctx.fillText(`${mm}:${ss}`, timeX, y2);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
}

export function drawBossIntroOverlay(name, ticksLeft, total) {
  const ctx = this._ctx;
  const w = this._gridW;
  const h = this._gridH;

  const progress = total > 0 ? ticksLeft / total : 0;
  const alpha = Math.min(1, progress * 3);
  if (alpha <= 0.02) {
    return;
  }

  const panelH = 80;
  const panelY = (h - panelH) / 2;

  ctx.globalAlpha = alpha * 0.85;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, panelY, w, panelH);

  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e74c3c";
  ctx.font = "bold 18px monospace";
  ctx.fillText(`\u26A0  ${LABELS.boss.incoming}: ${name}  \u26A0`, w / 2, panelY + 26);

  ctx.fillStyle = "#888";
  ctx.font = "12px monospace";
  ctx.fillText(LABELS.boss.holdPosition, w / 2, panelY + 54);

  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
}
