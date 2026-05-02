// grid.js — Bitmask grid with chunk-based row storage

import {
  CHUNK_BITS,
  TERRAIN_NONE,
  TERRAIN_LOW,
  TERRAIN_HIGH,
  TERRAIN_TELEGRAPH,
  TERRAIN_CURRENT,
} from "./constants.js";
import { _getMask, isCellSet, setCell, clearCell, clearMasks } from "./layers.js";
import { isInBounds, isWallCell, isSnakeCell, isReservedCell, isBlockedCell } from "./queries.js";

/**
 * Bitmask grid with chunk-based row storage for walls, snake, and reserved cells.
 * Terrain data is stored in a parallel Uint8Array.
 */
export class Grid {
  /**
   * @param {number} width — grid width in cells
   * @param {number} height — grid height in cells
   */
  constructor(width, height) {
    const chunksPerRow = Math.ceil(width / CHUNK_BITS);
    const totalChunks = height * chunksPerRow;

    this.width = width;
    this.height = height;
    this.chunksPerRow = chunksPerRow;
    this.wallMasks = new Uint32Array(totalChunks);
    this.snakeMasks = new Uint32Array(totalChunks);
    this.reservedMasks = new Uint32Array(totalChunks);
    this.terrain = new Uint8Array(width * height);
    this.foodX = -1;
    this.foodY = -1;
    this.bossFoodX = -1;
    this.bossFoodY = -1;
    this.playerX = -1;
    this.playerY = -1;
  }
}

// Attach methods from split files
Grid.prototype._getMask = _getMask;
Grid.prototype.isCellSet = isCellSet;
Grid.prototype.setCell = setCell;
Grid.prototype.clearCell = clearCell;
Grid.prototype.clearMasks = clearMasks;
Grid.prototype.isInBounds = isInBounds;
Grid.prototype.isWallCell = isWallCell;
Grid.prototype.isSnakeCell = isSnakeCell;
Grid.prototype.isReservedCell = isReservedCell;
Grid.prototype.isBlockedCell = isBlockedCell;

Grid.CHUNK_BITS = CHUNK_BITS;
Grid.TERRAIN_NONE = TERRAIN_NONE;
Grid.TERRAIN_LOW = TERRAIN_LOW;
Grid.TERRAIN_HIGH = TERRAIN_HIGH;
Grid.TERRAIN_TELEGRAPH = TERRAIN_TELEGRAPH;
Grid.TERRAIN_CURRENT = TERRAIN_CURRENT;
