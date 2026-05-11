// food/telegraph.js — CELL_TELEGRAPH: dim warning cell (used by The Algorithm
// before currents flow). Flat color on canvas; dim glyph on terminal.

import { CELL_TELEGRAPH } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { DIM } from "../../../../render/terminal/palette.js";

defineCell(CELL_TELEGRAPH, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#555566",
      glyph: "░░",
      glyphColor: DIM,
    });
  },
});
