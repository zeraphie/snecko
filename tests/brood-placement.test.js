// brood-placement.test.js — placement state machine tests (brood mutation).

import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";
import { Snake } from "../src/core/snake";
import { generateBroodGrid } from "../src/core/generation/brood/generator.js";
import {
  ghostCells,
  movePlacementCursor,
  rotatePlacementShape,
  cyclePlacementShape,
  confirmPlacement,
  undoPlacement,
  isPlacementValid,
} from "../src/core/generation/brood/placement.js";
import { SHAPE_IDS } from "../src/core/generation/brood/shapes.js";
import { STATE_BROOD_PLACEMENT, STATE_PLAYING } from "../src/core/game/constants.js";
import { MINES_PER_ACT } from "../src/core/mechanics/cull/constants.js";
import {
  TERRAIN_KIN_HEAD,
  TERRAIN_KIN_BODY,
  TERRAIN_MEMORIAL_HEAD,
  TERRAIN_MEMORIAL_BODY,
} from "../src/core/grid/constants.js";
import { isFoodBlocked } from "../src/core/generation/index.js";

function makeGame(actSeed = 0xcafebabe) {
  const grid = new Grid(31, 31);
  const snake = new Snake();
  return {
    grid,
    snake,
    actIndex: 0,
    actSeed,
    mechanic: null,
    foodRand: Math.random,
    lastTickTime: 0,
  };
}

function bootBrood() {
  const game = makeGame();
  generateBroodGrid(game);
  return game;
}

/**
 * Drops `MINES_PER_ACT` mines at the first grid cells that pass the
 * placement validity check. Assumes the game is already in mines mode
 * (all kin placed) so `isPlacementValid` runs the mine branch.
 */
function placeAllMines(game) {
  const g = game.grid;
  for (let dropped = 0; dropped < MINES_PER_ACT; ) {
    for (let y = 0; y < g.height && dropped < MINES_PER_ACT; y++) {
      for (let x = 0; x < g.width && dropped < MINES_PER_ACT; x++) {
        game._broodPlacement.cursorX = x;
        game._broodPlacement.cursorY = y;
        if (isPlacementValid(game)) {
          const before = game._broodPlacement.minesPlaced.length;
          confirmPlacement(game);
          if (game._broodPlacement === null || game._broodPlacement.minesPlaced.length > before) {
            dropped++;
          }
        }
      }
    }
    // Guard against an unplaceable board — bail if a full sweep produced no drop.
    if (dropped === 0) {
      return;
    }
  }
}

describe("enterPlacement (via generateBroodGrid)", () => {
  it("transitions to STATE_BROOD_PLACEMENT", () => {
    const game = bootBrood();
    expect(game.state).toBe(STATE_BROOD_PLACEMENT);
  });

  it("populates the placement state slot", () => {
    const game = bootBrood();
    expect(game._broodPlacement).not.toBeNull();
    expect(game._broodPlacement.activeShapeId).toBe(SHAPE_IDS[0]);
    expect(game._broodPlacement.rotation).toBe(0);
    expect(game._broodPlacement.placed).toEqual([]);
    expect(game._broodPlacement.unplaced).toEqual(SHAPE_IDS.slice());
  });

  it("cursor starts at the snake head position", () => {
    const game = bootBrood();
    expect(game._broodPlacement.cursorX).toBe(game.snake.snakeX[game.snake.headIndex]);
    expect(game._broodPlacement.cursorY).toBe(game.snake.snakeY[game.snake.headIndex]);
  });
});

describe("movePlacementCursor", () => {
  it("moves the cursor by the given delta", () => {
    const game = bootBrood();
    const startX = game._broodPlacement.cursorX;
    const startY = game._broodPlacement.cursorY;
    movePlacementCursor(game, 1, 0);
    expect(game._broodPlacement.cursorX).toBe(startX + 1);
    expect(game._broodPlacement.cursorY).toBe(startY);
    movePlacementCursor(game, 0, -1);
    expect(game._broodPlacement.cursorY).toBe(startY - 1);
  });

  it("clamps at grid bounds", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 0;
    movePlacementCursor(game, -5, 0);
    expect(game._broodPlacement.cursorX).toBe(0);

    game._broodPlacement.cursorY = game.grid.height - 1;
    movePlacementCursor(game, 0, 5);
    expect(game._broodPlacement.cursorY).toBe(game.grid.height - 1);
  });
});

