// soulslike/fighter-idle.js — CELL_FIGHTER_IDLE: snake fighter at rest.
//
// Canvas: body+arms circles + small forward eye for facing (same
// silhouette family as Hissalia). Terminal: directional arrow glyph
// so orientation reads in ANSI mode.

import { CELL_FIGHTER_IDLE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { GREEN } from "../../../../render/terminal/palette.js";
import { drawFighterSilhouette } from "./_fighter-silhouette.js";

const BODY = "#27ae60";
const EYE = "#0f3d1f";
const HEAD_GLYPHS = {
  "0,-1": "▲▲",
  "0,1": "▼▼",
  "-1,0": "◀◀",
  "1,0": "▶▶",
};

defineCell(CELL_FIGHTER_IDLE, {
  render(x, y, context) {
    const facing = context?.facing ?? { dx: 0, dy: -1 };
    const key = facing.dx + "," + facing.dy;
    activeRenderer.cell(x, y, {
      glyph: HEAD_GLYPHS[key] ?? "◆◆",
      glyphColor: GREEN,
      detailed: (ctx, px, py, cs) => {
        drawFighterSilhouette(ctx, px, py, cs, facing, BODY, EYE);
      },
    });
  },
});
