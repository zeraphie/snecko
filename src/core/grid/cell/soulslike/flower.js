// soulslike/flower.js — CELL_FLOWER: non-blocking decorative scenery.
//
// Flowers are cosmetic — they don't appear in the terminal renderer
// (the cell stays empty-looking) and they don't block movement. The
// canvas detailed callback paints petals; the size of the parent
// region drives how many petals and how spread out they are:
//   - 1×1 region: one tight floral cluster centred in the cell.
//   - bigger region: each cell scatters 2–4 petals at random-ish
//     positions inside itself, so a 3×3 patch reads as a meadow
//     rather than 9 identical clusters.
//
// "Random-ish" is deterministic — seeded by `region.id` plus the
// cell's offset within the region — so the layout stays stable
// across re-renders and is independent of frame timing.

import { CELL_FLOWER } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { DIM } from "../../../../render/terminal/palette.js";

// Muted soulslike-meadow palette — most petals are pale cream/white
// (like the flowers carpeting Malenia's arena), with the occasional
// dusty-pink or amber bloom for variation.
const PETAL_COLORS = ["#e8dfc8", "#d6cdb5", "#e3d4a8", "#c89a96", "#d5c19f"];
const POLLEN = "#c7a766";

defineCell(CELL_FLOWER, {
  render(x, y, context) {
    const region = context?.region;
    const isSingle = !region || (region.bounds.w === 1 && region.bounds.h === 1);
    activeRenderer.cell(x, y, {
      // Terminal stays empty-looking — flowers are canvas-only.
      glyph: "░░",
      glyphColor: DIM,
      detailed: (ctx, px, py, cs) => {
        // Flowers are background dressing — keep them translucent so
        // the player, boss, weapons, and swipe hitboxes stay legible
        // when something drawn on top overlaps a meadow cell.
        ctx.save();
        ctx.globalAlpha = 0.6;
        if (isSingle) {
          drawCluster(ctx, px + cs / 2, py + cs / 2, cs, 0);
          ctx.restore();
          return;
        }
        // Multi-cell region — scatter several small flowers across
        // this cell. Seed by region id + local cell position so a
        // 3×3 patch lays out the same petals every frame.
        const localX = x - region.bounds.x;
        const localY = y - region.bounds.y;
        const seed = mix(region.id, localX * 73856093, localY * 19349663);
        const rand = mulberry32(seed);
        // 1–3 small blooms per cell. With the dense carpet from the
        // ref images we want LOTS of small flowers, not a few big
        // ones — keep the per-cell count low and the petal radius
        // small so the area reads as a continuous meadow.
        const count = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < count; i++) {
          const fx = px + cs * (0.15 + rand() * 0.7);
          const fy = py + cs * (0.15 + rand() * 0.7);
          drawPetals(ctx, fx, fy, cs, Math.floor(rand() * PETAL_COLORS.length));
        }
        ctx.restore();
      },
    });
  },
});

/**
 * Draws a single small floral cluster centred at (cx, cy). Top-down
 * view, so no stem — just the petal head and a pollen dot.
 */
function drawCluster(ctx, cx, cy, cs, colorIndex) {
  drawPetals(ctx, cx, cy, cs, colorIndex);
}

/**
 * Draws a 4-petal flower (stem-less) at (cx, cy). Used both for
 * single clusters and for scattered multi-cell petals.
 */
function drawPetals(ctx, cx, cy, cs, colorIndex) {
  ctx.fillStyle = PETAL_COLORS[colorIndex % PETAL_COLORS.length];
  const r = cs * 0.08;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * cs * 0.09, cy + Math.sin(a) * cs * 0.09, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = POLLEN;
  ctx.beginPath();
  ctx.arc(cx, cy, cs * 0.045, 0, Math.PI * 2);
  ctx.fill();
}

/** 32-bit integer hash mix. */
function mix(a, b, c) {
  let h = (a ^ b ^ c) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return h ^ (h >>> 16);
}

/** Deterministic 32-bit PRNG → [0, 1). */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
