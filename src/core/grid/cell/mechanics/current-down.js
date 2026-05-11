// mechanics/current-down.js — CELL_CURRENT_DOWN: downward flow arrow.

import { CELL_CURRENT_DOWN } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { CYAN, DIM_CYAN } from "../../../../render/terminal/palette.js";
import { drawArrow } from "./_arrow.js";

defineCell(CELL_CURRENT_DOWN, {
  render(x, y) {
    const t = Date.now() / 1000;
    const phase = Math.sin(t * 3.5 - y * 0.8);
    const bright = phase > 0;
    activeRenderer.cell(x, y, {
      glyph: "↓↓",
      glyphColor: bright ? CYAN : DIM_CYAN,
      detailed: (ctx, px, py, cs) => drawArrow(ctx, px, py, cs, "down", 0.3 + 0.25 * phase),
    });
  },
});
