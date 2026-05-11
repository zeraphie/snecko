// flush.js — Frame compositor: writes the composed frame to stdout

import { RED, ORANGE, BLUE, RESET } from "./palette.js";
import { ESC_HOME } from "./palette.js";

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
        // Buffer always holds pre-formatted strings from the cell
        // adapter — every cell type is registered in
        // `core/grid/cell/`, so `clear()` and per-frame draws populate
        // every slot before flush.
        let cell = r._grid[y][x];

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
