// _facing-triangle.js — Shared canvas helper for directional cells.
//
// Draws a filled triangle inside the cell pointing in the given
// cardinal direction. Used by `snake/head.js` and the soulslike
// fighter cells to make orientation legible without resorting to
// per-state CELL_* variants.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px — top-left pixel x of the cell
 * @param {number} py — top-left pixel y of the cell
 * @param {number} cs — cell size in pixels
 * @param {{ dx: number, dy: number }} facing
 * @param {string} color — fill color (hex)
 */
export function drawFacingTriangle(ctx, px, py, cs, facing, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const inset = cs * 0.25;
  if (facing.dx === 1) {
    ctx.moveTo(px + cs - inset, py + cs / 2);
    ctx.lineTo(px + inset, py + inset);
    ctx.lineTo(px + inset, py + cs - inset);
  } else if (facing.dx === -1) {
    ctx.moveTo(px + inset, py + cs / 2);
    ctx.lineTo(px + cs - inset, py + inset);
    ctx.lineTo(px + cs - inset, py + cs - inset);
  } else if (facing.dy === -1) {
    ctx.moveTo(px + cs / 2, py + inset);
    ctx.lineTo(px + inset, py + cs - inset);
    ctx.lineTo(px + cs - inset, py + cs - inset);
  } else {
    ctx.moveTo(px + cs / 2, py + cs - inset);
    ctx.lineTo(px + inset, py + inset);
    ctx.lineTo(px + cs - inset, py + inset);
  }
  ctx.closePath();
  ctx.fill();
}
