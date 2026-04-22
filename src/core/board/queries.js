// queries.js — Convenience query helpers

/**
 * Tests whether the coordinates are within the board boundaries.
 *
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isInBounds(x, y) {
  return x >= 0 && x < this.width && y >= 0 && y < this.height;
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isWallCell(x, y) {
  return this.isCellSet("wall", x, y);
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isSnakeCell(x, y) {
  return this.isCellSet("snake", x, y);
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isReservedCell(x, y) {
  return this.isCellSet("reserved", x, y);
}

/**
 * Tests whether a cell is occupied by a wall or the snake.
 *
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isBlockedCell(x, y) {
  return this.isWallCell(x, y) || this.isSnakeCell(x, y);
}
