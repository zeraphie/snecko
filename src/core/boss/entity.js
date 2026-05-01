// entity.js — Boss entity: hitbox, HP, drift motion, phase logic
//
// Each body cell has its own HP (tracked in _cellHp by shape index).
// Destroyed cells are omitted from the cells array but the damage persists
// across drift rebuilds because _cellHp is indexed by shape offset, not
// world coordinates.
//
// The weak point is shielded until the body cell directly south of it (the
// one in the player's upward line of fire) is destroyed.

/**
 * BossEntity represents the visible boss on the arena board.
 *
 * Shape: parsed from a .boss file (non-rectangular cell list) or falls back
 * to a filled rectangle when no shape is provided.
 * Weak point: derived from the shape's ◈ cell, or configurable offset.
 * Motion: drift 1 cell left/right every 3 ticks, bounce at inner arena walls.
 * Stagger: skip 3 ticks of movement after taking a hit.
 *
 * The constructor accepts either a plain string (backward-compat name) or a
 * BossDef config object:
 *
 *   new BossEntity(x, y)                      // defaults
 *   new BossEntity(x, y, 'My Boss')           // string name, all other defaults
 *   new BossEntity(x, y, { name, maxHp, … })  // full config (may include shape)
 */
export class BossEntity {
  /**
   * @param {number} spawnX — top-left x of boss body
   * @param {number} spawnY — top-left y of boss body
   * @param {string|{name?:string,maxHp?:number,bodyHp?:number,width?:number,height?:number,weakX?:number,weakY?:number,shape?:object}} [config]
   */
  constructor(spawnX, spawnY, config = {}) {
    // Allow passing a plain string as a shorthand for { name }
    if (typeof config === "string") {
      config = { name: config };
    }

    const shape = config.shape ?? null;

    this.name = config.name ?? "Absolute Unit";
    this.width = shape ? shape.width : (config.width ?? 5);
    this.height = shape ? shape.height : (config.height ?? 3);
    this.maxHp = config.maxHp ?? 5;
    this.hp = this.maxHp;

    /** HP per body cell (stored for rendering comparison). */
    this._bodyHp = config.bodyHp ?? 3;

    // Store shape cell offsets for non-rectangular bodies.
    // null → fallback to filled rectangle.
    this._shapeCells = shape ? shape.cells : null;

    if (shape) {
      const weak = shape.cells.find((c) => c.weak);
      this._weakX = weak.dx;
      this._weakY = weak.dy;
    } else {
      this._weakX = config.weakX ?? Math.floor(this.width / 2);
      this._weakY = config.weakY ?? Math.floor(this.height / 2);
    }

    // Per-cell HP tracker, indexed by shape template index.
    // Weak cells get 0 HP (damage goes to boss HP instead).
    const totalCells = this._shapeCells ? this._shapeCells.length : this.width * this.height;
    this._cellHp = new Uint8Array(totalCells);
    // Per-cell hit-flash counter (ticks remaining), indexed by shape template index.
    // Decremented in update(); rendered as CELL_BOSS_HIT while > 0.
    this._cellFlashTicks = new Uint8Array(totalCells);

    if (this._shapeCells) {
      for (let i = 0; i < this._shapeCells.length; i++) {
        this._cellHp[i] = this._shapeCells[i].weak ? 0 : this._bodyHp;
      }
    } else {
      for (let dy = 0; dy < this.height; dy++) {
        for (let dx = 0; dx < this.width; dx++) {
          const idx = dy * this.width + dx;
          this._cellHp[idx] = dx === this._weakX && dy === this._weakY ? 0 : this._bodyHp;
        }
      }
    }

    this.x = spawnX;
    this.y = spawnY;

    /** @type {Array<{ x: number, y: number, weak: boolean, hp: number, _shapeIdx: number }>} */
    this.cells = [];
    this._direction = 1; // +1 = right, -1 = left
    this._tickCounter = 0;
    this._staggerTicks = 0; // ticks remaining where boss is staggered (no movement)
    this._buildCells();
  }

  // ── Internal ─────────────────────────────────────────────────

