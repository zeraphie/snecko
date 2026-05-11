// soulslike/_fighter-silhouette.js — Shared body+arms+facing helper
// for the 1×1 snake fighter cells.
//
// Mirrors Hissalia's body+arms circle pattern at a smaller scale (the
// fighter is 1×1, the boss is 2×2) so the two read as the "same kind
// of creature" — just opposite sides of the arena. A small forward
// dot ("eye") in the body provides directional read.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px — cell top-left pixel x
 * @param {number} py — cell top-left pixel y
 * @param {number} cs — cell size in pixels
 * @param {{ dx: number, dy: number }} facing
 * @param {string} bodyColor — main body + arms fill
 * @param {string} eyeColor — small forward facing-dot
 */
export function drawFighterSilhouette(ctx, px, py, cs, facing, bodyColor, eyeColor) {
  const cx = px + cs / 2;
  const cy = py + cs / 2;
  ctx.fillStyle = bodyColor;
  // Body — central circle (slightly smaller than Hissalia's body so
  // arms still fit in 1 cell).
  ctx.beginPath();
  ctx.arc(cx, cy, cs * 0.28, 0, Math.PI * 2);
  ctx.fill();
  // Arms — two smaller circles flanking the body PERPENDICULAR to
  // facing (so they don't fall on the facing axis where the eye sits).
  const perpX = -facing.dy;
  const perpY = facing.dx;
  ctx.beginPath();
  ctx.arc(cx + perpX * cs * 0.32, cy + perpY * cs * 0.32, cs * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - perpX * cs * 0.32, cy - perpY * cs * 0.32, cs * 0.13, 0, Math.PI * 2);
  ctx.fill();
  // Eye — small forward dot in the body indicating facing.
  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.arc(cx + facing.dx * cs * 0.16, cy + facing.dy * cs * 0.16, cs * 0.07, 0, Math.PI * 2);
  ctx.fill();
}
