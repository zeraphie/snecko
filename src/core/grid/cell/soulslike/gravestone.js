// soulslike/gravestone.js — CELL_GRAVESTONE: small blocking stone marker.
//
// Single-cell blocking scenery. Terminal renders a dim stone glyph;
// canvas paints a rounded headstone shape with a small inscription
// notch so it reads as a grave even at small cell sizes.

import { CELL_GRAVESTONE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { DIM } from "../../../../render/terminal/palette.js";

const STONE = "#7d7a73";
const STONE_SHADOW = "#4d4a44";
const GROUND = "#3a352c";

defineCell(CELL_GRAVESTONE, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      glyph: "▓▓",
      glyphColor: DIM,
      detailed: (ctx, px, py, cs) => {
        const cx = px + cs / 2;
        // Mound at the base.
        ctx.fillStyle = GROUND;
        ctx.beginPath();
        ctx.ellipse(cx, py + cs * 0.88, cs * 0.4, cs * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        // Stone body — rounded top.
        ctx.fillStyle = STONE;
        ctx.beginPath();
        ctx.moveTo(px + cs * 0.28, py + cs * 0.88);
        ctx.lineTo(px + cs * 0.28, py + cs * 0.35);
        ctx.arc(cx, py + cs * 0.35, cs * 0.22, Math.PI, 0);
        ctx.lineTo(px + cs * 0.72, py + cs * 0.88);
        ctx.closePath();
        ctx.fill();
        // Shadow line on the right edge for depth.
        ctx.fillStyle = STONE_SHADOW;
        ctx.fillRect(px + cs * 0.62, py + cs * 0.38, cs * 0.08, cs * 0.5);
        // Inscription cross.
        ctx.strokeStyle = STONE_SHADOW;
        ctx.lineWidth = Math.max(1, cs * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx, py + cs * 0.42);
        ctx.lineTo(cx, py + cs * 0.7);
        ctx.moveTo(cx - cs * 0.1, py + cs * 0.52);
        ctx.lineTo(cx + cs * 0.1, py + cs * 0.52);
        ctx.stroke();
      },
    });
  },
});
