// soulslike/water.js — CELL_WATER: ankle-deep pond floor.
//
// Non-blocking scenery: the pond is the main fight area, the boss
// and snake walk through it. Visually it's a thin translucent layer
// over the floor with a slow shimmering wave so the area reads as
// "wet" without obscuring whatever's on top.
//
// Animation is driven by `Date.now()` inside the detailed callback —
// the browser render loop is an rAF, so each frame the wave phase
// advances. Phase varies per (x, y) so adjacent cells stay slightly
// out of sync and the surface looks like a continuous ripple rather
// than every cell flashing in lockstep.

import { CELL_WATER } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { CYAN } from "../../../../render/terminal/palette.js";

const WATER_TONE = "#2c4358";
// Shimmer colour sits a little above the base tone — close enough
// that the brightness peaks read as soft highlights rather than a
// harsh wave crest.
const SHIMMER = "#5a6e80";

defineCell(CELL_WATER, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      glyph: "~~",
      glyphColor: CYAN,
      detailed: (ctx, px, py, cs) => {
        const t = Date.now() * 0.001;
        ctx.save();
        // Shallow water layer — translucent so the underlying floor
        // colour still reads (1cm deep, not opaque).
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = WATER_TONE;
        ctx.fillRect(px, py, cs, cs);
        // Slow sine-wave brightness modulation. Adjacent cells are
        // phase-offset by (x, y) coefficients so the shimmer rolls
        // across the pond rather than pulsing uniformly.
        const phase = t * 0.25 + x * 0.35 + y * 0.3;
        const wave = (Math.sin(phase) + 1) * 0.5; // 0..1
        ctx.globalAlpha = wave * 0.12;
        ctx.fillStyle = SHIMMER;
        ctx.fillRect(px, py, cs, cs);
        // Thin band that drifts diagonally — gives the surface a bit
        // of structure beyond a flat tint. Subtle: low alpha + a
        // narrow strip.
        const bandPhase = t * 0.4 + x * 0.5 - y * 0.35;
        const bandOffset = (Math.sin(bandPhase) + 1) * 0.5;
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = SHIMMER;
        ctx.fillRect(px, py + bandOffset * cs - cs * 0.04, cs, cs * 0.06);
        ctx.restore();
      },
    });
  },
});
