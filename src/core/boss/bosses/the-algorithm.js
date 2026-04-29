// the-algorithm.js — The Algorithm (wildlands boss)
//
// Mechanic: "Force Zone"
// Activates a directional push zone covering roughly half the arena between
// the boss and the player.  The half is chosen based on the player's current
// position so it always catches them off-guard.  Any tick the player stands
// inside the zone (moving or still) they are pushed one extra cell in the
// zone's direction — mirroring wildlands currents but as a sudden combat hazard.

/** How long the push zone stays active (boss ticks). */
const CURRENT_DURATION = 12;

/**
 * @param {import('../../game/index.js').Game} game
 */
function special(game) {
  const board = game.board;
  const boss = game._boss;

  // Zone occupies the area between the boss bottom and player top
  const zoneTop = boss.y + boss.height + 2;
  const zoneBottom = Math.min(board.playerY - 4, board.height - 6);
  if (zoneTop > zoneBottom) {
    return;
  }

  // Roughly half the inner arena width (~14 cells)
  const halfW = Math.floor((board.width - 2) / 2);

  let zoneLeft, zoneRight, dx;
  if (board.playerX < board.width / 2) {
    // Player is on the left side — fill the left half, push right
    zoneLeft = 1;
    zoneRight = zoneLeft + halfW - 1;
    dx = 1;
  } else {
    // Player is on the right side — fill the right half, push left
    zoneRight = board.width - 2;
    zoneLeft = zoneRight - halfW + 1;
    dx = -1;
  }

  const cells = [];
  for (let y = zoneTop; y <= zoneBottom; y++) {
    for (let x = zoneLeft; x <= zoneRight; x++) {
      if (!board.isWallCell(x, y) && !boss.isBodyCell(x, y)) {
        cells.push({ x, y });
      }
    }
  }

  if (cells.length > 0) {
    game._bossModifiers.push({
      type: "sovereign_current",
      cells,
      ticksLeft: CURRENT_DURATION,
      dx,
      dy: 0,
    });
  }
}

/**
 * @type {import('./index.js').BossDef}
 */
export default {
  id: "the_algorithm",
  name: "The Algorithm",
  maxHp: 12,
  width: 0,
  height: 0,
  shape: null,
  arena: "Box",
  shapeFile: "the-algorithm",
  special,
};
