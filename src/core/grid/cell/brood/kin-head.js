// brood/kin-head.js — CELL_KIN_ALIVE_HEAD: alive kin head cell.
//
// Placeholder visual — flat colored square in the snake style. A
// dedicated visual-design pass replaces these later. Head reads as a
// brighter shade of the body's hue so the player can spot which cell
// of a shape will host the gravestone on death (D7).

import { CELL_KIN_ALIVE_HEAD } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { MAGENTA } from "../../../../render/terminal/palette.js";

defineCell(CELL_KIN_ALIVE_HEAD, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#f06bd0",
      glyph: "▓▓",
      glyphColor: MAGENTA,
    });
  },
});