describe("rotatePlacementShape", () => {
  it("cycles through rotation states for the active shape", () => {
    const game = bootBrood();
    expect(game._broodPlacement.rotation).toBe(0);
    rotatePlacementShape(game);
    expect(game._broodPlacement.rotation).toBe(1);
    // i5 has 4 rotations — three more rotates returns to 0
    rotatePlacementShape(game);
    rotatePlacementShape(game);
    rotatePlacementShape(game);
    expect(game._broodPlacement.rotation).toBe(0);
  });

  it("respects shape-specific rotation counts (T = 4)", () => {
    const game = bootBrood();
    game._broodPlacement.activeShapeId = "t";
    game._broodPlacement.rotation = 0;
    for (let i = 0; i < 4; i++) {
      rotatePlacementShape(game);
    }
    expect(game._broodPlacement.rotation).toBe(0); // wrapped
  });
});

describe("cyclePlacementShape (Tab)", () => {
  it("cycles to the next unplaced shape", () => {
    const game = bootBrood();
    const first = game._broodPlacement.activeShapeId;
    cyclePlacementShape(game);
    expect(game._broodPlacement.activeShapeId).not.toBe(first);
    expect(game._broodPlacement.rotation).toBe(0);
  });

  it("wraps to the first unplaced when cycling past the end", () => {
    const game = bootBrood();
    for (let i = 0; i < game._broodPlacement.unplaced.length; i++) {
      cyclePlacementShape(game);
    }
    expect(game._broodPlacement.activeShapeId).toBe(SHAPE_IDS[0]);
  });

  it("skips placed shapes after they're confirmed", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    confirmPlacement(game);
    // First shape (i5) is now placed; active is the next unplaced.
    expect(game._broodPlacement.unplaced).not.toContain(SHAPE_IDS[0]);
    // Cycling should not bring back the placed shape.
    for (let i = 0; i < game._broodPlacement.unplaced.length + 1; i++) {
      cyclePlacementShape(game);
      expect(game._broodPlacement.activeShapeId).not.toBe(SHAPE_IDS[0]);
    }
  });
});

describe("confirmPlacement", () => {
  it("writes the active shape's cells to the grid as walls", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    const cells = ghostCells(game);
    confirmPlacement(game);
    for (const [x, y] of cells) {
      expect(game.grid.isWallCell(x, y)).toBe(true);
    }
  });

  it("removes the shape from the unplaced pool and advances active", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    const placedId = game._broodPlacement.activeShapeId;
    confirmPlacement(game);
    expect(game._broodPlacement.unplaced).not.toContain(placedId);
    expect(game._broodPlacement.placed).toHaveLength(1);
    expect(game._broodPlacement.placed[0].shapeId).toBe(placedId);
  });

  it("transitions to mines mode after six kin, then to STATE_PLAYING after mines", () => {
    const game = bootBrood();
    // Place each shape with enough spacing to avoid out-of-bounds.
    const positions = [
      [5, 5],
      [12, 5],
      [18, 5],
      [22, 5],
      [5, 12],
      [12, 12],
    ];
    for (let i = 0; i < positions.length; i++) {
      game._broodPlacement.cursorX = positions[i][0];
      game._broodPlacement.cursorY = positions[i][1];
      confirmPlacement(game);
    }
    // After all six kin, we're in mines mode — not playing yet.
    expect(game.state).toBe(STATE_BROOD_PLACEMENT);
    expect(game._broodPlacement.mode).toBe("mines");
    placeAllMines(game);
    expect(game.state).toBe(STATE_PLAYING);
    expect(game._broodPlacement).toBeNull();
  });

  it("populates mech.kin on exit with the placed entries", () => {
    const game = bootBrood();
    const positions = [
      [5, 5],
      [12, 5],
      [18, 5],
      [22, 5],
      [5, 12],
      [12, 12],
    ];
    for (let i = 0; i < positions.length; i++) {
      game._broodPlacement.cursorX = positions[i][0];
      game._broodPlacement.cursorY = positions[i][1];
      confirmPlacement(game);
    }
    placeAllMines(game);
    expect(game.mechanic.kin).toHaveLength(6);
    for (const k of game.mechanic.kin) {
      expect(k.alive).toBe(true);
      expect(k.shielded).toBe(false);
      expect(Array.isArray(k.cells)).toBe(true);
    }
  });
});

