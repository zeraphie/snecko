// hissalia.js — Hissalia, Blade of Wormwood (soulslike boss)
//
// Style: soulslike. Souls/Sekiro-flavoured melee fight; not wired to
// any mutation in v1, accessible via the boss picker only. Logic
// lives in core/boss/styles/soulslike/. See PLAN.soulslike-adr.md
// for the full design.

import { setUpArena } from "../styles/soulslike/arena.js";

/**
 * @type {import('./index.js').BossDef}
 */
export default {
  id: "hissalia",
  style: "soulslike",
  // Wall layout + scenery markers (tree, gravestones, flowers) live
  // in assets/arenas/hissalia.arena → "Hissalia". setUpArena loads it
  // via the manifest and the arena parser bakes the scenery regions
  // into the grid; the soulslike screen renderer dispatches each
  // region by type/size when drawing the fight.
  arena: "Hissalia",
  bootGrid: setUpArena,
};
