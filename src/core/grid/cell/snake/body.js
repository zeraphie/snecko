// snake/body.js — CELL_SNAKE: snake body segment, flat green.

import { CELL_SNAKE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { GREEN } from "../../../../render/terminal/palette.js";

defineCell(CELL_SNAKE, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#27ae60",
      glyph: "▓▓",
      glyphColor: GREEN,
    });
  },
});