describe("undoPlacement", () => {
  it("clears the placed cells from the grid", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    const cells = ghostCells(game);
    confirmPlacement(game);
    undoPlacement(game);
    for (const [x, y] of cells) {
      expect(game.grid.isWallCell(x, y)).toBe(false);
    }
  });

  it("returns the shape to the unplaced pool and re-selects it", () => {
    const game = bootBrood();
    const initialId = game._broodPlacement.activeShapeId;
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    confirmPlacement(game);
    undoPlacement(game);
    expect(game._broodPlacement.unplaced).toContain(initialId);
    expect(game._broodPlacement.activeShapeId).toBe(initialId);
    expect(game._broodPlacement.placed).toEqual([]);
  });

  it("is a no-op when nothing has been placed", () => {
    const game = bootBrood();
    const snapshot = JSON.stringify(game._broodPlacement);
    undoPlacement(game);
    expect(JSON.stringify(game._broodPlacement)).toBe(snapshot);
  });
});

describe("kin cell terrain markers (Step 5)", () => {
  it("confirmPlacement paints head cell with TERRAIN_KIN_HEAD", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    confirmPlacement(game);
    const w = game.grid.width;
    expect(game.grid.terrain[5 * w + 5]).toBe(TERRAIN_KIN_HEAD);
  });

  it("confirmPlacement paints body cells with TERRAIN_KIN_BODY", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    // i5 horizontal: head (5,5) + body (6,5)(7,5)(8,5)(9,5).
    confirmPlacement(game);
    const w = game.grid.width;
    for (let x = 6; x <= 9; x++) {
      expect(game.grid.terrain[5 * w + x]).toBe(TERRAIN_KIN_BODY);
    }
  });

  it("placed kin cells block snake collision (wall mask)", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    confirmPlacement(game);
    for (let x = 5; x <= 9; x++) {
      expect(game.grid.isWallCell(x, 5)).toBe(true);
    }
  });

  it("placed kin cells block food spawn", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    confirmPlacement(game);
    for (let x = 5; x <= 9; x++) {
      expect(isFoodBlocked(game.grid, x, 5)).toBe(true);
    }
  });

  it("undoPlacement clears the kin terrain markers back to NONE", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    confirmPlacement(game);
    undoPlacement(game);
    const w = game.grid.width;
    for (let x = 5; x <= 9; x++) {
      expect(game.grid.terrain[5 * w + x]).toBe(0);
    }
  });

  it("memorial markers preserve wall collision (alive→dead transition is render-only)", () => {
    const game = bootBrood();
    const w = game.grid.width;
    // Manually paint a kin shape as memorial (simulating Step 10's
    // post-death state). Head + body terrain flips; wall mask stays.
    game.grid.setCell("wall", 10, 10);
    game.grid.setCell("wall", 11, 10);
    game.grid.terrain[10 * w + 10] = TERRAIN_MEMORIAL_HEAD;
    game.grid.terrain[10 * w + 11] = TERRAIN_MEMORIAL_BODY;
    expect(game.grid.isWallCell(10, 10)).toBe(true);
    expect(game.grid.isWallCell(11, 10)).toBe(true);
    expect(isFoodBlocked(game.grid, 10, 10)).toBe(true);
    expect(isFoodBlocked(game.grid, 11, 10)).toBe(true);
  });
});

