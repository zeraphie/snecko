// soulslike/fighter-dodge-active.js — iframe window of a dodge roll.
//
// Cyan body signals invulnerability. The silhouette stays readable so
// the player can track where the roll is heading.

import { CELL_FIGHTER_DODGE_ACTIVE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { CYAN } from "../../../../render/terminal/palette.js";
import { drawFighterSilhouette } from "./_fighter-silhouette.js";

const BODY = "#00e5ff";
const EYE = "#003040";
const HEAD_GLYPHS = {
  "0,-1": "▲▲",
  "0,1": "▼▼",
  "-1,0": "◀◀",
  "1,0": "▶▶",
};

defineCell(CELL_FIGHTER_DODGE_ACTIVE, {
  render(x, y, context) {
    const facing = context?.facing ?? { dx: 0, dy: -1 };
    const key = facing.dx + "," + facing.dy;
    activeRenderer.cell(x, y, {
      glyph: HEAD_GLYPHS[key] ?? "◆◆",
      glyphColor: CYAN,
      detailed: (ctx, px, py, cs) => {
        drawFighterSilhouette(ctx, px, py, cs, facing, BODY, EYE);
      },
    });
  },
});
