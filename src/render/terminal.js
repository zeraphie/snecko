// terminal.js — TerminalRenderer for Node.js (no external deps)

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
} from './renderer.js';
import { LOGO_GRID, LOGO_HEIGHT, LOGO_WIDTH } from '../utils/logo.js';

// ── ANSI constants ────────────────────────────────────────────────

const GREEN = '\x1b[38;5;35m';
const CYAN = '\x1b[96m';
const BROWN = '\x1b[38;5;94m';
const RED = '\x1b[91m';
const YELLOW = '\x1b[93m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ── Cell character maps ───────────────────────────────────────────

const CELL_CHARS = {};
CELL_CHARS[CELL_EMPTY] = DIM + '\u2591\u2591' + RESET; // ░░
CELL_CHARS[CELL_WALL] = BROWN + '\u2588\u2588' + RESET; // ██
CELL_CHARS[CELL_WALL_LOW] = BROWN + '\u2592\u2592' + RESET; // ▒▒
CELL_CHARS[CELL_SNAKE] = GREEN + '\u2593\u2593' + RESET; // ▓▓
CELL_CHARS[CELL_SNAKE_HEAD] = GREEN + '\u25C6\u25C6' + RESET; // ◆◆ (fallback)
CELL_CHARS[CELL_FOOD] = YELLOW + '\u25CE\u25CE' + RESET; // ◎◎
CELL_CHARS[CELL_CURRENT_RIGHT] = CYAN + '\u00BB\u00BB' + RESET; // »» right (bright)
CELL_CHARS[CELL_CURRENT_LEFT] = CYAN + '\u00AB\u00AB' + RESET; // «« left (bright)
CELL_CHARS[CELL_CURRENT_DOWN] = CYAN + '\u2193\u2193' + RESET; // ↓↓ down (bright)
CELL_CHARS[CELL_CURRENT_UP] = CYAN + '\u2191\u2191' + RESET; // ↑↑ up (bright)

const DIM_CYAN = '\x1b[36m';
const CURRENT_DIM = {};
CURRENT_DIM[CELL_CURRENT_RIGHT] = DIM_CYAN + '\u00BB\u00BB' + RESET;
CURRENT_DIM[CELL_CURRENT_LEFT] = DIM_CYAN + '\u00AB\u00AB' + RESET;
CURRENT_DIM[CELL_CURRENT_DOWN] = DIM_CYAN + '\u2193\u2193' + RESET;
CURRENT_DIM[CELL_CURRENT_UP] = DIM_CYAN + '\u2191\u2191' + RESET;
const FOOD_DIM = '\x1b[33m' + '\u25CE\u25CE' + RESET; // ◎◎ dim yellow
CELL_CHARS[CELL_TELEGRAPH] = DIM + '\u2591\u2591' + RESET; // ░░ telegraph
const ORANGE = '\x1b[38;5;208m';
const BLUE = '\x1b[38;5;39m';
CELL_CHARS[CELL_WORMHOLE_A] = ORANGE + '\u25C9\u25C9' + RESET; // ◉◉ portal A
CELL_CHARS[CELL_WORMHOLE_B] = BLUE + '\u25C9\u25C9' + RESET; // ◉◉ portal B

const HEAD_CHARS = {};
HEAD_CHARS['0,-1'] = GREEN + '\u25B2\u25B2' + RESET; // ▲▲ up
HEAD_CHARS['0,1'] = GREEN + '\u25BC\u25BC' + RESET; // ▼▼ down
HEAD_CHARS['-1,0'] = GREEN + '\u25C0\u25C0' + RESET; // ◀◀ left
HEAD_CHARS['1,0'] = GREEN + '\u25B6\u25B6' + RESET; // ▶▶ right

const ESC_HOME = '\x1b[H';
const ESC_HIDE_CURSOR = '\x1b[?25l';
const ESC_SHOW_CURSOR = '\x1b[?25h';

// ── Logo rendering ────────────────────────────────────────────────

