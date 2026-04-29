// hud.js — HUD, boss info bar, and boss intro overlay

import { GREEN, RED, YELLOW, WHITE, DIM, RESET } from "./palette.js";

// ── Main HUD ─────────────────────────────────────────────────────

/**
 * Builds the HUD string (stats + upgrades) and stores it on the renderer.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {number} score
 * @param {object} board
 * @param {number} time
 * @param {number} level
 * @param {number} foodEaten
 * @param {number} foodRequired
 * @param {Array|null} passives
 * @param {Array|null} consumables
 * @param {number} selectedConsumable
 */
export function drawHUD(
  r,
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
  const mins = String(Math.floor(time / 60)).padStart(2, "0");
  const secs = String(Math.floor(time % 60)).padStart(2, "0");
  r._hudLine = `Lv ${level}  Food: ${foodEaten}/${foodRequired}  Score: ${score}  Time: ${mins}:${secs}`;

  // Build upgrades line
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
      parts.push(sel ? GREEN + `[${c.id} x${c.charges}]` + RESET : `${c.id} x${c.charges}`);
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

  const phaseLabels = {
    0: DIM + "[warmup]" + RESET,
    1: WHITE + "[phase 1]" + RESET,
    2: YELLOW + "[phase 2]" + RESET,
    3: RED + "[phase 3]" + RESET,
  };
  const badge = phaseLabels[phase] ?? "";

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
    `${nameColor}\u26A0  INCOMING: ${name}  \u26A0${RESET}`,
    `${DIM}hold position...${RESET}`,
    "",
  ];
  const text = contents[lineIdx] ?? "";
  const visLen = text.replace(/\x1b\[[0-9;]*m/g, "").length;
  const padLeft = Math.max(0, Math.floor((fullWidth - visLen) / 2));
  const line = " ".repeat(padLeft) + text;
  const lineVisLen = padLeft + visLen;
  return lineVisLen < fullWidth ? line + " ".repeat(fullWidth - lineVisLen) : line;
}
