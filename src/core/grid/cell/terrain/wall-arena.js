// terrain/wall-arena.js — CELL_WALL_ARENA: boss-arena perimeter wall.

import { CELL_WALL_ARENA } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { DARK_RED } from "../../../../render/terminal/palette.js";

defineCell(CELL_WALL_ARENA, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#3d1a3d",
      glyph: "▒▒",
      glyphColor: DARK_RED,
    });
  },
});
