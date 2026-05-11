// snake/head.js — CELL_SNAKE_HEAD: directional snake head.
//
// Replaces the renderers' `drawSnakeHead` / `drawSnakeHeadInvul`
// methods. The render path now calls
// `drawCell(x, y, CELL_SNAKE_HEAD, { facing, invul })` and this file
// owns both the rect+triangle canvas drawing and the directional
// terminal glyph (▲▼◀▶).

import { CELL_SNAKE_HEAD } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { GREEN, CYAN, DIM_CYAN } from "../../../../render/terminal/palette.js";
import { drawFacingTriangle } from "../_facing-triangle.js";

const HEAD_GLYPHS = {
  "0,-1": "▲▲",
  "0,1": "▼▼",
  "-1,0": "◀◀",
  "1,0": "▶▶",
};
const FALLBACK_GLYPH = "◆◆";

const HEAD_BASE = "#5ddb8a"; // base square — lighter green
const HEAD_ACCENT = "#27ae60"; // facing-direction triangle — body green
const INVUL_BASE = "#00e5ff"; // base square during invul
const INVUL_ACCENT = "#006080"; // facing triangle during invul
const PULSE_HZ = 10.0;

defineCell(CELL_SNAKE_HEAD, {
  render(x, y, context) {
    const facing = context?.facing ?? { dx: 1, dy: 0 };
    const invul = !!context?.invul;
    const key = facing.dx + "," + facing.dy;
    const glyph = HEAD_GLYPHS[key] ?? FALLBACK_GLYPH;

    let glyphColor;
    let baseColor;
    let accentColor;
    let alpha = 1;

    if (invul) {
      const t = Date.now() / 1000;
      const bright = Math.sin(t * PULSE_HZ) > 0;
      glyphColor = bright ? CYAN : DIM_CYAN;
      baseColor = INVUL_BASE;
      accentColor = INVUL_ACCENT;
      alpha = 0.5 + 0.5 * Math.abs(Math.sin(t * PULSE_HZ));
    } else {
      glyphColor = GREEN;
      baseColor = HEAD_BASE;
      accentColor = HEAD_ACCENT;
    }

    activeRenderer.cell(x, y, {
      glyph,
      glyphColor,
      detailed: (ctx, px, py, cs) => {
        if (alpha < 1) {
          ctx.globalAlpha = alpha;
        }
        ctx.fillStyle = baseColor;
        ctx.fillRect(px, py, cs, cs);
        if (alpha < 1) {
          ctx.globalAlpha = 1;
        }
        drawFacingTriangle(ctx, px, py, cs, facing, accentColor);
      },
    });
  },
});