// Build terminal logo lines at init (static)
// Each pixel → 2-char block, ANSI-colored. Store { text, visibleLen }.
const LOGO_CHAR_MAP = {
  B: GREEN + '\u2593\u2593' + RESET, // ▓▓ body
  H: GREEN + '\u2588\u2588' + RESET, // ██ head (brighter block)
  E: '  ', // eye (gap)
  T: RED + '\u2596\u2596' + RESET, // ▖▖ tongue
  t: GREEN + '\u2591\u2591' + RESET, // ░░ tail (dim)
};
// Build upright and rotated (90° CW) logo lines
function buildLogoLines(grid, w, h) {
  const lines = [];
  for (let y = 0; y < h; y++) {
    let text = '';
    let visLen = 0;
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x];
      if (ch === '.') {
        text += '  ';
      } else {
        text += LOGO_CHAR_MAP[ch];
      }
      visLen += 2;
    }
    lines.push({ text, visLen });
  }
  return lines;
}

const TERM_LOGO_LINES = buildLogoLines(LOGO_GRID, LOGO_WIDTH, LOGO_HEIGHT);

// 90° CCW rotation (head falls to floor): rotated[r][c] = original[c][W-1-r]
const ROTATED_GRID = [];
for (let r = 0; r < LOGO_WIDTH; r++) {
  let row = '';
  for (let c = 0; c < LOGO_HEIGHT; c++) {
    row += LOGO_GRID[c][LOGO_WIDTH - 1 - r];
  }
  ROTATED_GRID.push(row);
}
const TERM_LOGO_DEAD = buildLogoLines(ROTATED_GRID, LOGO_HEIGHT, LOGO_WIDTH);

// ── Constructor ───────────────────────────────────────────────────

/** ANSI terminal renderer for Node.js. Buffers a frame into a string and writes to stdout. */
export class TerminalRenderer {
  /**
   * @param {NodeJS.WriteStream} stdout
   * @param {number} boardWidth
   * @param {number} boardHeight
   */
  constructor(stdout, boardWidth, boardHeight) {
    this._stdout = stdout;
    this._w = boardWidth;
    this._h = boardHeight;
    this._grid = [];
    this._headDir = { dx: 1, dy: 0 };
    this._targeting = null;
    this._wormholeOverlay = null;
    this._headX = -1;
    this._headY = -1;
    this._hudLine = '';
    this._maxHudLen = 0;
    this._screenOverlay = null;
    this._animTime = 0;

    for (let y = 0; y < boardHeight; y++) {
      this._grid[y] = new Uint8Array(boardWidth);
    }

    stdout.write(ESC_HIDE_CURSOR);
  }

  /** Resets the grid buffer and overlay state for a new frame. */
  clear() {
    this._animTime = Date.now() / 1000;
    for (let y = 0; y < this._h; y++) {
      this._grid[y].fill(CELL_EMPTY);
    }
    this._targeting = null;
    this._wormholeOverlay = null;
    this._headX = -1;
    this._headY = -1;
    this._hudLine = '';
    this._screenOverlay = null;
  }

  /** Stores bomb targeting state for rendering during flush. */
  drawTargetingOverlay(cursorX, cursorY, boardW, boardH) {
    this._targeting = { cx: cursorX, cy: cursorY, bw: boardW, bh: boardH };
  }

  /** Stores wormhole placement state for rendering during flush. */
  drawWormholeOverlay(cursorX, cursorY, phase, portalA, boardW, boardH) {
    this._wormholeOverlay = {
      cx: cursorX,
      cy: cursorY,
      phase,
      portalA,
      bw: boardW,
      bh: boardH,
    };
  }

