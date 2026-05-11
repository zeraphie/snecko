// mechanics/current-right.js — CELL_CURRENT_RIGHT: rightward flow arrow.

import { CELL_CURRENT_RIGHT } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { CYAN, DIM_CYAN } from "../../../../render/terminal/palette.js";
import { drawArrow } from "./_arrow.js";

defineCell(CELL_CURRENT_RIGHT, {
  render(x, y) {
    // Flow-aware phase: pulse rolls along the river so neighbouring
    // cells appear to push downstream rather than blink in unison.
    const t = Date.now() / 1000;
    const phase = Math.sin(t * 3.5 - x * 0.8);
    const bright = phase > 0;
    activeRenderer.cell(x, y, {
      glyph: "»»",
      glyphColor: bright ? CYAN : DIM_CYAN,
      detailed: (ctx, px, py, cs) => drawArrow(ctx, px, py, cs, "right", 0.3 + 0.25 * phase),
    });
  },
});
