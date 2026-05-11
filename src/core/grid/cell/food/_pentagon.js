// food/_pentagon.js — Shared canvas helper for food cells.
//
// Both food cells render as a pulsing pentagon with the same shape;
// only the color and pulse rate differ.

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px — top-left pixel x of the cell
 * @param {number} py — top-left pixel y of the cell
 * @param {number} cs — cell size in pixels
 * @param {string} color — hex fill color
 * @param {number} pulseHz — pulse rate
 * @param {number} t — current time in seconds (Date.now() / 1000)
 */
export function drawPentagon(ctx, px, py, cs, color, pulseHz, t) {
  const cx = px + cs / 2;
  const cy = py + cs / 2;
  const r = cs * 0.45;
  const alpha = 0.6 + 0.4 * Math.sin(t * pulseHz);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = ((Math.PI * 2) / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}