  // ── Cell drawing ───────────────────────────────────────────────

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} type
   */
  drawCell(x, y, type) {
    this._grid[y][x] = type;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} dx
   * @param {number} dy
   */
  drawSnakeHead(x, y, dx, dy) {
    this._grid[y][x] = CELL_SNAKE_HEAD;
    this._headX = x;
    this._headY = y;
    this._headDir.dx = dx;
    this._headDir.dy = dy;
  }

  // ── HUD ────────────────────────────────────────────────────────

  /** Builds the HUD string (stats + upgrades) for output during flush. */
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
    const mins = String(Math.floor(time / 60)).padStart(2, '0');
    const secs = String(Math.floor(time % 60)).padStart(2, '0');
    this._hudLine = `Lv ${level}  Food: ${foodEaten}/${foodRequired}  Score: ${score}  Time: ${mins}:${secs}`;

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
      this._hudLine += '\n' + parts.join('  ');
    }

    const rawLen = this._hudLine.replace(/\x1b\[[0-9;]*m/g, '').length;
    if (rawLen > this._maxHudLen) {
      this._maxHudLen = rawLen;
    }
  }

  // ── Screens ────────────────────────────────────────────────────

  /** @param {string} name - Screen identifier ("dead", "title", etc.). @param {string[]} lines - Text lines to display centred. */
  drawScreen(name, lines) {
    this._screenOverlay = { name, lines };
  }

  /** @param {object[]} choices - Upgrade options to display. @param {object|null} mutation - Optional mutation upgrade. @param {number} selectedIndex - Currently highlighted choice. @param {boolean} mutationAccepted - Whether the mutation is toggled on. */
  drawDraftScreen(choices, mutation, selectedIndex, mutationAccepted) {
    const fullWidth = this._w * 2;
    const lines = [];

    lines.push('');
    lines.push('  L E V E L   U P');
    lines.push('');

    for (let i = 0; i < choices.length; i++) {
      const def = choices[i];
      const sel = i === selectedIndex;
      const badge = def.type === 'passive' ? '+' + def.duration + ' Rounds' : 'x' + def.charges;
      if (sel) {
        lines.push(`  ${GREEN}> [${i + 1}] ${def.name}${RESET}  ${DIM}${badge}${RESET}`);
      } else {
        lines.push(`  [${i + 1}] ${def.name}  ${DIM}${badge}${RESET}`);
      }
      lines.push(`      ${DIM}${def.desc}${RESET}`);
    }

    if (mutation) {
      lines.push('');
      const mSel = mutationAccepted;
      const mColor = mSel ? RED : DIM;
      lines.push(
        `  ${mColor}[4] MUTATION: ${mutation.name}${RESET}${mSel ? RED + ' *' + RESET : ''}`
      );
      lines.push(`      ${DIM}${mutation.desc}${RESET}`);
    }

    lines.push('');
    lines.push(
      `  ${DIM}\u2191\u2193 select${mutation ? ', \u2190\u2192 mutation' : ''}, Enter confirm${RESET}`
    );

    // Build output, padded to board height
    this._screenOverlay = null;
    let buf = ESC_HOME;
    const padTop = Math.max(0, Math.floor((this._h - lines.length) / 2));
    for (let y = 0; y < this._h; y++) {
      const li = y - padTop;
      let line = '';
      let visLen = 0;
      if (li >= 0 && li < lines.length) {
        line = lines[li];
        // Approximate visible length (strip ANSI)
        visLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
      }
      if (visLen < fullWidth) {
        line += ' '.repeat(fullWidth - visLen);
      }
      buf += line + '\n';
    }

    // Blank HUD lines (2 lines to clear stale upgrade info)
    const hudWidth = Math.max(fullWidth, this._maxHudLen);
    buf += ' '.repeat(hudWidth) + '\n';
    buf += ' '.repeat(hudWidth) + '\n';
    this._stdout.write(buf);
  }

  // ── Flush / output ─────────────────────────────────────────────

  /** Writes the composed frame to stdout — grid cells, overlays, HUD, and screen overlays. */
  flush() {
    let buf = ESC_HOME;
    const fullWidth = this._w * 2;

    if (this._screenOverlay) {
      // Build combined line list: logo + blank + text lines
      // Each entry: { text, visLen } where visLen is display width (no ANSI)
      const combined = [];
      const logoLines = this._screenOverlay.name === 'dead' ? TERM_LOGO_DEAD : TERM_LOGO_LINES;
      for (let i = 0; i < logoLines.length; i++) {
        combined.push(logoLines[i]);
      }
      combined.push({ text: '', visLen: 0 }); // blank separator
      for (let i = 0; i < this._screenOverlay.lines.length; i++) {
        const t = this._screenOverlay.lines[i];
        combined.push({ text: t, visLen: t.length });
      }

      const padTop = Math.floor((this._h - combined.length) / 2);
      for (let y = 0; y < this._h; y++) {
        const li = y - padTop;
        let line = '';
        let lineVisLen = 0;
        if (li >= 0 && li < combined.length) {
          const entry = combined[li];
          const padLeft = Math.max(0, Math.floor((fullWidth - entry.visLen) / 2));
          line = ' '.repeat(padLeft) + entry.text;
          lineVisLen = padLeft + entry.visLen;
        }
        if (lineVisLen < fullWidth) {
          line += ' '.repeat(fullWidth - lineVisLen);
        }
        buf += line + '\n';
      }
    } else {
      // Render grid cells row by row
      for (let y = 0; y < this._h; y++) {
        for (let x = 0; x < this._w; x++) {
          let cell;
          if (x === this._headX && y === this._headY) {
            const key = this._headDir.dx + ',' + this._headDir.dy;
            cell = HEAD_CHARS[key] || CELL_CHARS[CELL_SNAKE_HEAD];
          } else {
            const cellType = this._grid[y][x];
            if (CURRENT_DIM[cellType]) {
              let flowDot;
              if (cellType === CELL_CURRENT_RIGHT) flowDot = x;
              else if (cellType === CELL_CURRENT_LEFT) flowDot = -x;
              else if (cellType === CELL_CURRENT_DOWN) flowDot = y;
              else flowDot = -y;
              const bright = Math.sin(this._animTime * 3.5 - flowDot * 0.8) > 0;
              cell = bright ? CELL_CHARS[cellType] : CURRENT_DIM[cellType];
            } else if (cellType === CELL_FOOD) {
              const bright = Math.sin(this._animTime * 2.5) > 0;
              cell = bright ? CELL_CHARS[CELL_FOOD] : FOOD_DIM;
            } else {
              cell = CELL_CHARS[cellType];
            }
          }

          // Targeting overlay
          if (this._targeting) {
            const t = this._targeting;
            const dx = x - t.cx;
            const dy = y - t.cy;
            // Check wrapping distance
            const wx = Math.abs(dx) <= 1 || Math.abs(dx) >= t.bw - 1;
            const wy = Math.abs(dy) <= 1 || Math.abs(dy) >= t.bh - 1;
            if (wx && wy) {
              if (dx === 0 && dy === 0) {
                cell = RED + '\u2588\u2588' + RESET;
              } else {
                cell = RED + '\u2591\u2591' + RESET;
              }
            }
          }

          // Wormhole placement overlay
          if (this._wormholeOverlay) {
            const w = this._wormholeOverlay;
            if (x === w.cx && y === w.cy) {
              const color = w.phase === 1 ? ORANGE : BLUE;
              cell = color + '\u2588\u2588' + RESET;
            }
            if (w.phase === 2 && w.portalA && x === w.portalA.x && y === w.portalA.y) {
              cell = ORANGE + '\u25C9\u25C9' + RESET;
            }
          }

          buf += cell;
        }
        buf += '\n';
      }
    }

    // HUD output (2 lines: stats + upgrades)
    const hud = this._screenOverlay ? '' : this._hudLine;
    const hudLines = hud.split('\n');
    const hudWidth = Math.max(fullWidth, this._maxHudLen);
    // Always write 2 HUD lines to clear stale content
    for (let i = 0; i < 2; i++) {
      const line = hudLines[i] || '';
      const visLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
      buf += visLen < hudWidth ? line + ' '.repeat(hudWidth - visLen) : line;
      buf += '\n';
    }

    this._stdout.write(buf);
  }

  /** Restores the terminal cursor before exit. */
  destroy() {
    this._stdout.write(ESC_SHOW_CURSOR);
  }
}
