// catacombs-chaser.js — The Roomba (catacombs boss)
//
// Style: survival. A 2×2 blob (matching catacombs corridor width) chases
// the snake through the maze via BFS. No HP, no projectiles, no weak
// point — win by surviving the full duration; lose if any blob cell
// touches any snake cell. Logic lives in core/boss/styles/survival.js.

import { generateCatacombsGrid } from "../../generation/catacombs/generator.js";

/**
 * @type {import('./index.js').BossDef}
 */
export default {
  id: "catacombs_chaser",
  style: "survival",
  // Practice-mode bootstrap: builds a fresh catacombs maze + snake spawn
  // when survival.setup detects an uninitialised snake. Skipped in
  // production catacombs runs (snake already on the maze).
  //
  // Rolls a fresh actSeed each call so repeated practice picks (boss
  // picker → Roomba, boss picker → Roomba) get different mazes.
  // Production runs already roll actSeed in startRun().
  bootGrid: (game) => {
    game.actSeed = ((Math.random() * 0x100000000) | 0) >>> 0;
    generateCatacombsGrid(game);
  },
};
