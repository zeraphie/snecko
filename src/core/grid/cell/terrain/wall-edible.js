// terrain/wall-edible.js — CELL_WALL_LOW_EDIBLE: low wall while Iron Jaw is active.

import { CELL_WALL_LOW_EDIBLE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { BRIGHT_AMBER } from "../../../../render/terminal/palette.js";

defineCell(CELL_WALL_LOW_EDIBLE, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#D9A95C",
      glyph: "▒▒",
      glyphColor: BRIGHT_AMBER,
    });
  },
});
