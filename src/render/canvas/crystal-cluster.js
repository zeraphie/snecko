// crystal-cluster.js — Single-pass per-cluster crystal render.
//
// Each active crystal lifecycle in `game.mechanic.crystals` is drawn
// as ONE continuous shape: a central mass at the cluster's centroid +
// a faceted spike radiating to every owned wall cell. Telegraphed
// cells (state telegraph_place / telegraph_grow) draw with the same
// shape at reduced alpha, so the upcoming crystal reads as a ghost
// preview of what will actually appear.
//
// Per-cell rendering (`wall-crystal.js` / `crystal-telegraph.js`) only
// stamps the dark mortar background for walls and a glyph for
// terminal — all canvas detail lives here.

import { TERRAIN_CRYSTAL_TELEGRAPH } from "../../core/grid/constants.js";

// Quartz palette tuned to the refs — pale lavenders + pinks against a
// very dark mortar so the cluster reads as translucent crystal. The
// "shaded" / "lit" pair gives each spike a two-tone facet so the
// blocky cross-section reads even at small cell sizes.
const BODY_SHADED = "#9d80b3";
const BODY_LIT = "#e8d6ee";
const HIGHLIGHT = "#fff5ff";
const OUTLINE = "#3a2e50";

// Telegraph palette — cyan wireframe, distinct enough from the warm
// crystal palette that the player can't confuse "about to spawn here"
// with "already a wall".
const TELEGRAPH_STROKE = "#5fc8e0";
const TELEGRAPH_FILL = "rgba(95, 200, 224, 0.08)";

// Cluster sizing knobs (fractions of cell size).
const SPIKE_TIP_OVERSHOOT = 0.35; // tip extends past the cell centre toward its outer edge
const SPIKE_HALF_WIDTH = 0.42; // half-width of a spike's base at the centroid
const SPIKE_TAPER_AT = 0.72; // fraction along the spike where the tip taper begins
const MASS_RADIUS = 0.45; // central mass radius
const HIGHLIGHT_OFFSET = 0.1; // central-mass highlight offset toward the upper-left

// Glint animation — one bright spot travels along one spike at a time,
// pulses, then jumps to the next. Per-cluster phase offset (derived
// from the centroid) so different clusters glint out of sync.
const GLINT_PERIOD_MS = 1600; // ms per spike
const GLINT_VISIBLE_FRACTION = 0.45; // fraction of period the glint is visible

/**
 * Per-frame overlay. Iterates every active crystal and draws its
 * cluster shape over the dark cell backgrounds.
 *
 * @this {import('./index.js').CanvasRenderer}
 * @param {import('../../core/game/index.js').Game} game
 */
export function drawCrystalClusters(game) {
  const mech = game.mechanic;
  if (!mech || mech.type !== "lattice") {
    return;
  }
  const ctx = this._ctx;
  const cs = this._cellSize;
  for (const c of mech.crystals) {
    drawOneCluster(ctx, cs, c, game);
  }
}

function drawOneCluster(ctx, cs, c, game) {
  const walls = collectWallCells(c);
  const telegraphed = collectTelegraphCells(c, game);
  if (walls.length === 0 && telegraphed.length === 0) {
    return;
  }

  // Centroid is computed over the WHOLE shape (walls + telegraphs) so a
  // crystal mid-growth doesn't visually jump when its centroid would
  // otherwise shift as new cells stamp.
  const all =
    walls.length > 0 && telegraphed.length > 0
      ? [...walls, ...telegraphed]
      : walls.length > 0
        ? walls
        : telegraphed;
  let sumX = 0;
  let sumY = 0;
  for (const cell of all) {
    sumX += cell.x;
    sumY += cell.y;
  }
  const centroidX = sumX / all.length;
  const centroidY = sumY / all.length;

  if (walls.length > 0) {
    drawSolidShape(ctx, cs, centroidX, centroidY, walls);
    drawGlint(ctx, cs, centroidX, centroidY, walls);
  }
  if (telegraphed.length > 0) {
    drawTelegraphShape(ctx, cs, centroidX, centroidY, telegraphed);
  }
}

/**
 * Collects every wall cell owned by `c` from its `ownedSolid` mask.
 */
function collectWallCells(c) {
  const cells = [];
  if (!c.ownedSolid) {
    return cells;
  }
  for (let row = 0; row < c.ownedSolid.length; row++) {
    const mask = c.ownedSolid[row];
    if (!mask) {
      continue;
    }
    const y = c.y + row;
    for (let col = 0; col < 31; col++) {
      if (mask & (1 << col)) {
        cells.push({ x: c.x + col, y });
      }
    }
  }
  return cells;
}

/**
 * Collects telegraph cells inside `c`'s upcoming footprint. The
 * upcoming shape depends on state: telegraph_place / place use stage
 * 0; telegraph_grow / grow use stage 1. We re-check the terrain mask
 * to make sure each candidate is actually flagged (the stamp would
 * have cleared overlapping telegraphs already).
 */
