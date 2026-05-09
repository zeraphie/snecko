// hud.js — HUD, boss info bar, and boss intro overlay

import { GREEN, RED, YELLOW, WHITE, DIM, RESET } from "./palette.js";
import { LABELS } from "../../text/labels.js";

// ── Main HUD ─────────────────────────────────────────────────────

/**
 * Builds the HUD string (stats + upgrades) and stores it on the renderer.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {number} score
 * @param {number} actIndex
 * @param {number} time
 * @param {number} foodEaten
 * @param {number} foodRequired
 * @param {Array|null} passives
 * @param {Array|null} consumables
 * @param {Array|null} bites
 * @param {number} selectedConsumable
 */
export function drawHUD(
  r,
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
  const mins = String(Math.floor(time / 60)).padStart(2, "0");
  const secs = String(Math.floor(time % 60)).padStart(2, "0");
  r._hudLine = `${LABELS.hud.act} ${actIndex}  ${LABELS.hud.progress}: ${foodEaten}/${foodRequired}  ${LABELS.hud.score}: ${score}  ${LABELS.hud.time}: ${mins}:${secs}`;

  // Build upgrades line
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
      parts.push(sel ? GREEN + `[${short} x${c.charges}]` + RESET : `${short} x${c.charges}`);
    }
  }
  if (parts.length > 0) {
    r._hudLine += "\n" + parts.join("  ");
  }

  const rawLen = r._hudLine.replace(/\x1b\[[0-9;]*m/g, "").length;
  if (rawLen > r._maxHudLen) {
    r._maxHudLen = rawLen;
  }
}

// ── Boss info (HP bar + phase badge) ─────────────────────────────

/**
 * Replaces the second HUD line with boss-specific display.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {string} name
 * @param {number} hp
 * @param {number} maxHp
 * @param {number} phase — BOSS_PHASE_* constant (0–3)
 */
export function drawBossInfo(r, name, hp, maxHp, phase) {
  const BAR_LEN = 10;
  const filled = maxHp > 0 ? Math.round((hp / maxHp) * BAR_LEN) : 0;
  const bar =
    RED + "\u2593".repeat(filled) + RESET + DIM + "\u2591".repeat(BAR_LEN - filled) + RESET;

  const phaseColors = [DIM, WHITE, YELLOW, RED];
  const label = LABELS.boss.phases[phase];
  const badge = label ? `${phaseColors[phase] ?? DIM}[${label}]${RESET}` : "";

  const line = `${RED}${name}${RESET}  ${bar}  ${hp}/${maxHp}  ${badge}`;

  // Overwrite line 2 of the HUD (the upgrades/consumables line)
  const lines = r._hudLine.split("\n");
  lines[1] = line;
  r._hudLine = lines.join("\n");

  const rawLen = line.replace(/\x1b\[[0-9;]*m/g, "").length;
  if (rawLen > r._maxHudLen) {
    r._maxHudLen = rawLen;
  }
}

// ── Survival countdown ───────────────────────────────────────────

/**
 * Replaces the second HUD line with a survival countdown bar (depletes
 * left-to-right) and a mm:ss remaining at BOSS_TICK_MS = 120 ms/tick.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {string} name
 * @param {number} ticksLeft
 * @param {number} totalTicks
 */
export function drawSurvivalInfo(r, name, ticksLeft, totalTicks) {
  const BAR_LEN = 10;
  const filled = totalTicks > 0 ? Math.round((ticksLeft / totalTicks) * BAR_LEN) : 0;
  const bar = GREEN + "▓".repeat(filled) + RESET + DIM + "░".repeat(BAR_LEN - filled) + RESET;

  const secs = Math.max(0, Math.ceil((ticksLeft * 120) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  const line = `${RED}${name}${RESET}  ${bar}  ${mm}:${ss}`;

  const lines = r._hudLine.split("\n");
  lines[1] = line;
  r._hudLine = lines.join("\n");

  const rawLen = line.replace(/\x1b\[[0-9;]*m/g, "").length;
  if (rawLen > r._maxHudLen) {
    r._maxHudLen = rawLen;
  }
}

// ── Boss intro overlay ───────────────────────────────────────────

/**
 * Stores data for the boss-entry title card.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {string} name
 * @param {number} ticksLeft
 * @param {number} total
 */
export function drawBossIntroOverlay(r, name, ticksLeft, total) {
  r._introOverlay = { name, ticksLeft, total };
}

/**
 * Builds one padded row of the intro overlay (row offsets 0–3).
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {number} lineIdx — 0..3
 * @returns {string}
 */
export function renderIntroRow(r, lineIdx) {
  const { name, ticksLeft, total } = r._introOverlay;
  const fullWidth = r._w * 2;
  const bright = total <= 0 || ticksLeft / total > 0.33;
  const nameColor = bright ? RED : "\x1b[38;5;88m";

  const contents = [
    "",
    `${nameColor}\u26A0  ${LABELS.boss.incoming}: ${name}  \u26A0${RESET}`,
    `${DIM}${LABELS.boss.holdPosition}${RESET}`,
    "",
  ];
  const text = contents[lineIdx] ?? "";
  const visLen = text.replace(/\x1b\[[0-9;]*m/g, "").length;
  const padLeft = Math.max(0, Math.floor((fullWidth - visLen) / 2));
  const line = " ".repeat(padLeft) + text;
  const lineVisLen = padLeft + visLen;
  return lineVisLen < fullWidth ? line + " ".repeat(fullWidth - lineVisLen) : line;
}
