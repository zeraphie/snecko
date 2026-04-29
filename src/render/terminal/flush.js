// flush.js — Frame compositor: writes the composed frame to stdout

import {
  CELL_FOOD,
  CELL_RED_FOOD,
  CELL_BOSS_WEAK,
  CELL_PLAYER_INVUL,
  CELL_BOSS_HIT,
  CELL_ANCHOR_LOCK,
  CELL_DANGER_TRAIL,
  CELL_ECHO_ZONE,
  CELL_PLAYER_BULLET,
  CELL_BOSS_DAMAGED,
  CELL_EXHAUST,
  CELL_CURRENT_RIGHT,
  CELL_CURRENT_LEFT,
  CELL_CURRENT_DOWN,
  CELL_SNAKE_HEAD,
} from "../renderer.js";

import { RED, ORANGE, BLUE, RESET } from "./palette.js";
import { ESC_HOME } from "./palette.js";

import {
  CELL_CHARS,
  CURRENT_DIM,
  FOOD_DIM,
  RED_FOOD_DIM,
  BOSS_WEAK_DIM,
  PLAYER_INVUL_DIM,
  BOSS_HIT_DIM,
  ANCHOR_LOCK_DIM,
  DANGER_TRAIL_DIM,
  ECHO_ZONE_DIM,
  PLAYER_BULLET_DIM,
  BOSS_DAMAGED_DIM,
  EXHAUST_DIM,
  HEAD_CHARS,
  HEAD_CHARS_INVUL,
  HEAD_CHARS_INVUL_DIM,
} from "./chars.js";

import { TERM_LOGO_LINES, TERM_LOGO_DEAD } from "./logo.js";
import { renderIntroRow } from "./hud.js";

/**
 * Writes the composed frame to stdout — grid cells, overlays, HUD, and screen overlays.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 */
