// brood/memorial-mound.js — CELL_KIN_MEMORIAL_MOUND: dead kin body
// cell.
//
// Placeholder visual — flat colored square in the snake style. A
// dedicated visual-design pass replaces these later.

import { CELL_KIN_MEMORIAL_MOUND } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { DARK_BROWN } from "../../../../render/terminal/palette.js";

defineCell(CELL_KIN_MEMORIAL_MOUND, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#5a4632",
      glyph: "▓▓",
      glyphColor: DARK_BROWN,
    });
  },
});