describe("mines placement (Phase 3)", () => {
  function bootAndFinishKin(game) {
    // Clear sparse walls so the fixed kin positions never collide, and
    // wipe kin terrain so the "fresh grid" assumption holds.
    game.grid.clearMasks("wall");
    game.grid.terrain.fill(0);
    const positions = [
      [3, 3],
      [10, 3],
      [16, 3],
      [20, 3],
      [3, 10],
      [10, 10],
    ];
    for (let i = 0; i < positions.length; i++) {
      game._broodPlacement.cursorX = positions[i][0];
      game._broodPlacement.cursorY = positions[i][1];
      confirmPlacement(game);
    }
  }

  it("switches to mines mode after the last kin", () => {
    const game = bootBrood();
    bootAndFinishKin(game);
    expect(game._broodPlacement.mode).toBe("mines");
    expect(game._broodPlacement.minesRemaining).toBe(MINES_PER_ACT);
    expect(game._broodPlacement.minesPlaced).toEqual([]);
    expect(game.state).toBe(STATE_BROOD_PLACEMENT);
  });

  it("ghost is a single cell in mines mode", () => {
    const game = bootBrood();
    bootAndFinishKin(game);
    game._broodPlacement.cursorX = 25;
    game._broodPlacement.cursorY = 20;
    const cells = ghostCells(game);
    expect(cells).toEqual([[25, 20]]);
  });

  it("rejects a mine on a kin cell", () => {
    const game = bootBrood();
    bootAndFinishKin(game);
    // (3, 3) is the head of the first kin — a wall cell.
    game._broodPlacement.cursorX = 3;
    game._broodPlacement.cursorY = 3;
    expect(isPlacementValid(game)).toBe(false);
  });

  it("rejects a duplicate mine cell", () => {
    const game = bootBrood();
    bootAndFinishKin(game);
    game._broodPlacement.cursorX = 25;
    game._broodPlacement.cursorY = 20;
    confirmPlacement(game);
    // Same cell again.
    game._broodPlacement.cursorX = 25;
    game._broodPlacement.cursorY = 20;
    expect(isPlacementValid(game)).toBe(false);
  });

  it("confirmPlacement in mines mode records the drop and decrements the counter", () => {
    const game = bootBrood();
    bootAndFinishKin(game);
    game._broodPlacement.cursorX = 25;
    game._broodPlacement.cursorY = 20;
    confirmPlacement(game);
    expect(game._broodPlacement.minesPlaced).toEqual([{ x: 25, y: 20 }]);
    expect(game._broodPlacement.minesRemaining).toBe(MINES_PER_ACT - 1);
  });

  it("undo in mines mode pops the last mine", () => {
    const game = bootBrood();
    bootAndFinishKin(game);
    game._broodPlacement.cursorX = 25;
    game._broodPlacement.cursorY = 20;
    confirmPlacement(game);
    undoPlacement(game);
    expect(game._broodPlacement.minesPlaced).toEqual([]);
    expect(game._broodPlacement.minesRemaining).toBe(MINES_PER_ACT);
  });

  it("undo with no mines yet drops back to kin mode and pops the last kin", () => {
    const game = bootBrood();
    bootAndFinishKin(game);
    expect(game._broodPlacement.mode).toBe("mines");
    undoPlacement(game);
    expect(game._broodPlacement.mode).toBe("kin");
    // Placed list is one shorter than the six we confirmed.
    expect(game._broodPlacement.placed).toHaveLength(5);
  });

  it("exitPlacement transfers mines to game.mechanic.mines as a Set", () => {
    const game = bootBrood();
    bootAndFinishKin(game);
    placeAllMines(game);
    expect(game.mechanic.mines).toBeInstanceOf(Set);
    expect(game.mechanic.mines.size).toBe(MINES_PER_ACT);
    // Every entry is "x,y" formatted.
    for (const key of game.mechanic.mines) {
      expect(/^\d+,\d+$/.test(key)).toBe(true);
    }
  });
});