function collectTelegraphCells(c, game) {
  const cells = [];
  if (c.crystalIdx < 0 || c.rotation < 0) {
    return cells;
  }
  const crystal = game.manifest.crystals[c.crystalIdx];
  if (!crystal) {
    return cells;
  }
  let stageIdx;
  if (c.state === "telegraph_place" || c.state === "place") {
    stageIdx = 0;
  } else if (c.state === "telegraph_grow" || c.state === "grow") {
    stageIdx = 1;
  } else {
    return cells;
  }
  const stage = crystal.stages[stageIdx];
  if (!stage) {
    return cells;
  }
  const shape = stage.rotations[c.rotation % stage.rotations.length];
  const grid = game.grid;
  const w = grid.width;
  for (let row = 0; row < shape.height; row++) {
    const y = c.y + row;
    if (y < 0 || y >= grid.height) {
      continue;
    }
    const mask = shape.solidRows[row];
    for (let col = 0; col < shape.width; col++) {
      if (!(mask & (1 << col))) {
        continue;
      }
      const x = c.x + col;
      if (x < 0 || x >= w) {
        continue;
      }
      if (grid.terrain[y * w + x] === TERRAIN_CRYSTAL_TELEGRAPH) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

/**
 * Computes the 5 vertices of a blocky crystal spike from the centroid
 * to a cell: parallel-sided body for the first `SPIKE_TAPER_AT` of its
 * length, then a pyramidal tip. Returns null if the cell is too close
 * to the centroid to draw a meaningful spike (covered by the mass).
 *
 * Vertex order (clockwise from upper-base):
 *   0 base-left, 1 shoulder-left, 2 tip, 3 shoulder-right, 4 base-right
 */
function spikeVerts(cs, cxs, cys, cell) {
  const cellCx = (cell.x + 0.5) * cs;
  const cellCy = (cell.y + 0.5) * cs;
  const dx = cellCx - cxs;
  const dy = cellCy - cys;
  const dist = Math.hypot(dx, dy);
  if (dist < cs * 0.4) {
    return null;
  }
  const ux = dx / dist;
  const uy = dy / dist;
  const perpX = -uy;
  const perpY = ux;
  const length = dist + cs * SPIKE_TIP_OVERSHOOT;
  const taperAt = length * SPIKE_TAPER_AT;
  const hw = cs * SPIKE_HALF_WIDTH;

  return {
    ux,
    uy,
    perpX,
    perpY,
    length,
    taperAt,
    hw,
    baseLeft: { x: cxs + perpX * hw, y: cys + perpY * hw },
    shoulderLeft: { x: cxs + ux * taperAt + perpX * hw, y: cys + uy * taperAt + perpY * hw },
    tip: { x: cxs + ux * length, y: cys + uy * length },
    shoulderRight: { x: cxs + ux * taperAt - perpX * hw, y: cys + uy * taperAt - perpY * hw },
    baseRight: { x: cxs - perpX * hw, y: cys - perpY * hw },
  };
}

/**
 * Builds a clip mask from the cluster's actual cells — the union of
 * their rectangles. Used by every per-cluster draw pass so spikes
 * never visually leak into adjacent corridor cells (which can
 * legitimately hold food / snake body and shouldn't appear "inside"
 * the crystal).
 */
function buildClusterClipPath(cs, cells) {
  const path = new Path2D();
  for (const cell of cells) {
    path.rect(cell.x * cs, cell.y * cs, cs, cs);
  }
  return path;
}

/**
 * Draws the full opaque cluster — blocky spikes + central mass — clipped
 * to the union of the cluster's wall cells. Mass renders last so spike
 * bases blend into it.
 */
function drawSolidShape(ctx, cs, centroidX, centroidY, cells) {
  const cxs = (centroidX + 0.5) * cs;
  const cys = (centroidY + 0.5) * cs;

  ctx.save();
  ctx.clip(buildClusterClipPath(cs, cells));

  for (const cell of cells) {
    drawSolidSpike(ctx, cs, cxs, cys, cell);
  }

  // Central mass — slightly lighter than spike bodies to suggest the
  // light-trapped centre of a quartz cluster.
  ctx.fillStyle = BODY_LIT;
  ctx.beginPath();
  ctx.arc(cxs, cys, cs * MASS_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Inner highlight on the mass — offset toward upper-left so the
  // whole cluster reads as one consistently-lit object.
  ctx.fillStyle = HIGHLIGHT;
  ctx.beginPath();
  ctx.arc(
    cxs - cs * HIGHLIGHT_OFFSET,
    cys - cs * HIGHLIGHT_OFFSET,
    cs * MASS_RADIUS * 0.45,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

function drawSolidSpike(ctx, cs, cxs, cys, cell) {
  const v = spikeVerts(cs, cxs, cys, cell);
  if (!v) {
    return;
  }

  // Shaded body (right / lower face of the prism).
  ctx.fillStyle = BODY_SHADED;
  ctx.beginPath();
  ctx.moveTo(v.baseLeft.x, v.baseLeft.y);
  ctx.lineTo(v.shoulderLeft.x, v.shoulderLeft.y);
  ctx.lineTo(v.tip.x, v.tip.y);
  ctx.lineTo(v.shoulderRight.x, v.shoulderRight.y);
  ctx.lineTo(v.baseRight.x, v.baseRight.y);
  ctx.closePath();
  ctx.fill();

  // Lit face — covers the upper-left half from the centre ridge.
  // Ridge runs from the centroid through the spike's centerline to
  // the tip; left of the ridge catches the light.
  ctx.fillStyle = BODY_LIT;
  ctx.beginPath();
  ctx.moveTo(cxs, cys);
  ctx.lineTo(v.baseLeft.x, v.baseLeft.y);
  ctx.lineTo(v.shoulderLeft.x, v.shoulderLeft.y);
  ctx.lineTo(v.tip.x, v.tip.y);
  ctx.closePath();
  ctx.fill();

  // Outline the body (skipping the base side — it'll be hidden by the
  // central mass) + the centre ridge so the two-tone facet reads.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(v.baseLeft.x, v.baseLeft.y);
  ctx.lineTo(v.shoulderLeft.x, v.shoulderLeft.y);
  ctx.lineTo(v.tip.x, v.tip.y);
  ctx.lineTo(v.shoulderRight.x, v.shoulderRight.y);
  ctx.lineTo(v.baseRight.x, v.baseRight.y);
  ctx.moveTo(cxs, cys);
  ctx.lineTo(v.tip.x, v.tip.y);
  ctx.stroke();
}

/**
 * Glint pass — a bright spot travels base→tip along one spike at a
 * time, pulses, then jumps to the next spike. Phase derived from the
 * centroid so multiple clusters don't all sparkle in unison.
 */
function drawGlint(ctx, cs, centroidX, centroidY, cells) {
  if (cells.length === 0) {
    return;
  }
  const cxs = (centroidX + 0.5) * cs;
  const cys = (centroidY + 0.5) * cs;

  // Per-cluster phase offset so each cluster glints on its own clock.
  // Derived deterministically from the centroid so it stays stable
  // across frames.
  const phaseOffset = centroidPhase(centroidX, centroidY);
  const now = Date.now() + phaseOffset;
  const totalPeriod = GLINT_PERIOD_MS * cells.length;
  const t = (now % totalPeriod) / GLINT_PERIOD_MS;
  const spikeIdx = Math.floor(t) % cells.length;
  const local = t - Math.floor(t); // 0..1 within this spike's period

  if (local > GLINT_VISIBLE_FRACTION) {
    return;
  }
  const progress = local / GLINT_VISIBLE_FRACTION; // 0..1 base→tip
  // Sine envelope — fade in, peak, fade out across this spike.
  const intensity = Math.sin(progress * Math.PI);

  const v = spikeVerts(cs, cxs, cys, cells[spikeIdx]);
  if (!v) {
    return;
  }
  const glintX = cxs + v.ux * v.length * progress;
  const glintY = cys + v.uy * v.length * progress;
  const radius = cs * 0.18;

  ctx.save();
  // Clip to cluster cells so the glow doesn't bleed into corridors.
  ctx.clip(buildClusterClipPath(cs, cells));
  ctx.globalCompositeOperation = "lighter";
  const grad = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, radius);
  grad.addColorStop(0, `rgba(255, 250, 255, ${0.9 * intensity})`);
  grad.addColorStop(0.5, `rgba(220, 200, 240, ${0.4 * intensity})`);
  grad.addColorStop(1, "rgba(255, 250, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(glintX - radius, glintY - radius, radius * 2, radius * 2);
  ctx.restore();
}

function centroidPhase(cx, cy) {
  const ix = Math.floor(cx * 10);
  const iy = Math.floor(cy * 10);
  let h = ((ix * 73856093) ^ (iy * 19349663)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return h % 10_000;
}

/**
 * Telegraph render — dashed cyan wireframe of the upcoming cluster
 * with a very faint cyan tint inside. Visually distinct from the
 * filled lavender-purple of a placed crystal so the player reads the
 * preview at a glance.
 */
function drawTelegraphShape(ctx, cs, centroidX, centroidY, cells) {
  const cxs = (centroidX + 0.5) * cs;
  const cys = (centroidY + 0.5) * cs;

  ctx.save();
  ctx.clip(buildClusterClipPath(cs, cells));
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = TELEGRAPH_STROKE;
  ctx.fillStyle = TELEGRAPH_FILL;

  for (const cell of cells) {
    const v = spikeVerts(cs, cxs, cys, cell);
    if (!v) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(v.baseLeft.x, v.baseLeft.y);
    ctx.lineTo(v.shoulderLeft.x, v.shoulderLeft.y);
    ctx.lineTo(v.tip.x, v.tip.y);
    ctx.lineTo(v.shoulderRight.x, v.shoulderRight.y);
    ctx.lineTo(v.baseRight.x, v.baseRight.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Mass outline — dashed circle around the cluster's centre.
  ctx.beginPath();
  ctx.arc(cxs, cys, cs * MASS_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}
