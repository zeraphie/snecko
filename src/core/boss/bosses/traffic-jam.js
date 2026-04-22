// traffic-jam.js — Traffic Jam (crystalline boss)
//
// Mechanic: "Crystal Rain"
// Spawns temporary crystal pillars (cover) + a wide fan of projectiles.
// Pillars use anchor_lock type so they render as amber, auto-expire, and
// can be cleared by charging through — acting as cover from the fan.
// Pillar count and fan width scale with boss phase.

import { BOSS_PHASE_2 } from "../../game/constants.js";

/** How long crystal pillars persist before expiring automatically (boss ticks). */
const PILLAR_DURATION = 15;

/** Pillar height in cells. */
const PILLAR_HEIGHT = 2;

/**
 * @param {import('../../game/index.js').Game} game
 */
function special(game) {
  const board = game.board;
  const boss = game._boss;
  const phase = game._fight.phase;

  // -- Crystal pillars (cover) --
  const pillarCount = phase >= BOSS_PHASE_2 ? 3 : 2;
  const minY = boss.y + boss.height + 3;
  const maxY = board.height - 6;
  const minX = 3;
  const maxX = board.width - 4;

  if (minY < maxY && minX < maxX) {
    const cells = [];
    for (let p = 0; p < pillarCount; p++) {
      const px = minX + Math.floor(Math.random() * (maxX - minX));
      const py = minY + Math.floor(Math.random() * (maxY - minY - PILLAR_HEIGHT));
      for (let h = 0; h < PILLAR_HEIGHT; h++) {
        const cy = py + h;
        if (
          board.isInBounds(px, cy) &&
          !board.isWallCell(px, cy) &&
          !boss.isBodyCell(px, cy) &&
          !boss.isWeakCell(px, cy)
        ) {
          board.setCell("wall", px, cy);
          cells.push({ x: px, y: cy });
        }
      }
    }
    if (cells.length > 0) {
      game._bossModifiers.push({
        type: "anchor_lock",
        cells,
        ticksLeft: PILLAR_DURATION,
      });
    }
  }

  // -- Projectile fan from boss bottom edge --
  const fanSize = phase >= BOSS_PHASE_2 ? 7 : 5;
  const fireY = boss.y + boss.height;
  const centerX = boss.x + Math.floor(boss.width / 2);
  const halfFan = Math.floor(fanSize / 2);

  for (let i = -halfFan; i <= halfFan; i++) {
    const fx = centerX + i;
    if (board.isInBounds(fx, fireY)) {
      game._projectiles.push({ x: fx, y: fireY, dx: 0, dy: 1 });
    }
  }
}

/**
 * @type {import('./index.js').BossDef}
 */
export default {
  id: "traffic_jam",
  name: "Traffic Jam",
  maxHp: 12,
  width: 0,
  height: 0,
  shape: null,
  arena: "Pillars",
  shapeFile: "traffic-jam",
  special,
};
