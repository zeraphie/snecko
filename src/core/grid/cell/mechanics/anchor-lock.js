// mechanics/anchor-lock.js — CELL_ANCHOR_LOCK: arena wall locked by an
// anchor mod (clearable, temporary; replaces CELL_WALL_ARENA at lock cells).

import { CELL_ANCHOR_LOCK } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { ORANGE } from "../../../../render/terminal/palette.js";

const COLOR = "#e67e22";
const PULSE_HZ = 6.0;
const DIM_AMBER = "\x1b[38;5;130m";

defineCell(CELL_ANCHOR_LOCK, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: "▓▓",
      glyphColor: bright ? ORANGE : DIM_AMBER,
      detailed: (ctx, px, py, cs) => {
        const alpha = 0.55 + 0.45 * Math.abs(Math.sin(t * PULSE_HZ));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLOR;
        ctx.fillRect(px, py, cs, cs);
        ctx.globalAlpha = 1;
      },
    });
  },
});