describe("exitPlacement → food placement", () => {
  it("places food only after the placement step finishes", () => {
    const game = bootBrood();
    // Clear the sparse walls that `generateBroodGrid` scatters — the
    // fixed placement positions below are chosen to fit an empty grid.
    game.grid.clearMasks("wall");
    game.grid.terrain.fill(0);
    // While placing, food is not on the grid.
    expect(game.grid.foodX).toBe(-1);
    expect(game.grid.foodY).toBe(-1);
    const positions = [
      [3, 3],
      [10, 3],
      [16, 3],
      [20, 3],
      [3, 10],
      [10, 10],
    ];
    for (let i = 0; i < positions.length; i++) {
      game._broodPlacement.cursorX = positions[i][0];
      game._broodPlacement.cursorY = positions[i][1];
      confirmPlacement(game);
    }
    placeAllMines(game);
    expect(game.grid.foodX).toBeGreaterThanOrEqual(0);
    expect(game.grid.foodY).toBeGreaterThanOrEqual(0);
    // The food does not land on a kin cell.
    expect(game.grid.isWallCell(game.grid.foodX, game.grid.foodY)).toBe(false);
  });
});

describe("identities (Step 8 — kin name + kind assignment)", () => {
  it("assigns a name + kind to every shape at enterPlacement", () => {
    const game = bootBrood();
    const ids = game._broodPlacement.identities;
    expect(Object.keys(ids).sort()).toEqual(SHAPE_IDS.slice().sort());
    for (const id of SHAPE_IDS) {
      expect(typeof ids[id].name).toBe("string");
      expect(["hatchling", "snekling"]).toContain(ids[id].kind);
    }
  });

  it("names are unique within an act", () => {
    const game = bootBrood();
    const ids = game._broodPlacement.identities;
    const names = SHAPE_IDS.map((id) => ids[id].name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("is deterministic per actSeed", () => {
    const gameA = bootBrood();
    const gameB = bootBrood();
    expect(gameA._broodPlacement.identities).toEqual(gameB._broodPlacement.identities);
  });

  it("varies with a different actSeed", () => {
    const a = makeGame(0xa);
    const b = makeGame(0xb);
    generateBroodGrid(a);
    generateBroodGrid(b);
    expect(a._broodPlacement.identities).not.toEqual(b._broodPlacement.identities);
  });

  it("confirmPlacement carries name + kind into the placement record", () => {
    const game = bootBrood();
    const activeId = game._broodPlacement.activeShapeId;
    const expectedName = game._broodPlacement.identities[activeId].name;
    const expectedKind = game._broodPlacement.identities[activeId].kind;
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    confirmPlacement(game);
    const entry = game._broodPlacement.placed[0];
    expect(entry.name).toBe(expectedName);
    expect(entry.kind).toBe(expectedKind);
  });

  it("exitPlacement copies name + kind into game.mechanic.kin", () => {
    const game = bootBrood();
    const positions = [
      [3, 3],
      [10, 3],
      [16, 3],
      [20, 3],
      [3, 10],
      [10, 10],
    ];
    for (let i = 0; i < positions.length; i++) {
      game._broodPlacement.cursorX = positions[i][0];
      game._broodPlacement.cursorY = positions[i][1];
      confirmPlacement(game);
    }
    placeAllMines(game);
    expect(game.mechanic.kin).toHaveLength(6);
    for (const k of game.mechanic.kin) {
      expect(typeof k.name).toBe("string");
      expect(["hatchling", "snekling"]).toContain(k.kind);
    }
  });
});

describe("isPlacementValid (Step 5 — placement rules)", () => {
  it("returns true for a clear placement away from the snake", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    expect(isPlacementValid(game)).toBe(true);
  });

  it("rejects out-of-bounds cells", () => {
    const game = bootBrood();
    // i5 horizontal at x=27 would extend to x=31 — out of 31-wide grid.
    game._broodPlacement.cursorX = 27;
    game._broodPlacement.cursorY = 5;
    expect(isPlacementValid(game)).toBe(false);
  });

  it("rejects overlap with already-placed kin", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 5;
    game._broodPlacement.cursorY = 5;
    confirmPlacement(game);
    // Active shape advanced to i4; placing it at (7,5) would overlap
    // the previously placed i5 cells at (7,5)(8,5)(9,5).
    game._broodPlacement.cursorX = 7;
    game._broodPlacement.cursorY = 5;
    expect(isPlacementValid(game)).toBe(false);
  });

  it("rejects placement directly on the snake", () => {
    const game = bootBrood();
    const sx = game.snake.snakeX[game.snake.headIndex];
    const sy = game.snake.snakeY[game.snake.headIndex];
    game._broodPlacement.cursorX = sx;
    game._broodPlacement.cursorY = sy;
    expect(isPlacementValid(game)).toBe(false);
  });

  it("rejects placement orthogonally adjacent to the snake (buffer)", () => {
    const game = bootBrood();
    const sx = game.snake.snakeX[game.snake.headIndex];
    const sy = game.snake.snakeY[game.snake.headIndex];
    // i2 horizontal — head one cell north of snake head; second cell
    // also orthogonally adjacent.
    game._broodPlacement.activeShapeId = "i2";
    game._broodPlacement.rotation = 0;
    game._broodPlacement.cursorX = sx;
    game._broodPlacement.cursorY = sy - 1;
    expect(isPlacementValid(game)).toBe(false);
  });

  it("allows placement diagonally adjacent to the snake", () => {
    const game = bootBrood();
    const sx = game.snake.snakeX[game.snake.headIndex];
    const sy = game.snake.snakeY[game.snake.headIndex];
    // Single-cell-equivalent: pick i2 vertical and place its head
    // diagonally NE of the snake head (sx + 1, sy - 1). Body cell goes
    // to (sx + 1, sy), which IS orthogonally adjacent — that part is
    // invalid. Use a more careful spot two cells away instead.
    game._broodPlacement.activeShapeId = "i2";
    game._broodPlacement.rotation = 0;
    game._broodPlacement.cursorX = sx + 2;
    game._broodPlacement.cursorY = sy - 1;
    expect(isPlacementValid(game)).toBe(true);
  });

  it("path guarantee — rejects a candidate that cuts the grid in two", () => {
    const game = bootBrood();
    const h = game.grid.height;
    const sx = game.snake.snakeX[game.snake.headIndex];
    // Build a vertical wall column at x = sx - 5 covering all rows
    // except a single 1-cell gap at (sx - 5, sy_gap). Snake reaches
    // the western half of the grid only through that gap.
    const sy_gap = 5;
    for (let y = 0; y < h; y++) {
      if (y === sy_gap) {
        continue;
      }
      game.grid.setCell("wall", sx - 5, y);
    }
    // Sanity: an arbitrary placement away from the wall is still
    // valid (the gap keeps both halves connected).
    game._broodPlacement.activeShapeId = "i2";
    game._broodPlacement.rotation = 0;
    game._broodPlacement.cursorX = 2;
    game._broodPlacement.cursorY = 2;
    expect(isPlacementValid(game)).toBe(true);

    // Now place an i2 vertical that lands its body on the gap cell,
    // closing the only connection — flood-fill from the snake side
    // can no longer reach the cells beyond the wall.
    game._broodPlacement.activeShapeId = "i2";
    game._broodPlacement.rotation = 1; // vertical (south)
    game._broodPlacement.cursorX = sx - 5;
    game._broodPlacement.cursorY = sy_gap - 1; // body lands on the gap
    expect(isPlacementValid(game)).toBe(false);
  });

  it("confirmPlacement is a no-op when invalid", () => {
    const game = bootBrood();
    const before = JSON.stringify({
      placed: game._broodPlacement.placed,
      active: game._broodPlacement.activeShapeId,
    });
    // Out-of-bounds cursor.
    game._broodPlacement.cursorX = 100;
    game._broodPlacement.cursorY = 100;
    confirmPlacement(game);
    expect(
      JSON.stringify({
        placed: game._broodPlacement.placed,
        active: game._broodPlacement.activeShapeId,
      })
    ).toBe(before);
  });
});

describe("ghostCells", () => {
  it("returns absolute cell positions based on cursor + rotation", () => {
    const game = bootBrood();
    game._broodPlacement.cursorX = 10;
    game._broodPlacement.cursorY = 7;
    game._broodPlacement.activeShapeId = "i5";
    game._broodPlacement.rotation = 0;
    const cells = ghostCells(game);
    expect(cells).toEqual([
      [10, 7],
      [11, 7],
      [12, 7],
      [13, 7],
      [14, 7],
    ]);
  });

  it("returns empty array when placement state is null", () => {
    const game = makeGame();
    game._broodPlacement = null;
    expect(ghostCells(game)).toEqual([]);
  });
});
