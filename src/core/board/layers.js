// layers.js — Bitmask layer engine (get/set/clear cells)

import { CHUNK_BITS } from './constants.js';

/**
 * Returns the Uint32Array bitmask for the given layer name.
 *
 * @param {"wall"|"snake"|"reserved"} layer
 * @returns {Uint32Array}
 */
export function _getMask(layer) {
  if (layer === 'wall') {
    return this.wallMasks;
  }
  if (layer === 'snake') {
    return this.snakeMasks;
  }
  return this.reservedMasks;
}

/**
 * Tests whether a cell is set in the given layer.
 *
 * @param {"wall"|"snake"|"reserved"} layer
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isCellSet(layer, x, y) {
  const masks = this._getMask(layer);
  const chunk = (x / CHUNK_BITS) | 0;
  const bit = x - chunk * CHUNK_BITS;
  const idx = y * this.chunksPerRow + chunk;
  return (masks[idx] & (1 << bit)) !== 0;
}

/**
 * Sets a cell in the given layer's bitmask.
 *
 * @param {"wall"|"snake"|"reserved"} layer
 * @param {number} x
 * @param {number} y
 */
export function setCell(layer, x, y) {
  const masks = this._getMask(layer);
  const chunk = (x / CHUNK_BITS) | 0;
  const bit = x - chunk * CHUNK_BITS;
  const idx = y * this.chunksPerRow + chunk;
  masks[idx] |= 1 << bit;
}

/**
 * Clears a cell in the given layer's bitmask.
 *
 * @param {"wall"|"snake"|"reserved"} layer
 * @param {number} x
 * @param {number} y
 */
export function clearCell(layer, x, y) {
  const masks = this._getMask(layer);
  const chunk = (x / CHUNK_BITS) | 0;
  const bit = x - chunk * CHUNK_BITS;
  const idx = y * this.chunksPerRow + chunk;
  masks[idx] &= ~(1 << bit);
}

/**
 * Zeros every chunk in the given layer's bitmask.
 *
 * @param {"wall"|"snake"|"reserved"} layer
 */
export function clearMasks(layer) {
  this._getMask(layer).fill(0);
}
