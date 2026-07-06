// shapes.js — Brood kin shape pool.
//
// Six shapes, one of each: 1x5, 1x4, 1x3, 1x2, T, L (PLAN.brood-adr.md
// D5). Each shape is defined by its rotation states; the player picks
// the rotation during placement (Step 4).
//
// Cell representation
// -------------------
// Every rotation is an array of `[dx, dy]` offsets. The first entry is
// the head cell, anchored at `[0, 0]`; subsequent entries are offsets
// relative to the head. Memorial rendering paints the gravestone glyph
// on the head cell (D7).
//
// Head conventions per shape (D5):
//   - 1xN — leftmost (horizontal) / topmost (vertical) end.
//   - T   — the stem cell (the lone cell perpendicular to the bar).
//   - L   — the corner cell (where the bend is).
//
// Rotation counts (D5):
//   - 1xN — 4 rotations. The body cells are visually the same in two
//           pairs (east/west horizontal; south/north vertical), but the
//           head sits at a different end in each — and the head is
//           where the gravestone lands on death (D7), so each rotation
//           is mechanically distinct. Cycling through 4 also matches
//           the T and L cadence, which reads more consistently to the
//           player.
//   - T   — 4 rotations (stem up / right / down / left).
//   - L   — 4 rotations (0deg / 90deg CW / 180deg / 270deg CW from
//           the canonical "corner-bottom-left, foot-east, stem-north"
//           starting orientation).

/**
 * @typedef {[number, number]} CellOffset
 *   `[dx, dy]` relative to the head cell.
 */

/**
 * @typedef {Object} Shape
 * @property {string} id
 *   Stable string id; matches the property name in `SHAPES`.
 * @property {CellOffset[][]} rotations
 *   One entry per rotation state. Each entry is the shape's cell list
 *   in that rotation, head first at `[0, 0]`.
 */

/** @type {Record<string, Shape>} */
export const SHAPES = {
  i5: {
    id: "i5",
    rotations: [
      // East — head left, body extends right.
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
      ],
      // South — head top, body extends down.
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
      ],
      // West — head right, body extends left.
      [
        [0, 0],
        [-1, 0],
        [-2, 0],
        [-3, 0],
        [-4, 0],
      ],
      // North — head bottom, body extends up.
      [
        [0, 0],
        [0, -1],
        [0, -2],
        [0, -3],
        [0, -4],
      ],
    ],
  },

  i4: {
    id: "i4",
    rotations: [
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ],
      [
        [0, 0],
        [-1, 0],
        [-2, 0],
        [-3, 0],
      ],
      [
        [0, 0],
        [0, -1],
        [0, -2],
        [0, -3],
      ],
    ],
  },

  i3: {
    id: "i3",
    rotations: [
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
      [
        [0, 0],
        [-1, 0],
        [-2, 0],
      ],
      [
        [0, 0],
        [0, -1],
        [0, -2],
      ],
    ],
  },

  i2: {
    id: "i2",
    rotations: [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [-1, 0],
      ],
      [
        [0, 0],
        [0, -1],
      ],
    ],
  },

  t: {
    id: "t",
    rotations: [
      // Stem up: head at top, bar below.
      [
        [0, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ],
      // Stem right: head to the right, bar to the left (vertical).
      [
        [0, 0],
        [-1, -1],
        [-1, 0],
        [-1, 1],
      ],
      // Stem down: head at bottom, bar above.
      [
        [0, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
      ],
      // Stem left: head to the left, bar to the right (vertical).
      [
        [0, 0],
        [1, -1],
        [1, 0],
        [1, 1],
      ],
    ],
  },

  l: {
    id: "l",
    rotations: [
      // 0deg — corner head bottom-left; foot east, stem north.
      [
        [0, 0],
        [1, 0],
        [0, -1],
        [0, -2],
      ],
      // 90deg CW — corner head top-left; foot south, stem east.
      [
        [0, 0],
        [0, 1],
        [1, 0],
        [2, 0],
      ],
      // 180deg — corner head top-right; foot west, stem south.
      [
        [0, 0],
        [-1, 0],
        [0, 1],
        [0, 2],
      ],
      // 270deg CW — corner head bottom-right; foot north, stem west.
      [
        [0, 0],
        [0, -1],
        [-1, 0],
        [-2, 0],
      ],
    ],
  },
};

/** Stable iteration order for the placement pool (D18). */
export const SHAPE_IDS = ["i5", "i4", "i3", "i2", "t", "l"];

/** Total cell count of all kin combined (for assertions / score math). */
export const TOTAL_KIN_CELLS = 22;

/**
 * Returns the cell offsets for a shape at a given rotation index. Wraps
 * out-of-range indices via modulo so `R` rotation cycling can naively
 * increment.
 *
 * @param {Shape} shape
 * @param {number} rotationIndex
 * @returns {CellOffset[]}
 */
export function shapeCells(shape, rotationIndex) {
  const rotations = shape.rotations;
  const i = ((rotationIndex % rotations.length) + rotations.length) % rotations.length;
  return rotations[i];
}

/**
 * Returns the head cell offset for a shape — always `[0, 0]` by
 * convention. Exported so call sites don't hard-code the anchor.
 *
 * @param {Shape} _shape
 * @param {number} _rotationIndex
 * @returns {CellOffset}
 */
export function shapeHeadCell(_shape, _rotationIndex) {
  return [0, 0];
}

/**
 * Returns all rotation states for a shape.
 *
 * @param {Shape} shape
 * @returns {CellOffset[][]}
 */
export function shapeOrientations(shape) {
  return shape.rotations;
}