  /**
   * Rebuilds the cells array from the current x/y position, shape, and
   * per-cell HP. Destroyed cells (hp <= 0 and not weak) are omitted.
   */
  _buildCells() {
    this.cells = [];
    if (this._shapeCells) {
      for (let i = 0; i < this._shapeCells.length; i++) {
        const sc = this._shapeCells[i];
        const hp = this._cellHp[i];
        if (!sc.weak && hp <= 0) {
          continue;
        }
        this.cells.push({
          x: this.x + sc.dx,
          y: this.y + sc.dy,
          weak: sc.weak,
          hp,
          _shapeIdx: i,
        });
      }
    } else {
      const wx = this.x + this._weakX;
      const wy = this.y + this._weakY;
      for (let dy = 0; dy < this.height; dy++) {
        for (let dx = 0; dx < this.width; dx++) {
          const idx = dy * this.width + dx;
          const hp = this._cellHp[idx];
          const cx = this.x + dx;
          const cy = this.y + dy;
          const isWeak = cx === wx && cy === wy;
          if (!isWeak && hp <= 0) {
            continue;
          }
          this.cells.push({
            x: cx,
            y: cy,
            weak: isWeak,
            hp,
            _shapeIdx: idx,
          });
        }
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Advances the boss one tick: handles stagger countdown and side-to-side drift.
   * Moves 1 cell every 3 ticks; reverses direction when it would enter the arena walls.
   * Arena inner-left boundary = x:1, inner-right boundary = boardW-2 (i.e. maxX = boardW-1-width).
   *
   * @param {number} boardW — current board width (used to compute drift bounds)
   */
  update(boardW) {
    for (let i = 0; i < this._cellFlashTicks.length; i++) {
      if (this._cellFlashTicks[i] > 0) {
        this._cellFlashTicks[i]--;
      }
    }

    if (this._staggerTicks > 0) {
      this._staggerTicks--;
      return;
    }

    this._tickCounter++;
    if (this._tickCounter % 3 !== 0) {
      return;
    }

    const minX = 1;
    const maxX = boardW - 1 - this.width; // rightmost valid top-left x

    const nextX = this.x + this._direction;
    if (nextX <= minX) {
      this.x = minX;
      this._direction = 1;
    } else if (nextX >= maxX) {
      this.x = maxX;
      this._direction = -1;
    } else {
      this.x = nextX;
    }

    this._buildCells();
  }

  /**
   * Registers a hit on the boss (weak-point damage).
   * Decrements HP by 1, staggering the boss for 3 ticks.
   *
   * @returns {{ defeated: boolean }}
   */
  hit() {
    this.hp = Math.max(0, this.hp - 1);
    this._staggerTicks = 3;
    return { defeated: this.hp <= 0 };
  }

  /**
   * Damages a body cell at (cx, cy) by 1 HP.
   * At 0 HP the cell is destroyed (removed from cells array).
   *
   * @param {number} cx
   * @param {number} cy
   * @returns {{ destroyed: boolean }}
   */
  hitBodyCell(cx, cy) {
    const cell = this.cells.find((c) => c.x === cx && c.y === cy && !c.weak);
    if (!cell) {
      return { destroyed: false };
    }

    const idx = cell._shapeIdx;
    this._cellHp[idx] = Math.max(0, this._cellHp[idx] - 1);
    cell.hp = this._cellHp[idx];
    this._cellFlashTicks[idx] = 3;

    if (this._cellHp[idx] <= 0) {
      const ci = this.cells.indexOf(cell);
      if (ci >= 0) {
        this.cells.splice(ci, 1);
      }
      return { destroyed: true };
    }
    return { destroyed: false };
  }

  /**
   * Returns true if the weak point is exposed — the body cell directly south
   * of it (the cell in the player's upward line of fire) has been destroyed.
   * If the weak point has no south neighbour in the shape, it counts as exposed.
   *
   * @returns {boolean}
   */
  isWeakExposed() {
    if (this._shapeCells) {
      const weakSc = this._shapeCells.find((c) => c.weak);
      if (!weakSc) {
        return true;
      }
      for (let i = 0; i < this._shapeCells.length; i++) {
        const sc = this._shapeCells[i];
        if (sc.weak) {
          continue;
        }
        if (sc.dx === weakSc.dx && sc.dy === weakSc.dy + 1 && this._cellHp[i] > 0) {
          return false;
        }
      }
      return true;
    }

    // Fallback rectangle: check south neighbour of weak offset
    const wx = this._weakX;
    const ny = this._weakY + 1;
    if (wx >= 0 && wx < this.width && ny >= 0 && ny < this.height) {
      const idx = ny * this.width + wx;
      if (this._cellHp[idx] > 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns the current board-space position of the weak point.
   * Use this instead of hardcoding offsets — the weak point shifts as the
   * boss drifts and differs per boss shape.
   *
   * @returns {{ x: number, y: number }}
   */
  getWeakPoint() {
    return { x: this.x + this._weakX, y: this.y + this._weakY };
  }

  /**
   * Returns true if (cx, cy) is the boss's designated weak point AND the
   * weak point is currently exposed (adjacent armor destroyed).
   *
   * @param {number} cx
   * @param {number} cy
   * @returns {boolean}
   */
  isWeakCell(cx, cy) {
    if (cx !== this.x + this._weakX || cy !== this.y + this._weakY) {
      return false;
    }
    return this.isWeakExposed();
  }

  /**
   * Returns true if (cx, cy) falls within any cell of the boss body
   * (including the weak point, even when shielded).
   *
   * @param {number} cx
   * @param {number} cy
   * @returns {boolean}
   */
  isBodyCell(cx, cy) {
    return this.cells.some((c) => c.x === cx && c.y === cy);
  }

  /**
   * Returns the full cells array for rendering.
   *
   * @returns {Array<{ x: number, y: number, weak: boolean, hp: number, _shapeIdx: number }>}
   */
  getCells() {
    return this.cells;
  }
}
