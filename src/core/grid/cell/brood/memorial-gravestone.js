// brood/memorial-gravestone.js — CELL_KIN_MEMORIAL_GRAVESTONE: dead
// kin head cell.
//
// Placeholder visual — flat colored square in the snake style. A
// dedicated visual-design pass replaces these later. The kin's name
// surfaces via Reginald's speech bubble at the moment of death (D7),
// not as text on the stone.

import { CELL_KIN_MEMORIAL_GRAVESTONE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { DIM, WHITE } from "../../../../render/terminal/palette.js";

defineCell(CELL_KIN_MEMORIAL_GRAVESTONE, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#8a8680",
      glyph: "▓▓",
      glyphColor: DIM + WHITE,
    });
  },
});
