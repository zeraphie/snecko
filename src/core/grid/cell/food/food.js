// food/food.js — CELL_FOOD: yellow pulsing pentagon.

import { CELL_FOOD } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { YELLOW } from "../../../../render/terminal/palette.js";
import { drawPentagon } from "./_pentagon.js";

const COLOR = "#f1c40f";
const PULSE_HZ = 2.5;
const DIM_YELLOW = "\x1b[33m";

defineCell(CELL_FOOD, {
  render(x, y) {
    // Pulse phase shared by canvas alpha + terminal bright/dim flicker
    // so both renderers stay in sync without reading renderer state.
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: "◎◎",
      glyphColor: bright ? YELLOW : DIM_YELLOW,
      detailed: (ctx, px, py, cs) => drawPentagon(ctx, px, py, cs, COLOR, PULSE_HZ, t),
    });
  },
});
