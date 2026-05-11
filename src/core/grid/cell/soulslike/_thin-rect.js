// soulslike/_thin-rect.js — Shared helper for weapon cells.
//
// Draws a thin filled rectangle inside the cell, centred and aligned
// ALONG the facing axis. A horizontal weapon (east/west) shows as a
// horizontal rectangle; a vertical weapon (north/south) shows as a
// vertical rectangle. With `longFraction = 1.0` the rect spans the
// full long edge of the cell so two adjacent cells along the weapon
// axis touch at the shared boundary — the weapon reads as a single
// continuous line, not disconnected segments.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px — cell top-left pixel x
 * @param {number} py — cell top-left pixel y
 * @param {number} cs — cell size in pixels
 * @param {{ dx: number, dy: number }} facing — weapon's long-axis direction
 * @param {string} color — fill color (hex)
 * @param {number} [thinFraction=0.25] — rect thickness as a fraction of cs
 * @param {number} [longFraction=1.0] — rect length as a fraction of cs (1.0 = touches cell edges)
 */
export function drawThinRect(
  ctx,
  px,
  py,
  cs,
  facing,
  color,
  thinFraction = 0.25,
  longFraction = 1.0
) {
  const thin = cs * thinFraction;
  const long = cs * longFraction;
  const centerX = px + cs / 2;
  const centerY = py + cs / 2;
  // Rect aligned with the weapon's facing axis.
  const weaponHorizontal = facing.dx !== 0;
  const rw = weaponHorizontal ? long : thin;
  const rh = weaponHorizontal ? thin : long;
  const rx = centerX - rw / 2;
  const ry = centerY - rh / 2;
  ctx.fillStyle = color;
  ctx.fillRect(rx, ry, rw, rh);
}
