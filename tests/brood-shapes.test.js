// brood-shapes.test.js — tests for the brood kin shape pool.

import { describe, it, expect } from "vitest";
import {
  SHAPES,
  SHAPE_IDS,
  TOTAL_KIN_CELLS,
  shapeCells,
  shapeHeadCell,
  shapeOrientations,
} from "../src/core/generation/brood/shapes.js";

const EXPECTED_CELL_COUNTS = {
  i5: 5,
  i4: 4,
  i3: 3,
  i2: 2,
  t: 4,
  l: 4,
};

const EXPECTED_ROTATION_COUNTS = {
  i5: 4,
  i4: 4,
  i3: 4,
  i2: 4,
  t: 4,
  l: 4,
};

describe("brood shape pool", () => {
  it("has all six shapes", () => {
    expect(SHAPE_IDS).toEqual(["i5", "i4", "i3", "i2", "t", "l"]);
    expect(Object.keys(SHAPES).sort()).toEqual(SHAPE_IDS.slice().sort());
  });

  it("total cell count matches 22", () => {
    const total = SHAPE_IDS.reduce((sum, id) => sum + EXPECTED_CELL_COUNTS[id], 0);
    expect(total).toBe(22);
    expect(TOTAL_KIN_CELLS).toBe(22);
  });

  it("each shape has expected cell count in every rotation", () => {
    for (const id of SHAPE_IDS) {
      const shape = SHAPES[id];
      const expected = EXPECTED_CELL_COUNTS[id];
      for (let r = 0; r < shape.rotations.length; r++) {
        expect(shape.rotations[r].length).toBe(expected);
      }
    }
  });

  it("each shape has the expected number of rotations", () => {
    for (const id of SHAPE_IDS) {
      const shape = SHAPES[id];
      expect(shape.rotations.length).toBe(EXPECTED_ROTATION_COUNTS[id]);
    }
  });

  it("head cell is at [0, 0] in every rotation of every shape", () => {
    for (const id of SHAPE_IDS) {
      const shape = SHAPES[id];
      for (let r = 0; r < shape.rotations.length; r++) {
        const cells = shape.rotations[r];
        expect(cells[0]).toEqual([0, 0]);
      }
    }
  });

  it("rotations contain no duplicate cells within a single rotation", () => {
    for (const id of SHAPE_IDS) {
      const shape = SHAPES[id];
      for (let r = 0; r < shape.rotations.length; r++) {
        const cells = shape.rotations[r];
        const seen = new Set();
        for (const [dx, dy] of cells) {
          const key = `${dx},${dy}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  it("rotations are connected — every cell touches another orthogonally", () => {
    for (const id of SHAPE_IDS) {
      const shape = SHAPES[id];
      for (let r = 0; r < shape.rotations.length; r++) {
        const cells = shape.rotations[r];
        const cellSet = new Set(cells.map(([x, y]) => `${x},${y}`));
        // BFS from head — every other cell must be reachable through
        // orthogonal neighbours.
        const reached = new Set([`${cells[0][0]},${cells[0][1]}`]);
        const queue = [cells[0]];
        while (queue.length > 0) {
          const [x, y] = queue.shift();
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            const key = `${nx},${ny}`;
            if (cellSet.has(key) && !reached.has(key)) {
              reached.add(key);
              queue.push([nx, ny]);
            }
          }
        }
        expect(reached.size).toBe(cells.length);
      }
    }
  });
});

describe("shape helpers", () => {
  it("shapeCells returns the rotation's cell list", () => {
    expect(shapeCells(SHAPES.i2, 0)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(shapeCells(SHAPES.i2, 1)).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(shapeCells(SHAPES.i2, 2)).toEqual([
      [0, 0],
      [-1, 0],
    ]);
    expect(shapeCells(SHAPES.i2, 3)).toEqual([
      [0, 0],
      [0, -1],
    ]);
  });

  it("shapeCells wraps out-of-range indices via modulo", () => {
    expect(shapeCells(SHAPES.t, 4)).toEqual(shapeCells(SHAPES.t, 0));
    expect(shapeCells(SHAPES.t, 5)).toEqual(shapeCells(SHAPES.t, 1));
    expect(shapeCells(SHAPES.t, -1)).toEqual(shapeCells(SHAPES.t, 3));
    expect(shapeCells(SHAPES.i5, 4)).toEqual(shapeCells(SHAPES.i5, 0));
  });

  it("shapeHeadCell always returns [0, 0]", () => {
    for (const id of SHAPE_IDS) {
      const shape = SHAPES[id];
      for (let r = 0; r < shape.rotations.length; r++) {
        expect(shapeHeadCell(shape, r)).toEqual([0, 0]);
      }
    }
  });

  it("shapeOrientations returns the full rotations array", () => {
    expect(shapeOrientations(SHAPES.l)).toBe(SHAPES.l.rotations);
    expect(shapeOrientations(SHAPES.l).length).toBe(4);
  });
});

describe("specific shape geometries (sanity)", () => {
  it("T stem-up has head above bar", () => {
    const cells = SHAPES.t.rotations[0];
    expect(cells[0]).toEqual([0, 0]);
    // The other three cells form a horizontal bar one row below.
    const bar = cells.slice(1);
    expect(bar.every(([, y]) => y === 1)).toBe(true);
    const xs = bar.map(([x]) => x).sort();
    expect(xs).toEqual([-1, 0, 1]);
  });

  it("L 0deg has corner head + foot east + stem north", () => {
    const cells = SHAPES.l.rotations[0];
    expect(cells[0]).toEqual([0, 0]);
    expect(cells).toContainEqual([1, 0]);
    expect(cells).toContainEqual([0, -1]);
    expect(cells).toContainEqual([0, -2]);
  });

  it("i5 horizontal spans 5 cells in a row from the head", () => {
    const cells = SHAPES.i5.rotations[0];
    expect(cells.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(cells[i]).toEqual([i, 0]);
    }
  });
});
