// overlays.js — Targeting and wormhole placement overlays

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
