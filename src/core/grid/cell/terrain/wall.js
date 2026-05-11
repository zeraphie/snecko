// terrain/wall.js — CELL_WALL: standard impassable wall.

import { CELL_WALL } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { BROWN } from "../../../../render/terminal/palette.js";

defineCell(CELL_WALL, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#5C3D11",
      glyph: "██",
      glyphColor: BROWN,
    });
  },
});
