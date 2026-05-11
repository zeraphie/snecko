// soulslike/tree.js — CELL_TREE: gnarled dead tree built from a
// connected region.
//
// The region's cells ARE the tree:
//   - The dense cluster of cells reads as the trunk silhouette
//     (solid dark fill, one cell at a time).
//   - On top, we draw a tangle of curving "branches" that wind
//     between the region's extreme cells, passing through the trunk
//     area — so the densest spot accumulates the most overlap and
//     reads as the trunk centre, with branches reaching out toward
//     the stair-step extensions.
//
// Branch strokes are pre-computed once per region (cached on the
// region object) and re-drawn each frame; the per-cell clip keeps
// each cell showing only its slice of the shared tangle, so a
// branch passing through 4 cells reads as one continuous limb.

import { CELL_TREE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { BROWN, DARK_BROWN } from "../../../../render/terminal/palette.js";

const TRUNK_DARK = "#161009";
const TRUNK_MID = "#2a1d10";
const TRUNK_HIGHLIGHT = "#4a3520";

defineCell(CELL_TREE, {
  render(x, y, context) {
    const region = context?.region;
    activeRenderer.cell(x, y, {
      glyph: "▓▓",
      glyphColor:
        region?.bounds && y === region.bounds.y + region.bounds.h - 1 ? BROWN : DARK_BROWN,
      detailed: (ctx, px, py, cs) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, cs, cs);
        ctx.clip();

        // 1. Solid dark fill — adjacent tree cells stitch together
        //    visually into the trunk silhouette.
        ctx.fillStyle = TRUNK_DARK;
        ctx.fillRect(px, py, cs, cs);

        if (region) {
          // 2. Winding branches across the whole region. Each branch
          //    curves from one extreme cell to another and bends
          //    through the trunk centre, so overlapping branches pile
          //    up where the cells cluster.
          drawRegionBranches(ctx, x, y, px, py, cs, region);
        }

        // 3. Per-cell bark grooves — short dark highlight streaks
        //    seeded by the cell coords so each cell has a slightly
        //    different texture.
        drawBark(ctx, x, y, px, py, cs, region?.id ?? 0);

        ctx.restore();
      },
    });
  },
});

// ── Region branch tangle ─────────────────────────────────────────

function drawRegionBranches(ctx, cellX, cellY, cellPx, cellPy, cs, region) {
  const strokes = getStrokes(region);
  for (const s of strokes) {
    const fx = (s.from.x - cellX) * cs + cs / 2 + cellPx;
    const fy = (s.from.y - cellY) * cs + cs / 2 + cellPy;
    const cpx = (s.cp.x - cellX) * cs + cs / 2 + cellPx;
    const cpy = (s.cp.y - cellY) * cs + cs / 2 + cellPy;
    const tx = (s.to.x - cellX) * cs + cs / 2 + cellPx;
    const ty = (s.to.y - cellY) * cs + cs / 2 + cellPy;

    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * cs;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(cpx, cpy, tx, ty);
    ctx.stroke();
  }
}

/**
 * Returns the cached list of branch strokes for the region, computing
 * them on first access. Each stroke is a quadratic bezier through
 * (from, cp, to) in cell coords, plus a width (cell-relative) and
 * a colour.
 */
function getStrokes(region) {
  if (region._treeStrokes) {
    return region._treeStrokes;
  }
  const cells = region.cells;
  if (cells.length < 2) {
    region._treeStrokes = [];
    return region._treeStrokes;
  }

  // Centroid of the region — used as the trunk centre.
  let sumX = 0;
  let sumY = 0;
  for (const c of cells) {
    sumX += c.x;
    sumY += c.y;
  }
  const centroid = { x: sumX / cells.length, y: sumY / cells.length };

  // Find well-spread extreme cells (farthest from centroid, but not
  // too close to one another) — those are the branch endpoints.
  const byDist = cells.slice().sort((a, b) => sqDist(b, centroid) - sqDist(a, centroid));
  const extremes = [];
  for (const cell of byDist) {
    let spread = true;
    for (const e of extremes) {
      if (Math.abs(e.x - cell.x) + Math.abs(e.y - cell.y) < 2) {
        spread = false;
        break;
      }
    }
    if (spread) {
      extremes.push(cell);
      if (extremes.length >= 4) {
        break;
      }
    }
  }

  const rand = mulberry32(region.id ^ 0xa53f);
  const strokes = [];
  // Pairwise curves between extremes — these wind through the trunk
  // area and overlap there. Use a lighter colour so each branch reads
  // against the dark fill.
  for (let i = 0; i < extremes.length; i++) {
    for (let j = i + 1; j < extremes.length; j++) {
      const from = extremes[i];
      const to = extremes[j];
      const cp = {
        x: centroid.x + (rand() - 0.5) * 2.6,
        y: centroid.y + (rand() - 0.5) * 2.6,
      };
      strokes.push({
        from,
        cp,
        to,
        width: 0.18 + rand() * 0.18,
        color: TRUNK_MID,
      });
    }
  }
  // A handful of thinner accent strokes for extra winding — lighter
  // shade still, smaller width.
  for (let i = 0; i < 3 && extremes.length >= 2; i++) {
    const from = extremes[i % extremes.length];
    const to = extremes[(i + 2) % extremes.length];
    const cp = {
      x: centroid.x + (rand() - 0.5) * 3.5,
      y: centroid.y + (rand() - 0.5) * 3.5,
    };
    strokes.push({
      from,
      cp,
      to,
      width: 0.08 + rand() * 0.1,
      color: TRUNK_HIGHLIGHT,
    });
  }

  region._treeStrokes = strokes;
  return strokes;
}

function sqDist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// ── Bark texture ─────────────────────────────────────────────────

function drawBark(ctx, cellX, cellY, px, py, cs, regionId) {
  const seed = mix(regionId, cellX * 73856093, cellY * 19349663);
  const rand = mulberry32(seed);
  ctx.strokeStyle = TRUNK_MID;
  ctx.lineCap = "round";
  // 1–2 short curved grooves per cell.
  const n = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const x0 = px + cs * (0.15 + rand() * 0.7);
    const y0 = py + cs * (0.15 + rand() * 0.7);
    const angle = rand() * Math.PI * 2;
    const len = cs * (0.25 + rand() * 0.3);
    const x1 = x0 + Math.cos(angle) * len;
    const y1 = y0 + Math.sin(angle) * len;
    const cpx = (x0 + x1) / 2 + (rand() - 0.5) * cs * 0.15;
    const cpy = (y0 + y1) / 2 + (rand() - 0.5) * cs * 0.15;
    ctx.lineWidth = cs * 0.05;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cpx, cpy, x1, y1);
    ctx.stroke();
  }
}

// ── PRNG ─────────────────────────────────────────────────────────

function mix(a, b, c) {
  let h = (a ^ b ^ c) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return h ^ (h >>> 16);
}

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
