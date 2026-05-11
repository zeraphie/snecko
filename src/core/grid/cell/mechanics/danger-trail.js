// mechanics/danger-trail.js — CELL_DANGER_TRAIL: trail of cells the boss
// has recently passed through (Catacombs Chaser leaves these behind).

import { CELL_DANGER_TRAIL } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { ORANGE } from "../../../../render/terminal/palette.js";

const COLOR = "#ff8c00";
const PULSE_HZ = 8.0;
const DIM_AMBER = "\x1b[38;5;130m";

defineCell(CELL_DANGER_TRAIL, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: "▒▒",
      glyphColor: bright ? ORANGE : DIM_AMBER,
      detailed: (ctx, px, py, cs) => {
        const alpha = 0.4 + 0.3 * Math.abs(Math.sin(t * PULSE_HZ));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLOR;
        ctx.fillRect(px, py, cs, cs);
        ctx.globalAlpha = 1;
      },
    });
  },
});
