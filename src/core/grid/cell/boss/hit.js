// boss/hit.js — CELL_BOSS_HIT: stagger / per-cell hit flash. Pulses
// purple→lavender on canvas, MAGENTA↔WHITE on terminal.

import { CELL_BOSS_HIT } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { MAGENTA, WHITE } from "../../../../render/terminal/palette.js";

const PULSE_HZ = 12.0;

defineCell(CELL_BOSS_HIT, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      glyph: "██",
      glyphColor: bright ? WHITE : MAGENTA,
      detailed: (ctx, px, py, cs) => {
        // Interpolate boss-purple → lavender so it reads as a hit
        // without strobing.
        const phase = Math.abs(Math.sin(t * PULSE_HZ));
        const r = Math.round(142 + (210 - 142) * phase);
        const g = Math.round(68 + (150 - 68) * phase);
        const b = Math.round(173 + (230 - 173) * phase);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(px, py, cs, cs);
      },
    });
  },
});
