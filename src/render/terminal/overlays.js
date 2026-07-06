// overlays.js — Targeting, wormhole, and brood-placement overlays

import { BRIGHT_AMBER, RESET } from "./palette.js";

/**
 * Stores bomb targeting state for rendering during flush.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {number} cursorX
 * @param {number} cursorY
 * @param {number} boardW
 * @param {number} boardH
 */
export function drawTargetingOverlay(r, cursorX, cursorY, boardW, boardH) {
  r._targeting = { cx: cursorX, cy: cursorY, bw: boardW, bh: boardH };
}

/**
 * Stores wormhole placement state for rendering during flush.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {number} cursorX
 * @param {number} cursorY
 * @param {number} phase
 * @param {object|null} portalA
 * @param {number} boardW
 * @param {number} boardH
 */
/**
 * Stores brood placement ghost state for rendering during flush.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {Array<[number, number]>} ghostCells
 * @param {number} cursorX
 * @param {number} cursorY
 * @param {boolean} valid
 */
export function drawBroodPlacementOverlay(r, ghostCells, cursorX, cursorY, valid) {
  r._broodPlacementOverlay = {
    cells: ghostCells,
    cx: cursorX,
    cy: cursorY,
    valid,
  };
}

/**
 * Re-stamps an actively-shielded kin cell with the amber placement
 * colour so the player can tell which kin is protected. Re-uses the
 * `▓▓` kin glyph so the shape stays recognisable; only the colour
 * changes.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {number} x
 * @param {number} y
 */
export function drawShieldedKinCell(r, x, y) {
  if (x < 0 || x >= r._w || y < 0 || y >= r._h) {
    return;
  }
  r._grid[y][x] = BRIGHT_AMBER + "▓▓" + RESET;
}

/**
 * Stamps a mine glyph (◆◆) so the player can see where their traps
 * are. Rendered during both placement and play.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {number} x
 * @param {number} y
 */
export function drawMineCell(r, x, y) {
  if (x < 0 || x >= r._w || y < 0 || y >= r._h) {
    return;
  }
  r._grid[y][x] = BRIGHT_AMBER + "◆◆" + RESET;
}

/**
 * Stores shield-placement overlay state for rendering during flush.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {number} cursorX
 * @param {number} cursorY
 * @param {Array<[number, number]>} highlightCells — every cell of the
 *   eligible kin under the cursor (may be empty).
 */
export function drawShieldPlacementOverlay(r, cursorX, cursorY, highlightCells) {
  r._shieldPlacementOverlay = {
    cx: cursorX,
    cy: cursorY,
    cells: highlightCells ?? [],
  };
}

/**
 * Writes the placement-specific HUD into `r._hudLine`. Two lines:
 * line 1 — what's being placed + what's next + count; line 2 —
 * control hints. The Tetris-style cell preview is canvas-only;
 * terminal shows the kin label.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {{
 *   activeLabel: string,
 *   nextLabel: string | null,
 *   nextShapeCells: Array<[number, number]>,
 *   placedCount: number,
 *   totalCount: number,
 * }} info
 */
export function drawBroodPlacementHud(r, info) {
  const next = info.nextLabel ?? "—";
  const line1 = `Placing ${info.activeLabel}  Next ${next}  Placed ${info.placedCount}/${info.totalCount}`;
  const line2 = "Arrows move  R rotate  Tab next  Enter place  Backspace undo  Esc menu";
  r._hudLine = `${line1}\n${line2}`;
}

export function drawWormholeOverlay(r, cursorX, cursorY, phase, portalA, boardW, boardH) {
  r._wormholeOverlay = {
    cx: cursorX,
    cy: cursorY,
    phase,
    portalA,
    bw: boardW,
    bh: boardH,
  };
}
