// mechanics/_arrow.js — Shared canvas helper for current arrows.
//
// All four current directions render the same triangular shape with a
// flow-direction-aware position offset; only the rotation differs.
// Each current cell file owns the pulse formula (so the cell's `(x, y)`
// can drive `flowDot`); this helper just paints the shape.

const ARROW_COLOR = "#00e5ff";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px — top-left pixel x of the cell
 * @param {number} py — top-left pixel y of the cell
 * @param {number} cs — cell size in pixels
 * @param {"right"|"left"|"down"|"up"} dir
 * @param {number} alpha — current frame's alpha (0..1)
 */
export function drawArrow(ctx, px, py, cs, dir, alpha) {
  const m = cs * 0.2;
  const mid = cs / 2;
  ctx.fillStyle = ARROW_COLOR;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  if (dir === "right") {
    ctx.moveTo(px + m, py + m);
    ctx.lineTo(px + cs - m, py + mid);
    ctx.lineTo(px + m, py + cs - m);
  } else if (dir === "left") {
    ctx.moveTo(px + cs - m, py + m);
    ctx.lineTo(px + m, py + mid);
    ctx.lineTo(px + cs - m, py + cs - m);
  } else if (dir === "down") {
    ctx.moveTo(px + m, py + m);
    ctx.lineTo(px + mid, py + cs - m);
    ctx.lineTo(px + cs - m, py + m);
  } else {
    ctx.moveTo(px + m, py + cs - m);
    ctx.lineTo(px + mid, py + m);
    ctx.lineTo(px + cs - m, py + cs - m);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}
