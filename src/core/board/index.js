// board.js — Bitmask board with chunk-based row storage

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
 * Bitmask board with chunk-based row storage for walls, snake, and reserved cells.
 * Terrain data is stored in a parallel Uint8Array.
 */
export class Board {
  /**
   * @param {number} width — board width in cells
   * @param {number} height — board height in cells
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
Board.prototype._getMask = _getMask;
Board.prototype.isCellSet = isCellSet;
Board.prototype.setCell = setCell;
Board.prototype.clearCell = clearCell;
Board.prototype.clearMasks = clearMasks;
Board.prototype.isInBounds = isInBounds;
Board.prototype.isWallCell = isWallCell;
Board.prototype.isSnakeCell = isSnakeCell;
Board.prototype.isReservedCell = isReservedCell;
Board.prototype.isBlockedCell = isBlockedCell;

Board.CHUNK_BITS = CHUNK_BITS;
Board.TERRAIN_NONE = TERRAIN_NONE;
Board.TERRAIN_LOW = TERRAIN_LOW;
Board.TERRAIN_HIGH = TERRAIN_HIGH;
Board.TERRAIN_TELEGRAPH = TERRAIN_TELEGRAPH;
Board.TERRAIN_CURRENT = TERRAIN_CURRENT;
