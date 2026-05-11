// boss/exhaust.js — CELL_EXHAUST: random fire flicker (player plane trail).

import { CELL_EXHAUST } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { ORANGE } from "../../../../render/terminal/palette.js";

const PULSE_HZ = 6.0;
const DIM_ORANGE = "\x1b[38;5;130m";

defineCell(CELL_EXHAUST, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: bright ? "▒▒" : "░░",
      glyphColor: bright ? ORANGE : DIM_ORANGE,
      detailed: (ctx, px, py, cs) => {
        // Per-frame randomness gives the flame a flickery, non-uniform feel
        // rather than a smooth sin-pulse.
        const alpha = 0.4 + 0.6 * Math.random();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = Math.random() > 0.5 ? "#e67e22" : "#e74c3c";
        ctx.fillRect(px, py, cs, cs);
        ctx.globalAlpha = 1;
      },
    });
  },
});
