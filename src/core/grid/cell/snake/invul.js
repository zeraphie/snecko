// snake/invul.js — CELL_PLAYER_INVUL: invul-window snake body, pulsing cyan.

import { CELL_PLAYER_INVUL } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { CYAN, DIM_CYAN } from "../../../../render/terminal/palette.js";

const COLOR = "#00e5ff";
const PULSE_HZ = 10.0;

defineCell(CELL_PLAYER_INVUL, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: "▓▓",
      glyphColor: bright ? CYAN : DIM_CYAN,
      detailed: (ctx, px, py, cs) => {
        const alpha = 0.5 + 0.5 * Math.abs(Math.sin(t * PULSE_HZ));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLOR;
        ctx.fillRect(px, py, cs, cs);
        ctx.globalAlpha = 1;
      },
    });
  },
});
