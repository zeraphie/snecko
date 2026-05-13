// terrain/wall-catacomb.js — CELL_WALL_CATACOMB: catacombs-flavoured wall.
//
// Functionally identical to CELL_WALL (impassable, eats no walls).
// Canvas paints a per-cell Roman-cobble pattern: dark mortar fill +
// a hand-authored layout of irregularly-sized stones (picked from a
// small library via a deterministic `(x, y)` hash so adjacent cells
// vary). Stone shapes are organic — corner-cut polygons with per-
// vertex hash-driven perturbation, plus an occasional crack — so
// they don't read as bricks. Each stone gets a colour from a warm-
// earth palette plus a top highlight and bottom shadow for depth.
//
// Cells aren't required to fully cover their tile — partial layouts
// leave mortar showing, which still reads as a wall when surrounded
// by other cobble cells. Terminal stays a brown solid since the
// detail doesn't survive at 2-char-wide cells.

import { CELL_WALL_CATACOMB } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { BROWN } from "../../../../render/terminal/palette.js";

// Mortar gap colour — dark warm brown so the stones read as raised.
const MORTAR = "#2a1d08";
// Stone palette — warm earth tones drawn from the cobble refs, varied
// enough to break the grid feel but tight enough to read as one road
// material.
const STONE_COLORS = ["#6b4f30", "#7a5a38", "#5a4128", "#684a2c", "#735238", "#806242"];
const STONE_HI = "#a37a4c"; // top-edge highlight
const STONE_LO = "#3a2810"; // bottom-edge shadow / crack

/**
 * Stone-layout library. Each layout is a list of rectangles in unit
 * cell coordinates: `[fx, fy, fw, fh]` (fractions of cell size). The
 * layouts are hand-tuned for visual variety: counts 1–5, mixed
 * orientations, deliberate sparse spots. Each cell picks one + a
 * rotation via `(x, y)` hash so adjacent cells don't repeat.
 */
const STONE_LAYOUTS = [
  // 0 — 4 small stones with wide mortar gaps
  [
    [0.06, 0.06, 0.36, 0.36],
    [0.58, 0.06, 0.36, 0.36],
    [0.06, 0.58, 0.36, 0.36],
    [0.58, 0.58, 0.36, 0.36],
  ],
  // 1 — one big + a couple smaller, asymmetric
  [
    [0.05, 0.05, 0.6, 0.6],
    [0.7, 0.05, 0.25, 0.28],
    [0.7, 0.38, 0.25, 0.27],
    [0.05, 0.7, 0.9, 0.25],
  ],
  // 2 — two horizontal slabs
  [
    [0.08, 0.07, 0.84, 0.38],
    [0.08, 0.52, 0.84, 0.41],
  ],
  // 3 — three stones, big bottom + two top
  [
    [0.06, 0.06, 0.42, 0.42],
    [0.55, 0.06, 0.39, 0.42],
    [0.06, 0.55, 0.88, 0.4],
  ],
  // 4 — five smaller stones, denser
  [
    [0.05, 0.05, 0.42, 0.3],
    [0.55, 0.05, 0.4, 0.3],
    [0.05, 0.4, 0.3, 0.55],
    [0.4, 0.4, 0.55, 0.26],
    [0.4, 0.7, 0.55, 0.25],
  ],
  // 5 — two big, sparse mortar around
  [
    [0.08, 0.08, 0.48, 0.84],
    [0.62, 0.18, 0.3, 0.64],
  ],
  // 6 — single hero stone (a few cells let one shape breathe)
  [[0.1, 0.1, 0.8, 0.8]],
];

/**
 * Deterministic per-cell hash → 32-bit unsigned int. xorshift-style
 * mix of `(x, y)`; `salt` lets multiple secondary picks (layout,
 * rotation, per-stone colour, vertex jitter, crack roll) decorrelate
 * from the same coordinate.
 */
