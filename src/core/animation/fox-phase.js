// fox-phase.js — Shared phase + position math for the fox cutscene.
//
// Both canvas and terminal renderers compute the same 5-phase
// trajectory; only their output precision differs (canvas uses
// fractional cells, terminal snaps to integers). Centralising the
// math here keeps the two renderers in sync when we tune timing.
//
// Phases (fractions of total duration):
//   0.00 – 0.30  walk-in   slow walk from off-screen to "notice" spot
//   0.30 – 0.42  notice    hold at notice spot, sizing up the food
//   0.42 – 0.55  pounce    fast arc from notice spot onto the target
//   0.55 – 0.78  chew      sit on the target (food/boss hidden by fox)
//   0.78 – 1.00  leave     arc back out to the entry edge

export const PHASE_WALK_IN_END = 0.3;
export const PHASE_NOTICE_END = 0.42;
export const PHASE_POUNCE_END = 0.55;
export const PHASE_CHEW_END = 0.78;

// Cells inside the entry edge where the fox stops to "notice" the food.
// Sized so the full sprite (~8 cells wide on canvas, 7 on terminal) sits
// fully in view with a cell or two of buffer from the edge.
const NOTICE_INSET_CELLS = 5;
// Off-screen distance (cells) where the fox spawns / exits.
const EDGE_OFFSCREEN_CELLS = 5;
// Vertical arc height (cells) added to the pounce + leave trajectories.
const ARC_HEIGHT_CELLS = 4;

// Walking-frame swap cadence (ms). Slower during the "notice" beat so it
// reads as a held pose with a tiny tail-wag bob rather than a brisk
// shuffle.
const WALK_STEP_MS = 220;
const NOTICE_STEP_MS = 360;

/**
 * @typedef {Object} FoxFrameInfo
 * @property {string} frameName    — "walk-a" | "walk-b" | "pounce"
 * @property {number} x            — fox sprite-centre x in fractional cells
 * @property {number} y            — fox sprite-centre y in fractional cells
 * @property {string} phase        — "walk-in" | "notice" | "pounce" | "chew" | "leave"
 */

/**
 * Resolves the fox's current frame + position from the animation state
 * and elapsed time.
 *
 * @param {{ targetX: number, targetY: number, edge: "top"|"bottom"|"left"|"right" }} anim
 * @param {number} elapsed    — ms since trigger
 * @param {number} duration   — total cutscene duration (ms)
 * @param {number} gridW
 * @param {number} gridH
 * @returns {FoxFrameInfo}
 */
export function computeFoxFrame(anim, elapsed, duration, gridW, gridH) {
  const t = Math.min(1, elapsed / duration);
  const edge = edgePoint(anim.edge, anim.targetX, anim.targetY, gridW, gridH);
  const notice = noticePoint(anim.edge, anim.targetX, anim.targetY, gridW, gridH);
  const target = { x: anim.targetX, y: anim.targetY };

  if (t < PHASE_WALK_IN_END) {
    const local = t / PHASE_WALK_IN_END;
    return {
      phase: "walk-in",
      frameName: walkFrame(elapsed, WALK_STEP_MS),
      x: lerp(edge.x, notice.x, local),
      y: lerp(edge.y, notice.y, local),
    };
  }
  if (t < PHASE_NOTICE_END) {
    // Held pose at the notice spot with a slow walk-a/walk-b swap to
    // suggest a wagging-tail bob.
    return {
      phase: "notice",
      frameName: walkFrame(elapsed, NOTICE_STEP_MS),
      x: notice.x,
      y: notice.y,
    };
  }
  if (t < PHASE_POUNCE_END) {
    const local = (t - PHASE_NOTICE_END) / (PHASE_POUNCE_END - PHASE_NOTICE_END);
    const p = arcPoint(notice, target, local);
    return { phase: "pounce", frameName: "pounce", x: p.x, y: p.y };
  }
  if (t < PHASE_CHEW_END) {
    return { phase: "chew", frameName: "chew", x: target.x, y: target.y };
  }
  const local = (t - PHASE_CHEW_END) / (1 - PHASE_CHEW_END);
  const p = arcPoint(target, edge, local);
  return {
    phase: "leave",
    frameName: walkFrame(elapsed, WALK_STEP_MS),
    x: p.x,
    y: p.y,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function walkFrame(elapsed, stepMs) {
  return Math.floor(elapsed / stepMs) % 2 === 0 ? "walk-a" : "walk-b";
}

/**
 * Parabolic interpolation between two points — the fox arcs UP in
 * screen space (subtract from y, since y grows downward) at mid-flight.
 */
function arcPoint(start, end, t) {
  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t) - ARC_HEIGHT_CELLS * Math.sin(t * Math.PI),
  };
}

function edgePoint(edge, tx, ty, gridW, gridH) {
  switch (edge) {
    case "top":
      return { x: tx, y: -EDGE_OFFSCREEN_CELLS };
    case "bottom":
      return { x: tx, y: gridH + EDGE_OFFSCREEN_CELLS };
    case "left":
      return { x: -EDGE_OFFSCREEN_CELLS, y: ty };
    case "right":
    default:
      return { x: gridW + EDGE_OFFSCREEN_CELLS, y: ty };
  }
}

/**
 * The fox's "notice" spot — just inside the entry edge so the whole
 * sprite is on-screen but the fox hasn't traversed the field yet. Stays
 * on the same row/col as the target so the walk-in is a straight line.
 */
function noticePoint(edge, tx, ty, gridW, gridH) {
  switch (edge) {
    case "top":
      return { x: tx, y: NOTICE_INSET_CELLS };
    case "bottom":
      return { x: tx, y: gridH - 1 - NOTICE_INSET_CELLS };
    case "left":
      return { x: NOTICE_INSET_CELLS, y: ty };
    case "right":
    default:
      return { x: gridW - 1 - NOTICE_INSET_CELLS, y: ty };
  }
}
