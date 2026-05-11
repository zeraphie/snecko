// soulslike/fighter-parry.js — parry window (2 ticks).
//
// Gold body signals "parry timing now" against the same silhouette
// shape as idle/stab — visual cue that says "this is still you,
// committed to a parry."

import { CELL_FIGHTER_PARRY_ACTIVE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { ORANGE } from "../../../../render/terminal/palette.js";
import { drawFighterSilhouette } from "./_fighter-silhouette.js";

const BODY = "#ffaa00";
const EYE = "#5a3500";
const HEAD_GLYPHS = {
  "0,-1": "▲▲",
  "0,1": "▼▼",
  "-1,0": "◀◀",
  "1,0": "▶▶",
};

defineCell(CELL_FIGHTER_PARRY_ACTIVE, {
  render(x, y, context) {
    const facing = context?.facing ?? { dx: 0, dy: -1 };
    const key = facing.dx + "," + facing.dy;
    activeRenderer.cell(x, y, {
      glyph: HEAD_GLYPHS[key] ?? "◆◆",
      glyphColor: ORANGE,
      detailed: (ctx, px, py, cs) => {
        drawFighterSilhouette(ctx, px, py, cs, facing, BODY, EYE);
      },
    });
  },
});
