// food/red-food.js — CELL_RED_FOOD: red boss-progress food, faster pulse.

import { CELL_RED_FOOD } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { RED } from "../../../../render/terminal/palette.js";
import { drawPentagon } from "./_pentagon.js";

const COLOR = "#e74c3c";
const PULSE_HZ = 4.0;
const DIM_RED = "\x1b[31m";

defineCell(CELL_RED_FOOD, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: "◎◎",
      glyphColor: bright ? RED : DIM_RED,
      detailed: (ctx, px, py, cs) => drawPentagon(ctx, px, py, cs, COLOR, PULSE_HZ, t),
    });
  },
});
