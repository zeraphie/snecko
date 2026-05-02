// player-bullets.js — Player bullet spawning, movement, and collision

/**
 * Spawns a player bullet at the tip of the plane, travelling in the facing
 * direction. Appends the new bullet to game._playerBullets.
 *
 * @param {import('../game/index.js').Game} game
 */
export function spawnPlayerBullet(game) {
  const { playerX, playerY } = game.grid;
  const { dx, dy } = game._playerFacing;

  // Spawn one cell ahead of the tip so it doesn't overlap the plane
  game._playerBullets.push({
    x: playerX + dx,
    y: playerY + dy,
    dx,
    dy,
  });
}

/**
 * Advances every player bullet by one cell. Removes bullets that leave the
 * grid or hit a wall. If `driftCells` is provided, a bullet that lands on
 * one of them takes one extra step in that cell's flow direction —
 * symmetry with boss projectiles inside The Algorithm's current band.
 *
 * @param {Array<{x: number, y: number, dx: number, dy: number}>} bullets
 * @param {import('../grid/index.js').Grid} grid
 * @param {Array<{x:number, y:number, flowDx:number, flowDy:number}> | null} [driftCells]
 */
export function updatePlayerBullets(bullets, grid, driftCells = null) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dx;
    b.y += b.dy;
    if (!grid.isInBounds(b.x, b.y) || grid.isWallCell(b.x, b.y)) {
      bullets.splice(i, 1);
      continue;
    }
    if (driftCells) {
      const drift = findDriftCell(driftCells, b.x, b.y);
      if (drift) {
        b.x += drift.flowDx;
        b.y += drift.flowDy;
        if (!grid.isInBounds(b.x, b.y) || grid.isWallCell(b.x, b.y)) {
          bullets.splice(i, 1);
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
 * Checks each player bullet against boss cells. Returns a summary of hits
 * and the indices of bullets that connected (for removal by the caller).
 *
 * A bullet that hits the weak point counts as a weakHit.
 * A bullet that hits any other boss body cell counts as a bodyHit.
 * A bullet that misses entirely is ignored.
 *
 * @param {Array<{x: number, y: number, dx: number, dy: number}>} bullets
 * @param {import('./entity.js').BossEntity} boss
 * @returns {{ weakHits: number, bodyHits: Array<{x: number, y: number}>, hitIndices: number[] }}
 */
export function checkPlayerBulletCollision(bullets, boss) {
  let weakHits = 0;
  const bodyHits = [];
  const hitIndices = [];

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (boss.isWeakCell(b.x, b.y)) {
      weakHits++;
      hitIndices.push(i);
    } else if (boss.isBodyCell(b.x, b.y)) {
      bodyHits.push({ x: b.x, y: b.y });
      hitIndices.push(i);
    }
  }

  return { weakHits, bodyHits, hitIndices };
}

/**
 * Removes bullets at the given indices (must be sorted descending or
 * at least processed in reverse order to avoid index shifting).
 *
 * @param {Array<{x: number, y: number, dx: number, dy: number}>} bullets
 * @param {number[]} indices — indices to remove (reverse-order safe)
 */
export function removeHitBullets(bullets, indices) {
  for (const i of indices) {
    bullets.splice(i, 1);
  }
}
