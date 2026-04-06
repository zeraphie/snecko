// layers.js — Bitmask layer engine (get/set/clear cells)

import { CHUNK_BITS } from "./constants.js";

export function _getMask(layer) {
  if (layer === "wall") return this.wallMasks;
  if (layer === "snake") return this.snakeMasks;
  return this.reservedMasks;
}

export function isCellSet(layer, x, y) {
  const masks = this._getMask(layer);
  const chunk = (x / CHUNK_BITS) | 0;
  const bit = x - chunk * CHUNK_BITS;
  const idx = y * this.chunksPerRow + chunk;
  return (masks[idx] & (1 << bit)) !== 0;
}

export function setCell(layer, x, y) {
  const masks = this._getMask(layer);
  const chunk = (x / CHUNK_BITS) | 0;
  const bit = x - chunk * CHUNK_BITS;
  const idx = y * this.chunksPerRow + chunk;
  masks[idx] |= 1 << bit;
}

export function clearCell(layer, x, y) {
  const masks = this._getMask(layer);
  const chunk = (x / CHUNK_BITS) | 0;
  const bit = x - chunk * CHUNK_BITS;
  const idx = y * this.chunksPerRow + chunk;
  masks[idx] &= ~(1 << bit);
}

export function clearMasks(layer) {
  this._getMask(layer).fill(0);
}