export function flush(r) {
  let buf = ESC_HOME;
  const fullWidth = r._w * 2;

  if (r._screenOverlay) {
    // Build combined line list: logo + blank + text lines
    const combined = [];
    const logoLines = r._screenOverlay.name === "dead" ? TERM_LOGO_DEAD : TERM_LOGO_LINES;
    for (let i = 0; i < logoLines.length; i++) {
      combined.push(logoLines[i]);
    }
    combined.push({ text: "", visLen: 0 }); // blank separator
    for (let i = 0; i < r._screenOverlay.lines.length; i++) {
      const t = r._screenOverlay.lines[i];
      combined.push({ text: t, visLen: t.length });
    }

    const padTop = Math.floor((r._h - combined.length) / 2);
    for (let y = 0; y < r._h; y++) {
      const li = y - padTop;
      let line = "";
      let lineVisLen = 0;
      if (li >= 0 && li < combined.length) {
        const entry = combined[li];
        const padLeft = Math.max(0, Math.floor((fullWidth - entry.visLen) / 2));
        line = " ".repeat(padLeft) + entry.text;
        lineVisLen = padLeft + entry.visLen;
      }
      if (lineVisLen < fullWidth) {
        line += " ".repeat(fullWidth - lineVisLen);
      }
      buf += line + "\n";
    }
  } else {
    // Render grid cells row by row
    for (let y = 0; y < r._h; y++) {
      // Boss intro overlay: replace rows 12–15 with centered title card
      if (r._introOverlay && y >= 12 && y <= 15) {
        buf += renderIntroRow(r, y - 12) + "\n";
        continue;
      }

      for (let x = 0; x < r._w; x++) {
        let cell;
        if (x === r._headX && y === r._headY) {
          const key = r._headDir.dx + "," + r._headDir.dy;
          if (r._headInvul) {
            const bright = Math.sin(r._animTime * 10.0) > 0;
            cell = bright
              ? HEAD_CHARS_INVUL[key] || CELL_CHARS[CELL_PLAYER_INVUL]
              : HEAD_CHARS_INVUL_DIM[key] || CELL_CHARS[CELL_PLAYER_INVUL];
          } else {
            cell = HEAD_CHARS[key] || CELL_CHARS[CELL_SNAKE_HEAD];
          }
        } else {
          const cellType = r._grid[y][x];
          if (CURRENT_DIM[cellType]) {
            let flowDot;
            if (cellType === CELL_CURRENT_RIGHT) {
              flowDot = x;
            } else if (cellType === CELL_CURRENT_LEFT) {
              flowDot = -x;
            } else if (cellType === CELL_CURRENT_DOWN) {
              flowDot = y;
            } else {
              flowDot = -y;
            }
            const bright = Math.sin(r._animTime * 3.5 - flowDot * 0.8) > 0;
            cell = bright ? CELL_CHARS[cellType] : CURRENT_DIM[cellType];
          } else if (cellType === CELL_FOOD) {
            const bright = Math.sin(r._animTime * 2.5) > 0;
            cell = bright ? CELL_CHARS[CELL_FOOD] : FOOD_DIM;
          } else if (cellType === CELL_RED_FOOD) {
            const bright = Math.sin(r._animTime * 4.0) > 0;
            cell = bright ? CELL_CHARS[CELL_RED_FOOD] : RED_FOOD_DIM;
          } else if (cellType === CELL_BOSS_WEAK) {
            const bright = Math.sin(r._animTime * 5.0) > 0;
            cell = bright ? CELL_CHARS[CELL_BOSS_WEAK] : BOSS_WEAK_DIM;
          } else if (cellType === CELL_PLAYER_INVUL) {
            const bright = Math.sin(r._animTime * 10.0) > 0;
            cell = bright ? CELL_CHARS[CELL_PLAYER_INVUL] : PLAYER_INVUL_DIM;
          } else if (cellType === CELL_BOSS_HIT) {
            const bright = Math.sin(r._animTime * 12.0) > 0;
            cell = bright ? CELL_CHARS[CELL_BOSS_HIT] : BOSS_HIT_DIM;
          } else if (cellType === CELL_ANCHOR_LOCK) {
            const bright = Math.sin(r._animTime * 6.0) > 0;
            cell = bright ? CELL_CHARS[CELL_ANCHOR_LOCK] : ANCHOR_LOCK_DIM;
          } else if (cellType === CELL_DANGER_TRAIL) {
            const bright = Math.sin(r._animTime * 8.0) > 0;
            cell = bright ? CELL_CHARS[CELL_DANGER_TRAIL] : DANGER_TRAIL_DIM;
          } else if (cellType === CELL_ECHO_ZONE) {
            const bright = Math.sin(r._animTime * 5.0) > 0;
            cell = bright ? CELL_CHARS[CELL_ECHO_ZONE] : ECHO_ZONE_DIM;
          } else if (cellType === CELL_PLAYER_BULLET) {
            const bright = Math.sin(r._animTime * 8.0) > 0;
            cell = bright ? CELL_CHARS[CELL_PLAYER_BULLET] : PLAYER_BULLET_DIM;
          } else if (cellType === CELL_BOSS_DAMAGED) {
            const bright = Math.sin(r._animTime * 4.0) > 0;
            cell = bright ? CELL_CHARS[CELL_BOSS_DAMAGED] : BOSS_DAMAGED_DIM;
          } else if (cellType === CELL_EXHAUST) {
            const bright = Math.sin(r._animTime * 6.0) > 0;
            cell = bright ? CELL_CHARS[CELL_EXHAUST] : EXHAUST_DIM;
          } else {
            cell = CELL_CHARS[cellType];
          }
        }

        // Targeting overlay
        if (r._targeting) {
          const t = r._targeting;
          const dx = x - t.cx;
          const dy = y - t.cy;
          const wx = Math.abs(dx) <= 1 || Math.abs(dx) >= t.bw - 1;
          const wy = Math.abs(dy) <= 1 || Math.abs(dy) >= t.bh - 1;
          if (wx && wy) {
            if (dx === 0 && dy === 0) {
              cell = RED + "\u2588\u2588" + RESET;
            } else {
              cell = RED + "\u2591\u2591" + RESET;
            }
          }
        }

        // Wormhole placement overlay
        if (r._wormholeOverlay) {
          const w = r._wormholeOverlay;
          if (x === w.cx && y === w.cy) {
            const color = w.phase === 1 ? ORANGE : BLUE;
            cell = color + "\u2588\u2588" + RESET;
          }
          if (w.phase === 2 && w.portalA && x === w.portalA.x && y === w.portalA.y) {
            cell = ORANGE + "\u25C9\u25C9" + RESET;
          }
        }

        buf += cell;
      }
      buf += "\n";
    }
  }

  // HUD output (2 lines: stats + upgrades)
  const hud = r._screenOverlay ? "" : r._hudLine;
  const hudLines = hud.split("\n");
  const hudWidth = Math.max(fullWidth, r._maxHudLen);
  // Always write 2 HUD lines to clear stale content
  for (let i = 0; i < 2; i++) {
    const line = hudLines[i] || "";
    const visLen = line.replace(/\x1b\[[0-9;]*m/g, "").length;
    buf += visLen < hudWidth ? line + " ".repeat(hudWidth - visLen) : line;
    buf += "\n";
  }

  r._stdout.write(buf);
}
