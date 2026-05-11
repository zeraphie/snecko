// boss/weak.js — CELL_BOSS_WEAK: pulsing weak-point cell (boss damage spot).

import { CELL_BOSS_WEAK } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { YELLOW } from "../../../../render/terminal/palette.js";

const COLOR = "#f39c12";
const PULSE_HZ = 5.0;
const DIM_YELLOW = "\x1b[33m";

defineCell(CELL_BOSS_WEAK, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: "◈◈",
      glyphColor: bright ? YELLOW : DIM_YELLOW,
      detailed: (ctx, px, py, cs) => {
        const alpha = 0.6 + 0.4 * Math.sin(t * PULSE_HZ);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLOR;
        ctx.fillRect(px, py, cs, cs);
        ctx.globalAlpha = 1;
      },
    });
  },
});
