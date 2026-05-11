// mechanics/_portal.js — Shared canvas helper for wormhole portals.
//
// Both portal colors render the same shape — outer color ring around a
// white core, with a 3 Hz pulse — and only differ in color and phase
// offset (so A and B pulse alternately, π out of phase). The terminal
// glyph (◉◉) and color live in each cell file.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px — top-left pixel x of the cell
 * @param {number} py — top-left pixel y of the cell
 * @param {number} cs — cell size in pixels
 * @param {string} color — hex outer-ring color
 * @param {number} t — current time in seconds (Date.now() / 1000)
 * @param {number} phaseOffset — 0 for A, π for B
 */
export function drawPortal(ctx, px, py, cs, color, t, phaseOffset) {
  const cx = px + cs / 2;
  const cy = py + cs / 2;
  const pulse = 0.6 + 0.4 * Math.sin(t * 3 + phaseOffset);
  const r = cs * 0.4 * (0.8 + 0.2 * pulse);

  ctx.globalAlpha = pulse;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = pulse * 0.5;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
