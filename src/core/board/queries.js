// queries.js — Convenience query helpers

export function isInBounds(x, y) {
  return x >= 0 && x < this.width && y >= 0 && y < this.height;
}

export function isWallCell(x, y) {
  return this.isCellSet("wall", x, y);
}

export function isSnakeCell(x, y) {
  return this.isCellSet("snake", x, y);
}

export function isReservedCell(x, y) {
  return this.isCellSet("reserved", x, y);
}

export function isBlockedCell(x, y) {
  return this.isWallCell(x, y) || this.isSnakeCell(x, y);
}
