// boss/damaged.js — CELL_BOSS_DAMAGED: damaged body cell (per-cell HP < bodyHp).

import { CELL_BOSS_DAMAGED } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { MAGENTA } from "../../../../render/terminal/palette.js";

const COLOR = "#6a2d8e";
const PULSE_HZ = 4.0;
const DIM_MAGENTA = "\x1b[35m";

defineCell(CELL_BOSS_DAMAGED, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: "▒▒",
      glyphColor: bright ? MAGENTA : DIM_MAGENTA,
      detailed: (ctx, px, py, cs) => {
        const alpha = 0.5 + 0.3 * Math.abs(Math.sin(t * PULSE_HZ));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLOR;
        ctx.fillRect(px, py, cs, cs);
        ctx.globalAlpha = 1;
      },
    });
  },
});
