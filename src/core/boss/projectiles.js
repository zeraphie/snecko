// projectiles.js — Projectile spawning, movement, and collision for boss fights

/**
 * Creates a single aimed projectile travelling from (fromX, fromY) toward
 * (toX, toY).  Direction is quantised to a cardinal or diagonal unit vector.
 * Returns null if source and target share the same position (nothing to aim at).
 *
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @returns {{ x: number, y: number, dx: number, dy: number } | null}
 */
export function fireAimed(fromX, fromY, toX, toY) {
  const dx = toX === fromX ? 0 : toX > fromX ? 1 : -1;
  const dy = toY === fromY ? 0 : toY > fromY ? 1 : -1;
  if (dx === 0 && dy === 0) {
    return null;
  }
  return { x: fromX, y: fromY, dx, dy };
}

/**
 * Advances every active projectile by one cell and removes any that leave the
 * grid boundary or land on a wall cell. If `driftCells` is provided, a
 * projectile that lands on one of them takes one extra step in that cell's
 * flow direction (`flowDx`, `flowDy`) — used by The Algorithm boss to bend
 * straight shots through its current band.
 *
 * @param {Array<{x:number, y:number, dx:number, dy:number}>} projectiles
 * @param {import('../grid/index.js').Grid} grid
 * @param {Array<{x:number, y:number, flowDx:number, flowDy:number}> | null} [driftCells]
 */
export function updateProjectiles(projectiles, grid, driftCells = null) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.dx;
    p.y += p.dy;
    if (!grid.isInBounds(p.x, p.y) || grid.isWallCell(p.x, p.y)) {
      projectiles.splice(i, 1);
      continue;
    }
    if (driftCells) {
      const drift = findDriftCell(driftCells, p.x, p.y);
      if (drift) {
        p.x += drift.flowDx;
        p.y += drift.flowDy;
        if (!grid.isInBounds(p.x, p.y) || grid.isWallCell(p.x, p.y)) {
          projectiles.splice(i, 1);
        }
      }
    }
  }
}

function findDriftCell(driftCells, x, y) {
  for (let i = 0; i < driftCells.length; i++) {
    const c = driftCells[i];
    if (c.x === x && c.y === y) {
      return c;
    }
  }
  return null;
}

/**
 * Returns true if any projectile occupies a cell that also appears in
 * playerCells (the 6-cell plane from getPlayerCells).
 *
 * All six cells form the hitbox — not just the tip.
 *
 * @param {Array<{x:number, y:number}>} projectiles
 * @param {Array<{x:number, y:number}>} playerCells
 * @returns {boolean}
 */
export function checkProjectileCollision(projectiles, playerCells) {
  for (const p of projectiles) {
    for (const c of playerCells) {
      if (p.x === c.x && p.y === c.y) {
        return true;
      }
    }
  }
  return false;
}
