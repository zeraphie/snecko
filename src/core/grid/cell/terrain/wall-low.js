// terrain/wall-low.js — CELL_WALL_LOW: low-terrain wall.

import { CELL_WALL_LOW } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { BROWN } from "../../../../render/terminal/palette.js";

defineCell(CELL_WALL_LOW, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#7A5529",
      glyph: "▒▒",
      glyphColor: BROWN,
    });
  },
});
