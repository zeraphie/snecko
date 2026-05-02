// projectiles.test.js — drift-hook coverage for boss + player bullet updates.

import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";
import { updateProjectiles } from "../src/core/boss/projectiles.js";
import { updatePlayerBullets } from "../src/core/boss/player-bullets.js";

function makeGrid() {
  const grid = new Grid(20, 20);
  // Box border so out-of-bounds and walls behave as in a real arena.
  for (let x = 0; x < grid.width; x++) {
    grid.setCell("wall", x, 0);
    grid.setCell("wall", x, grid.height - 1);
  }
  for (let y = 0; y < grid.height; y++) {
    grid.setCell("wall", 0, y);
    grid.setCell("wall", grid.width - 1, y);
  }
  return grid;
}

describe("updateProjectiles drift hook", () => {
  it("does not deflect when no driftCells are passed", () => {
    const grid = makeGrid();
    const proj = [{ x: 5, y: 5, dx: 1, dy: 0 }];
    updateProjectiles(proj, grid);
    expect(proj[0]).toMatchObject({ x: 6, y: 5 });
  });

  it("does not deflect when projectile lands outside any drift cell", () => {
    const grid = makeGrid();
    const proj = [{ x: 5, y: 5, dx: 1, dy: 0 }];
    const drift = [{ x: 10, y: 10, flowDx: 0, flowDy: 1 }];
    updateProjectiles(proj, grid, drift);
    expect(proj[0]).toMatchObject({ x: 6, y: 5 });
  });

  it("applies the cell's flow vector when the projectile lands on a drift cell", () => {
    const grid = makeGrid();
    const proj = [{ x: 5, y: 5, dx: 1, dy: 0 }];
    // Drift cell at (6, 5) with downward flow — projectile arrives at (6, 5)
    // after its base step, then drifts to (6, 6).
    const drift = [{ x: 6, y: 5, flowDx: 0, flowDy: 1 }];
    updateProjectiles(proj, grid, drift);
    expect(proj[0]).toMatchObject({ x: 6, y: 6 });
  });

  it("removes a projectile if the drift step takes it into a wall", () => {
    const grid = makeGrid();
    // Projectile heads right; lands at (18, 5); drift pushes east into wall at (19, 5).
    const proj = [{ x: 17, y: 5, dx: 1, dy: 0 }];
    const drift = [{ x: 18, y: 5, flowDx: 1, flowDy: 0 }];
    updateProjectiles(proj, grid, drift);
    expect(proj).toHaveLength(0);
  });

  it("removes a projectile if the drift step takes it out of bounds", () => {
    const grid = new Grid(20, 20); // no walls
    const proj = [{ x: 18, y: 5, dx: 1, dy: 0 }];
    const drift = [{ x: 19, y: 5, flowDx: 1, flowDy: 0 }];
    updateProjectiles(proj, grid, drift);
    expect(proj).toHaveLength(0);
  });

  it("only deflects once per tick (no chained drift)", () => {
    // Two adjacent drift cells. After the base step the projectile is on
    // the first drift cell and drifts into the second; we expect it to
    // STOP there for this tick rather than chain the second cell's flow.
    const grid = makeGrid();
    const proj = [{ x: 5, y: 5, dx: 1, dy: 0 }];
    const drift = [
      { x: 6, y: 5, flowDx: 0, flowDy: 1 }, // takes it to (6, 6)
      { x: 6, y: 6, flowDx: 0, flowDy: 1 }, // would take it further if chained
    ];
    updateProjectiles(proj, grid, drift);
    expect(proj[0]).toMatchObject({ x: 6, y: 6 });
  });
});

describe("updatePlayerBullets drift hook", () => {
  it("applies drift symmetrically to player bullets", () => {
    const grid = makeGrid();
    const bullets = [{ x: 5, y: 5, dx: 0, dy: -1 }];
    const drift = [{ x: 5, y: 4, flowDx: 1, flowDy: 0 }];
    updatePlayerBullets(bullets, grid, drift);
    expect(bullets[0]).toMatchObject({ x: 6, y: 4 });
  });

  it("does nothing extra when no drift is provided", () => {
    const grid = makeGrid();
    const bullets = [{ x: 5, y: 5, dx: 0, dy: -1 }];
    updatePlayerBullets(bullets, grid);
    expect(bullets[0]).toMatchObject({ x: 5, y: 4 });
  });
});
