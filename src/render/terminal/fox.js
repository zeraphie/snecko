// fox.js — Terminal overlay for the fox cutscene.
//
// Phase/position math lives in `core/animation/fox-phase.js`. This
// file only stamps the sprite into the renderer's cell buffer at
// integer cell coordinates (terminal grids have no sub-cell precision,
// so the arc bobs appear as gentle hops).

import { ORANGE, RESET } from "./palette.js";
import { FOX_DURATION_MS } from "../../core/upgrades/consumables/fox.js";
import { computeFoxFrame } from "../../core/animation/fox-phase.js";

// One cell in the terminal is two characters wide; stamping the fox uses
// the same double-glyph convention as walls / boss cells.
const SOLID_CELL_GLYPH = "██";

/**
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {import('../../core/game/index.js').Game} game
 */
export function drawFoxAnim(r, game) {
  const anim = game._foxAnim;
  if (!anim) {
    return;
  }
  const animData = game.manifest?.animations?.fox?.terminal;
  if (!animData) {
    return;
  }

  const elapsed = Date.now() - anim.startTime;
  const info = computeFoxFrame(anim, elapsed, FOX_DURATION_MS, r._w, r._h);
  const frame = animData.frames[info.frameName];
  if (!frame) {
    return;
  }

  const topLeftX = Math.round(info.x - frame.width / 2);
  const topLeftY = Math.round(info.y - frame.height / 2);

  const stamp = ORANGE + SOLID_CELL_GLYPH + RESET;
  for (let py = 0; py < frame.height; py++) {
    const gy = topLeftY + py;
    if (gy < 0 || gy >= r._h) {
      continue;
    }
    const row = frame.rows[py];
    for (let px = 0; px < frame.width; px++) {
      const gx = topLeftX + px;
      if (gx < 0 || gx >= r._w) {
        continue;
      }
      if (row[px] === "█") {
        r._grid[gy][gx] = stamp;
      }
    }
  }
}
