// soulslike/fighter-dodge-recovery.js — post-dodge action lockout.
//
// Desaturated body — the snake can't act yet. Silhouette stays the
// same shape so the player can read orientation as they wait.

import { CELL_FIGHTER_DODGE_RECOVERY } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { DIM_CYAN } from "../../../../render/terminal/palette.js";
import { drawFighterSilhouette } from "./_fighter-silhouette.js";

const BODY = "#3a7a8a";
const EYE = "#11252a";
const HEAD_GLYPHS = {
  "0,-1": "▲▲",
  "0,1": "▼▼",
  "-1,0": "◀◀",
  "1,0": "▶▶",
};

defineCell(CELL_FIGHTER_DODGE_RECOVERY, {
  render(x, y, context) {
    const facing = context?.facing ?? { dx: 0, dy: -1 };
    const key = facing.dx + "," + facing.dy;
    activeRenderer.cell(x, y, {
      glyph: HEAD_GLYPHS[key] ?? "◆◆",
      glyphColor: DIM_CYAN,
      detailed: (ctx, px, py, cs) => {
        drawFighterSilhouette(ctx, px, py, cs, facing, BODY, EYE);
      },
    });
  },
});