function cellHash(cx, cy, salt) {
  let h = ((cx * 73856093) ^ (cy * 19349663) ^ (salt * 83492791)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

function hashFloat(cx, cy, salt) {
  return cellHash(cx, cy, salt) / 0x100000000;
}

/**
 * Rotates a unit-cell rect by `rot` × 90° clockwise around the cell
 * centre. `[fx, fy, fw, fh]` → rotated `[fx', fy', fw', fh']`.
 */
function rotateRect(rect, rot) {
  const [fx, fy, fw, fh] = rect;
  switch (rot & 3) {
    case 1:
      return [1 - fy - fh, fx, fh, fw];
    case 2:
      return [1 - fx - fw, 1 - fy - fh, fw, fh];
    case 3:
      return [fy, 1 - fx - fw, fh, fw];
    default:
      return rect;
  }
}

/**
 * Builds a 12-vertex corner-cut polygon for a stone, with each vertex
 * radially perturbed by a hash-driven amount so the outline reads as
 * organic rather than rectangular. Returns a Path2D ready to fill /
 * clip / stroke.
 */
function buildStonePath(sx, sy, sw, sh, cx, cy, stoneIdx) {
  const inset = Math.min(sw, sh) * (0.18 + hashFloat(cx, cy, stoneIdx * 17 + 1) * 0.1);
  const jitter = Math.min(sw, sh) * 0.1;
  const midX = sx + sw / 2;
  const midY = sy + sh / 2;

  // 12 base vertices around the rect: corners cut, edges mid-pointed.
  const base = [
    [sx + inset, sy],
    [midX, sy],
    [sx + sw - inset, sy],
    [sx + sw, sy + inset],
    [sx + sw, midY],
    [sx + sw, sy + sh - inset],
    [sx + sw - inset, sy + sh],
    [midX, sy + sh],
    [sx + inset, sy + sh],
    [sx, sy + sh - inset],
    [sx, midY],
    [sx, sy + inset],
  ];

  const path = new Path2D();
  for (let i = 0; i < base.length; i++) {
    let [vx, vy] = base[i];
    // Radial perturbation — pull each vertex slightly toward / away
    // from the stone centre. Salt the hash with `stoneIdx * 12 + i`
    // so each vertex has its own stable wobble.
    const dx = vx - midX;
    const dy = vy - midY;
    const len = Math.hypot(dx, dy) || 1;
    const r = (hashFloat(cx, cy, stoneIdx * 47 + i + 100) * 2 - 1) * jitter;
    vx += (dx / len) * r;
    vy += (dy / len) * r;
    if (i === 0) {
      path.moveTo(vx, vy);
    } else {
      path.lineTo(vx, vy);
    }
  }
  path.closePath();
  return path;
}

defineCell(CELL_WALL_CATACOMB, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#5C3D11",
      glyph: "██",
      glyphColor: BROWN,
      detailed: (ctx, px, py, cs) => {
        const cx = (px / cs) | 0;
        const cy = (py / cs) | 0;

        // Mortar background.
        ctx.fillStyle = MORTAR;
        ctx.fillRect(px, py, cs, cs);

        const layoutIdx = cellHash(cx, cy, 1) % STONE_LAYOUTS.length;
        const rot = cellHash(cx, cy, 2) & 3;
        const layout = STONE_LAYOUTS[layoutIdx];
        const edge = Math.max(1, Math.floor(cs * 0.08));

        for (let i = 0; i < layout.length; i++) {
          const [fx, fy, fw, fh] = rotateRect(layout[i], rot);
          const sx = px + cs * fx;
          const sy = py + cs * fy;
          const sw = cs * fw;
          const sh = cs * fh;
          const stonePath = buildStonePath(sx, sy, sw, sh, cx, cy, i);

          // Body.
          ctx.fillStyle = STONE_COLORS[cellHash(cx, cy, 10 + i) % STONE_COLORS.length];
          ctx.fill(stonePath);

          // Highlight + shadow — clip to the stone's organic shape so
          // they trace the perturbed silhouette, not a tight rect.
          ctx.save();
          ctx.clip(stonePath);
          ctx.fillStyle = STONE_HI;
          ctx.fillRect(sx, sy, sw, edge);
          ctx.fillStyle = STONE_LO;
          ctx.fillRect(sx, sy + sh - edge, sw, edge);

          // Occasional crack — thin dark line crossing the stone. Only
          // on stones big enough to read it, ~35 % chance.
          if (Math.min(sw, sh) > 6 && hashFloat(cx, cy, 90 + i) < 0.35) {
            const startX = sx + sw * (0.2 + hashFloat(cx, cy, 200 + i) * 0.6);
            const endX = sx + sw * (0.2 + hashFloat(cx, cy, 300 + i) * 0.6);
            const startY = sy + sh * 0.05;
            const endY = sy + sh * 0.95;
            ctx.strokeStyle = STONE_LO;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            const midJitter = sw * (hashFloat(cx, cy, 400 + i) * 0.3 - 0.15);
            ctx.quadraticCurveTo((startX + endX) / 2 + midJitter, (startY + endY) / 2, endX, endY);
            ctx.stroke();
          }
          ctx.restore();
        }
      },
    });
  },
});
