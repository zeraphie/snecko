// soulslike/fighter-stab.js — CELL_FIGHTER_STAB_ACTIVE: 1-tick stab.
//
// Yellow flash on the body+arms silhouette during the active stab tick.

import { CELL_FIGHTER_STAB_ACTIVE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { YELLOW } from "../../../../render/terminal/palette.js";
import { drawFighterSilhouette } from "./_fighter-silhouette.js";

const BODY = "#f1c40f";
const EYE = "#5a4500";
const HEAD_GLYPHS = {
  "0,-1": "▲▲",
  "0,1": "▼▼",
  "-1,0": "◀◀",
  "1,0": "▶▶",
};

defineCell(CELL_FIGHTER_STAB_ACTIVE, {
  render(x, y, context) {
    const facing = context?.facing ?? { dx: 0, dy: -1 };
    const key = facing.dx + "," + facing.dy;
    activeRenderer.cell(x, y, {
      glyph: HEAD_GLYPHS[key] ?? "◆◆",
      glyphColor: YELLOW,
      detailed: (ctx, px, py, cs) => {
        drawFighterSilhouette(ctx, px, py, cs, facing, BODY, EYE);
      },
    });
  },
});
