// terrain/wall-high.js — CELL_WALL_HIGH: wildlands high terrain (darker).

import { CELL_WALL_HIGH } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { DARK_BROWN } from "../../../../render/terminal/palette.js";

defineCell(CELL_WALL_HIGH, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#3A2510",
      glyph: "██",
      glyphColor: DARK_BROWN,
    });
  },
});
