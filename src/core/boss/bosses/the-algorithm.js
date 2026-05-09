// the-algorithm.js — The Algorithm (wildlands boss)
//
// Mechanic: an `algorithm_current` modifier — a winding, river-shaped
// current that runs horizontally through the band above the player. The
// same FBM walker the wildlands stage uses (`generation/wildlands/river.js`),
// constrained so the river never overlaps the player's row: without
// `snake_hungry` the player physically can't enter it. The hazard the
// player has to deal with is the boss's bullets curving through the
// river on their way down.
//
// Mini-cycle: spawn in `telegraph` (visible, no drift), advance to
// `flow` (drifts player + bullets per cell's flow vector), then expire.

import { generateRiver } from "../../generation/wildlands/river.js";
import { splitmix32 } from "../../rng.js";

/** Boss ticks the river spends warning before it activates. */
const TELEGRAPH_TICKS = 4;
/** Boss ticks the river is active and drifting. */
const FLOW_TICKS = 8;

/**
 * @param {import('../../game/index.js').Game} game
 */
function special(game) {
  const grid = game.grid;
  const boss = game._boss;

  // Constrain the river to the band strictly above the player's current
  // row, below the boss's body. Player can't drift if they can't reach
  // the river — the threat is the bent bullets.
  const minLateral = boss.y + boss.height + 1;
  const maxLateral = grid.playerY - 1;
  if (minLateral > maxLateral) {
    return;
  }

  const seed = (Math.random() * 0x7fffffff) | 0;
  const rand = splitmix32(seed);
  const cells = generateRiver({
    grid,
    axis: 0,
    seed,
    rand,
    minLateral,
    maxLateral,
  });
  if (cells.length === 0) {
    return;
  }

  game._bossModifiers.push({
    type: "algorithm_current",
    cells,
    state: "telegraph",
    ticksLeft: TELEGRAPH_TICKS + FLOW_TICKS,
    driftActive: false,
  });
}

/**
 * @type {import('./index.js').BossDef}
 */
export default {
  id: "the_algorithm",
  style: "bullet_hell",
  maxHp: 12,
  width: 0,
  height: 0,
  shape: null,
  arena: "Box",
  shapeFile: "the-algorithm",
  special,
};

export { TELEGRAPH_TICKS, FLOW_TICKS };
