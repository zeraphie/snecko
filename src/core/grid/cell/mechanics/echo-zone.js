// mechanics/echo-zone.js — CELL_ECHO_ZONE: zone where snake input echoes
// (delayed-action mechanic).

import { CELL_ECHO_ZONE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";

const COLOR = "#27ae60";
const PULSE_HZ = 5.0;
const BRIGHT_GREEN = "\x1b[38;5;34m";
const DIM_GREEN = "\x1b[38;5;22m";

defineCell(CELL_ECHO_ZONE, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: "▒▒",
      glyphColor: bright ? BRIGHT_GREEN : DIM_GREEN,
      detailed: (ctx, px, py, cs) => {
        const alpha = 0.25 + 0.2 * Math.abs(Math.sin(t * PULSE_HZ));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLOR;
        ctx.fillRect(px, py, cs, cs);
        ctx.globalAlpha = 1;
      },
    });
  },
});
