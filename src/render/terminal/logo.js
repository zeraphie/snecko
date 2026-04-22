// logo.js — Terminal logo rendering (upright + rotated for death screen)

import { LOGO_GRID, LOGO_HEIGHT, LOGO_WIDTH } from "../../utils/logo.js";
import { GREEN, RED, RESET } from "./palette.js";

// ── Character map for logo pixels ────────────────────────────────

const LOGO_CHAR_MAP = {
  B: GREEN + "\u2593\u2593" + RESET, // ▓▓ body
  H: GREEN + "\u2588\u2588" + RESET, // ██ head (brighter block)
  E: "  ", // eye (gap)
  T: RED + "\u2596\u2596" + RESET, // ▖▖ tongue
  t: GREEN + "\u2591\u2591" + RESET, // ░░ tail (dim)
};

// ── Logo line builder ────────────────────────────────────────────

function buildLogoLines(grid, w, h) {
  const lines = [];
  for (let y = 0; y < h; y++) {
    let text = "";
    let visLen = 0;
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x];
      if (ch === ".") {
        text += "  ";
      } else {
        text += LOGO_CHAR_MAP[ch];
      }
      visLen += 2;
    }
    lines.push({ text, visLen });
  }
  return lines;
}

// ── Pre-built logo variants ──────────────────────────────────────

export const TERM_LOGO_LINES = buildLogoLines(LOGO_GRID, LOGO_WIDTH, LOGO_HEIGHT);

// 90° CCW rotation (head falls to floor): rotated[r][c] = original[c][W-1-r]
const ROTATED_GRID = [];
for (let r = 0; r < LOGO_WIDTH; r++) {
  let row = "";
  for (let c = 0; c < LOGO_HEIGHT; c++) {
    row += LOGO_GRID[c][LOGO_WIDTH - 1 - r];
  }
  ROTATED_GRID.push(row);
}

export const TERM_LOGO_DEAD = buildLogoLines(ROTATED_GRID, LOGO_HEIGHT, LOGO_WIDTH);
