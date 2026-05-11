// boss/body.js — CELL_BOSS_BODY: bullet-hell boss body cell, flat purple.

import { CELL_BOSS_BODY } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { MAGENTA } from "../../../../render/terminal/palette.js";
import { BOSS_PURPLE } from "../palette.js";

defineCell(CELL_BOSS_BODY, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: BOSS_PURPLE,
      glyph: "██",
      glyphColor: MAGENTA,
    });
  },
});
