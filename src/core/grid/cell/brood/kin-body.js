// brood/kin-body.js — CELL_KIN_ALIVE_BODY: alive kin body cell.
//
// Placeholder visual — flat colored square in the snake style. A
// dedicated visual-design pass replaces these later.

import { CELL_KIN_ALIVE_BODY } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { MAGENTA, DIM } from "../../../../render/terminal/palette.js";

defineCell(CELL_KIN_ALIVE_BODY, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#a93b8a",
      glyph: "▓▓",
      glyphColor: DIM + MAGENTA,
    });
  },
});
