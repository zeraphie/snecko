// player.js — Player plane shape for boss fights

/**
 * Returns the 4 cells of the player plane, with index 0 always being the tip.
 *
 * The plane points in direction (dx, dy) — the tip is the leading edge.
 * The body extends in the opposite direction forming a diamond/kite:
 *
 *   Pointing UP (dx=0, dy=-1):
 *
 *       ▲          ← tip       (x,   y  )
 *      ● ●         ← wings     (x±1, y+1)
 *       ●          ← tail      (x,   y+2)
 *
 * The same shape rotates correctly for all four cardinal directions.
 *
 * @param {number} x  - tip column
 * @param {number} y  - tip row
 * @param {number} dx - facing direction x  (-1 | 0 | 1)
 * @param {number} dy - facing direction y  (-1 | 0 | 1)
 * @returns {Array<{x: number, y: number}>}  length-4 array, index 0 = tip
 */
export function getPlayerCells(x, y, dx, dy) {
  // Body axis: one step behind the tip in the opposite direction of travel.
  const bx = -dx;
  const by = -dy;

  // Lateral axis: 90° CCW of the movement direction.
  const lx = -dy;
  const ly = dx;

  return [
    // tip
    { x, y },
    // wings — 1 step back, ±1 lateral
    { x: x + bx + lx, y: y + by + ly },
    { x: x + bx - lx, y: y + by - ly },
    // tail — 2 steps back, centered
    { x: x + 2 * bx, y: y + 2 * by },
  ];
}
