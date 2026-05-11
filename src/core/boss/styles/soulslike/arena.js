// arena.js — Soulslike arena: parses + applies the boss def's .arena
// entry, then exposes the parsed scenery regions for the renderer.
//
// Soulslike has no host mutation (D2) — the arena is laid from
// scratch each time the fight starts. The wall layout AND the
// scenery layout (tree, gravestones, flowers) both come from the
// .arena file referenced by the boss def (e.g.
// `assets/arenas/hissalia.arena` → "Hissalia"). The arena parser
// detects connected scenery regions for size-aware rendering; we
// just stash that list on the game state for the screen layer to
// dispatch.
//
// Boss position is stored on the soulslike state slot by setup();
// the boss isn't drawn via cell masks (Step 11+ renders it
// procedurally inside its 2×2 footprint).

import { applyArena } from "../../arena.js";
import { SNAKE_SPAWN_X, SNAKE_SPAWN_Y, SNAKE_SPAWN_DX, SNAKE_SPAWN_DY } from "./constants.js";

/**
 * Lays the soulslike arena and spawns the snake fighter. Idempotent —
 * safe to call repeatedly per fight entry.
 *
 * @param {import('../../../game/index.js').Game} game
 * @param {import('../../bosses/index.js').BossDef} def
 */
export function setUpArena(game, def) {
  const grid = game.grid;

  // Pull the named arena out of the parsed manifest. Fall back to
  // the first arena so we never crash during boot — mirrors
  // bullet-hell's behaviour.
  const arenas = game.manifest?.arenas ?? [];
  const arena = arenas.find((a) => a.name === def?.arena) ?? arenas[0];
  if (!arena) {
    throw new Error("soulslike setUpArena: no arena available in manifest");
  }
  applyArena(grid, arena);

  // Hand the parsed scenery regions to the render layer. The arena
  // parser flagged blocking scenery as walls already, so collision
  // works without anything else here.
  game._arenaScenery = arena.scenery ?? [];

  // Spawn the snake as a length-1 fighter (no body, per D3). We use
  // the soulslike spawn constants rather than arena.snakeSpawn so
  // the position is consistent regardless of which .arena layout
  // the fight uses.
  game.snake.init(grid, SNAKE_SPAWN_X, SNAKE_SPAWN_Y, 1, SNAKE_SPAWN_DX, SNAKE_SPAWN_DY);
}
