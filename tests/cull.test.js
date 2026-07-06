// cull.test.js — cull mechanic init + state shape (brood mutation).

import { describe, it, expect } from "vitest";
import { Grid } from "../src/core/grid";
import { Snake } from "../src/core/snake";
import { generateBroodGrid } from "../src/core/generation/brood/generator.js";
import {
  initCull,
  advanceCull,
  tickCull,
  resolveImpact,
  kinAt,
  transitionKinToMemorial,
  computeBroodActClearBonus,
  onFoodEaten,
  getThrowCells,
} from "../src/core/mechanics/cull/index.js";
import {
  pickTarget,
  pickSearchTarget,
  pickHuntTarget,
  pickPityTarget,
  rollPityThreshold,
  scoreLineExtending,
} from "../src/core/mechanics/cull/targeting.js";
import {
  pushDeathToast,
  pushIdleTaunt,
  pushPityTaunt,
  tickVoice,
  rollIdleTauntInterval,
} from "../src/core/mechanics/cull/voice.js";
import {
  SHIELDS_PER_ACT,
  THROW_INTERVAL_MS,
  TELEGRAPH_FUSE_MS,
  PLUS_TELEGRAPH_FUSE_MS,
  LINE_TELEGRAPH_FUSE_MS,
  IMPACT_FLASH_MS,
  MAX_CULL_DT_MS,
  PITY_THRESHOLD_MIN,
  PITY_THRESHOLD_MAX,
  IDLE_TAUNT_MIN_MS,
  IDLE_TAUNT_MAX_MS,
  SCORE_PER_KIN,
  SCORE_PER_UNUSED_SHIELD,
  MINE_STUN_MS,
} from "../src/core/mechanics/cull/constants.js";
import { UpgradeState } from "../src/core/upgrades/state.js";
import {
  TERRAIN_KIN_HEAD,
  TERRAIN_KIN_BODY,
  TERRAIN_MEMORIAL_HEAD,
  TERRAIN_MEMORIAL_BODY,
} from "../src/core/grid/constants.js";

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
  };
}

/**
 * Writes a kin's cells to the grid (wall + alive terrain markers) and
 * registers it on the cull mechanic. First cell is the head.
 */
function placeKin(game, cells, name = "Testling") {
  const grid = game.grid;
  const w = grid.width;
  for (let i = 0; i < cells.length; i++) {
    const [x, y] = cells[i];
    grid.setCell("wall", x, y);
    grid.terrain[y * w + x] = i === 0 ? TERRAIN_KIN_HEAD : TERRAIN_KIN_BODY;
  }
  const kin = {
    shapeId: "i2",
    rotation: 0,
    x: cells[0][0],
    y: cells[0][1],
    cells,
    name,
    kind: "hatchling",
    alive: true,
    shielded: false,
  };
  game.mechanic.kin.push(kin);
  return kin;
}

/**
 * Drives the real-time cull clock forward by `ms`, anchoring it first if
 * needed. Steps in sub-MAX_CULL_DT_MS increments so the dt clamp never
 * swallows the elapsed time. `rand` feeds target selection.
 */
function runMs(game, ms, rand) {
  const step = 100;
  if (game.mechanic.lastTickAt === null) {
    game.mechanic.lastTickAt = 0;
  }
  let now = game.mechanic.lastTickAt;
  let remaining = ms;
  while (remaining > 0) {
    const d = Math.min(step, remaining);
    now += d;
    tickCull(game, now, rand);
    remaining -= d;
  }
}

/**
 * Deterministic RNG that aims `pickTarget` at cell (tx, ty) via the
 * search picker. Three rolls per throw: [pity threshold (forces minimum
 * threshold; pity is harmless because tests start with missStreak=0),
 * search x ratio, search y ratio].
 */
function aimAt(grid, tx, ty) {
  const seq = [0, (tx + 0.5) / grid.width, (ty + 0.5) / grid.height];
  let i = 0;
  return () => seq[i++ % seq.length];
}

/** RNG that returns each value in `seq` once, then 0 forever. */
function rngSeq(seq) {
  let i = 0;
  return () => (i < seq.length ? seq[i++] : 0);
}

describe("initCull", () => {
  it("sets type discriminator to 'cull'", () => {
    const game = makeGame();
    initCull(game);
    expect(game.mechanic.type).toBe("cull");
  });

  it("starts predator in idle state with no target and a zeroed clock", () => {
    const game = makeGame();
    initCull(game);
    expect(game.mechanic.state).toBe("idle");
    expect(game.mechanic.throwTimer).toBe(0);
    expect(game.mechanic.phaseTimer).toBe(0);
    expect(game.mechanic.lastTickAt).toBeNull();
    expect(game.mechanic.targetX).toBe(-1);
    expect(game.mechanic.targetY).toBe(-1);
  });

  it("starts targeting in search mode with cleared streak + kill history", () => {
    const game = makeGame();
    initCull(game);
    expect(game.mechanic.targetingMode).toBe("search");
    expect(game.mechanic.missStreak).toBe(0);
    expect(game.mechanic.pityThreshold).toBe(0);
    expect(game.mechanic.lastKillX).toBe(-1);
    expect(game.mechanic.lastKillY).toBe(-1);
  });

  it("starts with empty kin list and full shields", () => {
    const game = makeGame();
    initCull(game);
    expect(game.mechanic.kin).toEqual([]);
    expect(game.mechanic.shields).toBe(SHIELDS_PER_ACT);
  });

  it("starts with empty voice queue and no active line", () => {
    const game = makeGame();
    initCull(game);
    expect(game.mechanic.voiceQueue).toEqual([]);
    expect(game.mechanic.activeLine).toBeNull();
    expect(game.mechanic.activeLineDwellMs).toBe(0);
    expect(game.mechanic.idleTauntElapsedMs).toBe(0);
    expect(game.mechanic.nextIdleTauntAt).toBe(IDLE_TAUNT_MIN_MS);
  });

  it("overwrites previous mechanic state (mutation switch)", () => {
    const game = makeGame();
    game.mechanic = { type: "rifts", state: "linger", riftBatch: [1, 2, 3] };
    initCull(game);
    expect(game.mechanic.type).toBe("cull");
    expect(game.mechanic.riftBatch).toBeUndefined();
  });
});

describe("advanceCull (food-bite stub)", () => {
  it("does not mutate state in Step 3", () => {
    const game = makeGame();
    initCull(game);
    const before = JSON.stringify(game.mechanic);
    advanceCull(game);
    expect(JSON.stringify(game.mechanic)).toBe(before);
  });

  it("is safe to call with no mechanic set", () => {
    const game = makeGame();
    game.mechanic = null;
    expect(() => advanceCull(game)).not.toThrow();
  });
});

describe("generateBroodGrid → initCull", () => {
  it("populates game.mechanic with the cull shape", () => {
    const game = makeGame();
    generateBroodGrid(game);
    expect(game.mechanic.type).toBe("cull");
    expect(game.mechanic.state).toBe("idle");
    expect(game.mechanic.shields).toBe(SHIELDS_PER_ACT);
  });

  it("snake spawns at grid center (act 1)", () => {
    const game = makeGame();
    generateBroodGrid(game);
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    expect(hx).toBe(Math.floor(game.grid.width / 2));
    expect(hy).toBe(Math.floor(game.grid.height / 2));
  });

  it("grid seeds a handful of sparse wall shapes, not a kin field", () => {
    const game = makeGame();
    generateBroodGrid(game);
    let wallCount = 0;
    for (let y = 0; y < game.grid.height; y++) {
      for (let x = 0; x < game.grid.width; x++) {
        if (game.grid.isWallCell(x, y)) {
          wallCount++;
        }
      }
    }
    // 6-8 shapes are placed; each has 3-8 cells (roughly). Loose upper
    // bound tolerates variance across seeds. Lower bound guards
    // against the isolation rollback eating so many placements that
    // the grid ends up basically empty.
    expect(wallCount).toBeGreaterThanOrEqual(18);
    expect(wallCount).toBeLessThanOrEqual(64);
  });

  it("sparse walls are marked with TERRAIN_CATACOMB so they reuse the stone texture", () => {
    const game = makeGame();
    generateBroodGrid(game);
    const w = game.grid.width;
    for (let y = 0; y < game.grid.height; y++) {
      for (let x = 0; x < w; x++) {
        if (game.grid.isWallCell(x, y)) {
          // At this point kin haven't been placed, so every wall is a
          // sparse wall and must carry the catacomb terrain marker.
          expect(game.grid.terrain[y * w + x]).toBe(6); // TERRAIN_CATACOMB
        }
      }
    }
  });

  it("no sparse walls land within a 2-cell buffer around the snake spawn", () => {
    const game = makeGame();
    generateBroodGrid(game);
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = hx + dx;
        const y = hy + dy;
        if (x < 0 || x >= game.grid.width || y < 0 || y >= game.grid.height) {
          continue;
        }
        expect(game.grid.isWallCell(x, y)).toBe(false);
      }
    }
  });

  it("wall scatter is deterministic from actSeed", () => {
    const seed = 0xdeadbeef;
    const gameA = makeGame(seed);
    generateBroodGrid(gameA);
    const gameB = makeGame(seed);
    generateBroodGrid(gameB);
    // Both grids should have identical wall masks + terrain.
    for (let y = 0; y < gameA.grid.height; y++) {
      for (let x = 0; x < gameA.grid.width; x++) {
        expect(gameA.grid.isWallCell(x, y)).toBe(gameB.grid.isWallCell(x, y));
      }
    }
  });

  it("wall generation never isolates part of the grid from the snake spawn", () => {
    // 100 seeds. In every one, every non-wall cell must be reachable
    // from the snake spawn — otherwise kin placement's path-guarantee
    // flood-fill fails everywhere and the player can't place anything.
    for (let seed = 1; seed <= 100; seed++) {
      const game = makeGame(seed * 0x9e3779b1);
      generateBroodGrid(game);
      const w = game.grid.width;
      const h = game.grid.height;
      const spawnX = game.snake.snakeX[game.snake.headIndex];
      const spawnY = game.snake.snakeY[game.snake.headIndex];
      const visited = new Uint8Array(w * h);
      const queue = [spawnX, spawnY];
      visited[spawnY * w + spawnX] = 1;
      let head = 0;
      let reached = 1;
      while (head < queue.length) {
        const cx = queue[head++];
        const cy = queue[head++];
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
            continue;
          }
          if (visited[ny * w + nx]) {
            continue;
          }
          if (game.grid.isWallCell(nx, ny)) {
            continue;
          }
          visited[ny * w + nx] = 1;
          reached++;
          queue.push(nx, ny);
        }
      }
      let totalOpen = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!game.grid.isWallCell(x, y)) {
            totalOpen++;
          }
        }
      }
      expect(reached).toBe(totalOpen);
    }
  });

  it("walls span multiple sectors — not clumped in one region", () => {
    // Run 30 seeds. In every one, walls should touch at least 2
    // distinct sectors of the 3×3 grid partition. That's a low bar
    // (target min is 2 shapes → 2 sectors) but catches the "everything
    // in one corner" degenerate case that pure-random anchoring gave.
    for (let seed = 1; seed <= 30; seed++) {
      const game = makeGame(seed * 0x9e3779b1);
      generateBroodGrid(game);
      const w = game.grid.width;
      const h = game.grid.height;
      const sectorW = Math.floor(w / 3);
      const sectorH = Math.floor(h / 3);
      const sectorsWithWalls = new Set();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (game.grid.isWallCell(x, y)) {
            const sCol = Math.min(2, Math.floor(x / sectorW));
            const sRow = Math.min(2, Math.floor(y / sectorH));
            sectorsWithWalls.add(sRow * 3 + sCol);
          }
        }
      }
      expect(sectorsWithWalls.size).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("cull targeting — sparse walls", () => {
  it("pickSearchTarget never returns a sparse wall cell", () => {
    const game = makeGame();
    initCull(game);
    // Scatter a wall at (5, 5) manually — same terrain marker the
    // generator uses.
    game.grid.setCell("wall", 5, 5);
    game.grid.terrain[5 * game.grid.width + 5] = 6; // TERRAIN_CATACOMB
    for (let i = 0; i < 500; i++) {
      const { x, y } = pickSearchTarget(game, Math.random);
      if (x === 5 && y === 5) {
        throw new Error("search picked a sparse wall cell");
      }
    }
  });

  it("pickHuntTarget skips sparse wall neighbours", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 10;
    game.mechanic.lastKillY = 10;
    game.mechanic.huntHitCells = new Set(["10,10"]);
    // Wall at (11, 10) — one of the cardinals.
    game.grid.setCell("wall", 11, 10);
    game.grid.terrain[10 * game.grid.width + 11] = 6; // TERRAIN_CATACOMB
    for (let i = 0; i < 200; i++) {
      const pick = pickHuntTarget(game, Math.random);
      if (pick) {
        expect(pick).not.toEqual({ x: 11, y: 10 });
      }
    }
  });
});

describe("snake spawn (D20)", () => {
  it("act 1 spawns at grid centre when no _lastSnake is set", () => {
    const game = makeGame();
    generateBroodGrid(game);
    const hx = game.snake.snakeX[game.snake.headIndex];
    const hy = game.snake.snakeY[game.snake.headIndex];
    expect(hx).toBe(Math.floor(game.grid.width / 2));
    expect(hy).toBe(Math.floor(game.grid.height / 2));
    expect(game.snake.dirX).toBe(1);
    expect(game.snake.dirY).toBe(0);
  });

  it("subsequent acts reuse the snake's last position + facing", () => {
    const game = makeGame();
    game._lastSnake = { x: 7, y: 22, dx: 0, dy: -1 };
    generateBroodGrid(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(7);
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(22);
    expect(game.snake.dirX).toBe(0);
    expect(game.snake.dirY).toBe(-1);
  });

  it("falls back to centre when _lastSnake is out of bounds", () => {
    const game = makeGame();
    game._lastSnake = { x: -1, y: 5, dx: 1, dy: 0 };
    generateBroodGrid(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(Math.floor(game.grid.width / 2));
    expect(game.snake.snakeY[game.snake.headIndex]).toBe(Math.floor(game.grid.height / 2));
  });
});

// ── Step 10: real-time tick + cadence + telegraph + impact ──────────

describe("tickCull (real-time driver)", () => {
  it("is a no-op for a non-cull mechanic", () => {
    const game = makeGame();
    game.mechanic = { type: "rifts", state: "linger" };
    expect(() => tickCull(game, 1000)).not.toThrow();
    expect(game.mechanic.type).toBe("rifts");
  });

  it("is safe to call with no mechanic set", () => {
    const game = makeGame();
    game.mechanic = null;
    expect(() => tickCull(game, 1000)).not.toThrow();
  });

  it("first tick anchors the clock without spending dt", () => {
    const game = makeGame();
    initCull(game);
    tickCull(game, 5000);
    expect(game.mechanic.lastTickAt).toBe(5000);
    expect(game.mechanic.throwTimer).toBe(0);
    expect(game.mechanic.state).toBe("idle");
  });

  it("stays idle before the throw interval elapses", () => {
    const game = makeGame();
    initCull(game);
    runMs(game, THROW_INTERVAL_MS - 200, aimAt(game.grid, 0, 0));
    expect(game.mechanic.state).toBe("idle");
    expect(game.mechanic.targetX).toBe(-1);
  });

  it("begins a telegraphed throw on the 4-s cadence", () => {
    const game = makeGame();
    initCull(game);
    // Land inside the 1-s fuse window (interval + 300 ms < interval + fuse).
    runMs(game, THROW_INTERVAL_MS + 300, aimAt(game.grid, 10, 10));
    expect(game.mechanic.state).toBe("telegraph");
    expect(game.mechanic.targetX).toBe(10);
    expect(game.mechanic.targetY).toBe(10);
  });

  it("clamps a large gap so a pause doesn't burst throws", () => {
    const game = makeGame();
    initCull(game);
    tickCull(game, 0); // anchor
    tickCull(game, 60_000); // 60-s "pause" gap in one tick
    expect(game.mechanic.throwTimer).toBeLessThanOrEqual(MAX_CULL_DT_MS);
    expect(game.mechanic.state).toBe("idle");
  });

  it("memorialises only the target cell on a hit; the rest of the kin stays alive", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [10, 10],
      [11, 10],
    ]);
    // Aim at the kin's body cell; run past interval + fuse + impact flash.
    runMs(
      game,
      THROW_INTERVAL_MS + TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 300,
      aimAt(game.grid, 11, 10)
    );
    const w = game.grid.width;
    // Battleship semantics — only the hit cell flips. The head at
    // (10, 10) is untouched until it eats its own throw.
    expect(game.grid.terrain[10 * w + 11]).toBe(TERRAIN_MEMORIAL_BODY);
    expect(game.grid.terrain[10 * w + 10]).toBe(TERRAIN_KIN_HEAD);
    expect(kin.alive).toBe(true);
    // Memorial cells still block the snake.
    expect(game.grid.isWallCell(10, 10)).toBe(true);
    expect(game.grid.isWallCell(11, 10)).toBe(true);
    // Predator returns to idle with the target cleared.
    expect(game.mechanic.state).toBe("idle");
    expect(game.mechanic.targetX).toBe(-1);
  });

  it("a miss leaves the grid unchanged", () => {
    const game = makeGame();
    initCull(game);
    placeKin(game, [
      [10, 10],
      [11, 10],
    ]);
    const before = game.grid.terrain.slice();
    // Aim at an empty cell far from the kin.
    runMs(
      game,
      THROW_INTERVAL_MS + TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 300,
      aimAt(game.grid, 25, 25)
    );
    expect(game.grid.terrain).toEqual(before);
    expect(game.mechanic.kin[0].alive).toBe(true);
  });
});

describe("resolveImpact", () => {
  it("returns 'hit' and memorialises only the target cell", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [4, 4],
      [4, 5],
      [4, 6],
    ]);
    expect(resolveImpact(game, 4, 5)).toBe("hit");
    const w = game.grid.width;
    expect(game.grid.terrain[5 * w + 4]).toBe(TERRAIN_MEMORIAL_BODY);
    expect(game.grid.terrain[4 * w + 4]).toBe(TERRAIN_KIN_HEAD);
    expect(game.grid.terrain[6 * w + 4]).toBe(TERRAIN_KIN_BODY);
    expect(kin.alive).toBe(true);
  });

  it("flags the kin as fully dead only after every cell has been hit", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [4, 4],
      [4, 5],
      [4, 6],
    ]);
    resolveImpact(game, 4, 4);
    expect(kin.alive).toBe(true);
    resolveImpact(game, 4, 5);
    expect(kin.alive).toBe(true);
    resolveImpact(game, 4, 6);
    expect(kin.alive).toBe(false);
  });

  it("returns 'miss' on an empty cell", () => {
    const game = makeGame();
    initCull(game);
    placeKin(game, [[4, 4]]);
    expect(resolveImpact(game, 20, 20)).toBe("miss");
  });

  it("returns 'miss' on an already-dead kin cell", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[4, 4]]);
    transitionKinToMemorial(game, kin);
    expect(resolveImpact(game, 4, 4)).toBe("miss");
  });

  it("returns 'miss' on a memorialised cell of a partially-alive kin", () => {
    const game = makeGame();
    initCull(game);
    placeKin(game, [
      [4, 4],
      [5, 4],
    ]);
    resolveImpact(game, 4, 4);
    expect(resolveImpact(game, 4, 4)).toBe("miss");
  });
});

describe("kinAt", () => {
  it("finds an alive kin at any of its cells", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [7, 7],
      [8, 7],
    ]);
    expect(kinAt(game, 7, 7)).toBe(kin);
    expect(kinAt(game, 8, 7)).toBe(kin);
  });

  it("returns null for an empty cell", () => {
    const game = makeGame();
    initCull(game);
    placeKin(game, [[7, 7]]);
    expect(kinAt(game, 0, 0)).toBeNull();
  });

  it("skips memorial (dead) kin", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[7, 7]]);
    transitionKinToMemorial(game, kin);
    expect(kinAt(game, 7, 7)).toBeNull();
  });
});

describe("transitionKinToMemorial", () => {
  it("swaps head → gravestone marker and body → mound markers", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [3, 3],
      [3, 4],
      [3, 5],
    ]);
    transitionKinToMemorial(game, kin);
    const w = game.grid.width;
    expect(game.grid.terrain[3 * w + 3]).toBe(TERRAIN_MEMORIAL_HEAD);
    expect(game.grid.terrain[4 * w + 3]).toBe(TERRAIN_MEMORIAL_BODY);
    expect(game.grid.terrain[5 * w + 3]).toBe(TERRAIN_MEMORIAL_BODY);
    expect(kin.alive).toBe(false);
  });
});

// ── Step 11: search/hunt AI + pity timer ─────────────────────────────

describe("rollPityThreshold", () => {
  it("returns an integer in [PITY_MIN, PITY_MAX] inclusive", () => {
    for (let i = 0; i < 200; i++) {
      const t = rollPityThreshold(Math.random);
      expect(t).toBeGreaterThanOrEqual(PITY_THRESHOLD_MIN);
      expect(t).toBeLessThanOrEqual(PITY_THRESHOLD_MAX);
      expect(Number.isInteger(t)).toBe(true);
    }
  });

  it("hits the full inclusive range across the sample space", () => {
    const seen = new Set();
    // Sample at every (k + 0.5) / span boundary so we cover all buckets.
    const span = PITY_THRESHOLD_MAX - PITY_THRESHOLD_MIN + 1;
    for (let k = 0; k < span; k++) {
      const r = (k + 0.5) / span;
      seen.add(rollPityThreshold(() => r));
    }
    for (let v = PITY_THRESHOLD_MIN; v <= PITY_THRESHOLD_MAX; v++) {
      expect(seen.has(v)).toBe(true);
    }
  });
});

describe("pickSearchTarget", () => {
  it("never returns a snake cell", () => {
    const game = makeGame();
    initCull(game);
    game.snake.init(game.grid, 15, 15, 5, 1, 0);
    for (let i = 0; i < 200; i++) {
      const { x, y } = pickSearchTarget(game, Math.random);
      expect(game.grid.isSnakeCell(x, y)).toBe(false);
    }
  });

  it("never returns a memorial cell", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [10, 10],
      [10, 11],
      [10, 12],
    ]);
    transitionKinToMemorial(game, kin);
    for (let i = 0; i < 200; i++) {
      const { x, y } = pickSearchTarget(game, Math.random);
      const t = game.grid.terrain[y * game.grid.width + x];
      expect(t).not.toBe(TERRAIN_MEMORIAL_HEAD);
      expect(t).not.toBe(TERRAIN_MEMORIAL_BODY);
    }
  });
});

describe("pickHuntTarget", () => {
  it("returns null when no kill has happened yet", () => {
    const game = makeGame();
    initCull(game);
    expect(pickHuntTarget(game, Math.random)).toBeNull();
  });

  it("picks an orthogonally adjacent cell to any hit cell", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.lastKillX = 10;
    game.mechanic.lastKillY = 10;
    game.mechanic.huntHitCells = new Set(["10,10"]);
    // Simulated real-game invariant: a kill adds the cell to both hit +
    // tried sets. The picker treats a hit cell itself as re-targetable
    // only when it's absent from tried (blocked-but-alive kin).
    game.mechanic.huntTriedCells = new Set(["10,10"]);
    for (let i = 0; i < 50; i++) {
      const pick = pickHuntTarget(game, Math.random);
      expect(pick).not.toBeNull();
      const manhattan = Math.abs(pick.x - 10) + Math.abs(pick.y - 10);
      expect(manhattan).toBe(1);
    }
  });

  it("skips memorial neighbours", () => {
    const game = makeGame();
    initCull(game);
    // Surround last-kill cell with memorials on every cardinal but +x.
    const kin = placeKin(game, [
      [10, 9],
      [9, 10],
      [10, 11],
    ]);
    transitionKinToMemorial(game, kin);
    game.mechanic.lastKillX = 10;
    game.mechanic.lastKillY = 10;
    game.mechanic.huntHitCells = new Set(["10,10"]);
    game.mechanic.huntTriedCells = new Set(["10,10"]);
    for (let i = 0; i < 50; i++) {
      const pick = pickHuntTarget(game, Math.random);
      expect(pick).toEqual({ x: 11, y: 10 });
    }
  });

  it("returns null when every orthogonal neighbour is ineligible", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [10, 9],
      [9, 10],
      [11, 10],
      [10, 11],
    ]);
    transitionKinToMemorial(game, kin);
    game.mechanic.lastKillX = 10;
    game.mechanic.lastKillY = 10;
    game.mechanic.huntHitCells = new Set(["10,10"]);
    game.mechanic.huntTriedCells = new Set(["10,10"]);
    expect(pickHuntTarget(game, Math.random)).toBeNull();
  });

  it("re-picks a hit cell when it is absent from huntTriedCells (block scenario)", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.lastKillX = 10;
    game.mechanic.lastKillY = 10;
    // Hit cell present but NOT tried — simulates a shielded block. The
    // cell is still a valid re-target and stays a candidate alongside
    // its cardinals.
    game.mechanic.huntHitCells = new Set(["10,10"]);
    game.mechanic.huntTriedCells = new Set();
    let sawSelf = false;
    for (let i = 0; i < 200; i++) {
      const pick = pickHuntTarget(game, Math.random);
      if (pick.x === 10 && pick.y === 10) {
        sawSelf = true;
        break;
      }
    }
    expect(sawSelf).toBe(true);
  });
});

describe("pickPityTarget", () => {
  it("returns null when no kin are alive", () => {
    const game = makeGame();
    initCull(game);
    expect(pickPityTarget(game, Math.random)).toBeNull();
  });

  it("only returns cells belonging to alive kin", () => {
    const game = makeGame();
    initCull(game);
    const alive = placeKin(
      game,
      [
        [5, 5],
        [6, 5],
      ],
      "Alive"
    );
    const dead = placeKin(
      game,
      [
        [20, 20],
        [21, 20],
      ],
      "Dead"
    );
    transitionKinToMemorial(game, dead);
    const aliveSet = new Set(alive.cells.map(([x, y]) => `${x},${y}`));
    for (let i = 0; i < 100; i++) {
      const pick = pickPityTarget(game, Math.random);
      expect(aliveSet.has(`${pick.x},${pick.y}`)).toBe(true);
    }
  });
});

describe("pickTarget (orchestration)", () => {
  it("rolls a per-throw pity threshold and writes it to state", () => {
    const game = makeGame();
    initCull(game);
    pickTarget(game, Math.random);
    expect(game.mechanic.pityThreshold).toBeGreaterThanOrEqual(PITY_THRESHOLD_MIN);
    expect(game.mechanic.pityThreshold).toBeLessThanOrEqual(PITY_THRESHOLD_MAX);
  });

  it("forces a pity hit when missStreak >= threshold", () => {
    const game = makeGame();
    initCull(game);
    const aliveKin = placeKin(game, [
      [12, 12],
      [13, 12],
    ]);
    game.mechanic.missStreak = PITY_THRESHOLD_MAX;
    // pityThreshold roll: 0 → MIN (smallest threshold, guaranteed pity).
    // pity selection roll: 0 → first alive cell.
    const target = pickTarget(game, rngSeq([0, 0]));
    expect(game.mechanic.forcedPity).toBe(true);
    expect(aliveKin.cells.some(([x, y]) => x === target.x && y === target.y)).toBe(true);
  });

  it("does not force pity when no kin are alive", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.missStreak = PITY_THRESHOLD_MAX;
    const target = pickTarget(game, Math.random);
    expect(game.mechanic.forcedPity).toBe(false);
    expect(target.x).toBeGreaterThanOrEqual(0);
  });

  it("hunt mode picks an adjacent-to-a-hit-cell when eligible", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 15;
    game.mechanic.lastKillY = 15;
    game.mechanic.huntHitCells = new Set(["15,15"]);
    game.mechanic.huntTriedCells = new Set(["15,15"]);
    // [pity threshold→MIN, pity skipped (streak=0), hunt selection roll].
    const target = pickTarget(game, rngSeq([0, 0]));
    const manhattan = Math.abs(target.x - 15) + Math.abs(target.y - 15);
    expect(manhattan).toBe(1);
  });

  it("hunt with no eligible adjacents reverts persistent mode to search", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 15;
    game.mechanic.lastKillY = 15;
    game.mechanic.huntHitCells = new Set(["15,15"]);
    game.mechanic.huntTriedCells = new Set(["15,15"]);
    const blockers = placeKin(game, [
      [15, 14],
      [14, 15],
      [16, 15],
      [15, 16],
    ]);
    transitionKinToMemorial(game, blockers);
    pickTarget(game, Math.random);
    expect(game.mechanic.targetingMode).toBe("search");
  });

  it("clears forcedPity on a non-pity throw", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.forcedPity = true; // simulate prior throw
    pickTarget(game, Math.random);
    expect(game.mechanic.forcedPity).toBe(false);
  });
});

describe("resolveImpact — Step 11 mode + streak transitions", () => {
  it("hit enters hunt mode, records lastKill, resets missStreak", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [8, 8],
      [9, 8],
    ]);
    game.mechanic.missStreak = 4;
    resolveImpact(game, 8, 8);
    expect(game.mechanic.targetingMode).toBe("hunt");
    expect(game.mechanic.lastKillX).toBe(8);
    expect(game.mechanic.lastKillY).toBe(8);
    expect(game.mechanic.missStreak).toBe(0);
    // Partial hit — kin survives until every cell is struck.
    expect(kin.alive).toBe(true);
  });

  it("miss in search mode increments missStreak", () => {
    const game = makeGame();
    initCull(game);
    expect(game.mechanic.targetingMode).toBe("search");
    resolveImpact(game, 1, 1);
    resolveImpact(game, 2, 2);
    expect(game.mechanic.missStreak).toBe(2);
    expect(game.mechanic.targetingMode).toBe("search");
  });

  it("miss in hunt mode stays in hunt and does not bump missStreak", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 5;
    game.mechanic.lastKillY = 5;
    game.mechanic.missStreak = 0;
    resolveImpact(game, 0, 0);
    expect(game.mechanic.targetingMode).toBe("hunt");
    expect(game.mechanic.missStreak).toBe(0);
  });

  it("hit in hunt accumulates into the hit + tried sets (multi-pivot)", () => {
    const game = makeGame();
    initCull(game);
    placeKin(game, [
      [10, 10],
      [11, 10],
    ]);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 9;
    game.mechanic.lastKillY = 9;
    game.mechanic.huntHitCells = new Set(["9,9"]);
    game.mechanic.huntTriedCells = new Set(["9,9", "9,10", "10,9"]);
    resolveImpact(game, 10, 10);
    // Old pivots stay — the new hit adds to both sets rather than
    // re-anchoring around itself. lastKill tracks the most recent hit.
    expect(game.mechanic.huntHitCells.has("9,9")).toBe(true);
    expect(game.mechanic.huntHitCells.has("10,10")).toBe(true);
    expect(game.mechanic.huntTriedCells.has("9,9")).toBe(true);
    expect(game.mechanic.huntTriedCells.has("9,10")).toBe(true);
    expect(game.mechanic.huntTriedCells.has("10,9")).toBe(true);
    expect(game.mechanic.huntTriedCells.has("10,10")).toBe(true);
    expect(game.mechanic.lastKillX).toBe(10);
    expect(game.mechanic.lastKillY).toBe(10);
  });

  it("hunt chains lastKill across partial hits, then reverts on sink", () => {
    const game = makeGame();
    initCull(game);
    placeKin(game, [
      [10, 10],
      [11, 10],
      [12, 10],
    ]);
    resolveImpact(game, 10, 10);
    expect(game.mechanic.targetingMode).toBe("hunt");
    expect(game.mechanic.lastKillX).toBe(10);
    resolveImpact(game, 11, 10);
    expect(game.mechanic.lastKillX).toBe(11);
    // Final cell sinks the kin — Reginald reads the confirmed kill and
    // breaks off the hunt entirely.
    resolveImpact(game, 12, 10);
    expect(game.mechanic.targetingMode).toBe("search");
    expect(game.mechanic.lastKillX).toBe(-1);
    expect(game.mechanic.lastKillY).toBe(-1);
    expect(game.mechanic.huntTriedCells.size).toBe(0);
    expect(game.mechanic.kin[0].alive).toBe(false);
  });

  it("sinking a kin from hunt mode reverts to search and clears hunt state", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[10, 10]]); // single-cell kin
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 9;
    game.mechanic.lastKillY = 10;
    game.mechanic.huntHitCells = new Set(["9,10"]);
    game.mechanic.huntTriedCells = new Set(["9,10", "8,10"]);
    resolveImpact(game, 10, 10);
    expect(kin.alive).toBe(false);
    expect(game.mechanic.targetingMode).toBe("search");
    expect(game.mechanic.huntHitCells.size).toBe(0);
    expect(game.mechanic.huntTriedCells.size).toBe(0);
    expect(game.mechanic.lastKillX).toBe(-1);
    expect(game.mechanic.lastKillY).toBe(-1);
  });
});

describe("hunt-tried bookkeeping — Step 11 (battleship probe)", () => {
  it("hunt picker does not return a cell that has already been tried", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 15;
    game.mechanic.lastKillY = 15;
    game.mechanic.huntHitCells = new Set(["15,15"]);
    game.mechanic.huntTriedCells = new Set(["15,15", "16,15", "14,15", "15,14"]);
    for (let i = 0; i < 20; i++) {
      const pick = pickHuntTarget(game, Math.random);
      expect(pick).toEqual({ x: 15, y: 16 });
    }
  });

  it("pickTarget adds the chosen hunt cell to the tried set", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 15;
    game.mechanic.lastKillY = 15;
    game.mechanic.huntHitCells = new Set(["15,15"]);
    game.mechanic.huntTriedCells = new Set(["15,15"]);
    const target = pickTarget(game, rngSeq([0, 0]));
    expect(game.mechanic.huntTriedCells.has(target.x + "," + target.y)).toBe(true);
  });

  it("hunt eventually reverts to search once all cardinals are tried via misses", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 15;
    game.mechanic.lastKillY = 15;
    game.mechanic.huntHitCells = new Set(["15,15"]);
    // Each hunt throw records its target then misses (cells are empty).
    // After ≤4 hunts every cardinal is in the tried set.
    let safety = 8;
    while (game.mechanic.targetingMode === "hunt" && safety-- > 0) {
      const t = pickTarget(game, Math.random);
      resolveImpact(game, t.x, t.y);
    }
    expect(game.mechanic.targetingMode).toBe("search");
    expect(game.mechanic.huntHitCells.size).toBe(0);
    expect(game.mechanic.huntTriedCells.size).toBe(0);
  });

  it("hunt-then-miss keeps reprobing without bumping missStreak", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.lastKillX = 15;
    game.mechanic.lastKillY = 15;
    game.mechanic.huntHitCells = new Set(["15,15"]);
    const t = pickTarget(game, rngSeq([0, 0]));
    resolveImpact(game, t.x, t.y); // empty cell → miss
    expect(game.mechanic.targetingMode).toBe("hunt");
    expect(game.mechanic.missStreak).toBe(0);
  });
});

describe("tickCull — pity end-to-end", () => {
  it("forced pity over the 4-s cadence lands a partial hit and enters hunt", () => {
    const game = makeGame();
    initCull(game);
    // Two-cell kin so the pity hit doesn't immediately sink it — we
    // want to verify the hunt-mode entry, not the search-revert path.
    const aliveKin = placeKin(game, [
      [12, 12],
      [13, 12],
    ]);
    game.mechanic.missStreak = PITY_THRESHOLD_MAX;
    // [pity threshold roll → MIN, pity selection → first alive cell].
    const rand = rngSeq([0, 0]);
    runMs(game, THROW_INTERVAL_MS + TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 300, rand);
    const w = game.grid.width;
    expect(game.grid.terrain[12 * w + 12]).toBe(TERRAIN_MEMORIAL_HEAD);
    expect(aliveKin.alive).toBe(true);
    expect(game.mechanic.missStreak).toBe(0);
    expect(game.mechanic.targetingMode).toBe("hunt");
  });

  it("a pity hit that sinks a single-cell kin reverts to search", () => {
    const game = makeGame();
    initCull(game);
    const aliveKin = placeKin(game, [[12, 12]]);
    game.mechanic.missStreak = PITY_THRESHOLD_MAX;
    const rand = rngSeq([0, 0]);
    runMs(game, THROW_INTERVAL_MS + TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 300, rand);
    expect(aliveKin.alive).toBe(false);
    expect(game.mechanic.targetingMode).toBe("search");
    expect(game.mechanic.missStreak).toBe(0);
  });
});

// ── Step 12: voice surfacing + speech bubbles ──────────────────────────

describe("voice queue mechanics", () => {
  it("pushDeathToast appends a line with the kin's name substituted", () => {
    const game = makeGame();
    initCull(game);
    pushDeathToast(game.mechanic, "Norbert", () => 0);
    expect(game.mechanic.voiceQueue.length).toBe(1);
    const line = game.mechanic.voiceQueue[0];
    expect(line.category).toBe("death");
    expect(line.text).toContain("Norbert");
    expect(line.text).not.toContain("{name}");
  });

  it("pushIdleTaunt appends an idle line", () => {
    const game = makeGame();
    initCull(game);
    pushIdleTaunt(game.mechanic, () => 0);
    expect(game.mechanic.voiceQueue.length).toBe(1);
    expect(game.mechanic.voiceQueue[0].category).toBe("idle");
  });

  it("pushPityTaunt installs the line as active immediately, bypassing the queue", () => {
    const game = makeGame();
    initCull(game);
    pushIdleTaunt(game.mechanic, () => 0);
    pushPityTaunt(game.mechanic, () => 0);
    expect(game.mechanic.activeLine?.category).toBe("pity");
    expect(game.mechanic.activeLineDwellMs).toBe(0);
    // Existing queued idle taunt stays queued — pity bypassed it.
    expect(game.mechanic.voiceQueue.length).toBe(1);
    expect(game.mechanic.voiceQueue[0].category).toBe("idle");
  });

  it("tickVoice promotes a queued line when nothing is active", () => {
    const game = makeGame();
    initCull(game);
    pushIdleTaunt(game.mechanic, () => 0);
    tickVoice(game.mechanic, 16);
    expect(game.mechanic.activeLine?.category).toBe("idle");
    expect(game.mechanic.voiceQueue.length).toBe(0);
  });

  it("tickVoice drops the active line once it has dwelled its full duration", () => {
    const game = makeGame();
    initCull(game);
    pushIdleTaunt(game.mechanic, () => 0);
    tickVoice(game.mechanic, 0); // promote
    expect(game.mechanic.activeLine).not.toBeNull();
    const dwellMs = game.mechanic.activeLine.dwellMs;
    tickVoice(game.mechanic, dwellMs + 1);
    expect(game.mechanic.activeLine).toBeNull();
  });

  it("a newly-queued line preempts the active line after the active has dwelled ≥ 1 s", () => {
    const game = makeGame();
    initCull(game);
    pushIdleTaunt(game.mechanic, () => 0);
    tickVoice(game.mechanic, 0); // promote first
    const firstText = game.mechanic.activeLine.text;
    // Less than 1 s dwell so far — new queued line must wait.
    tickVoice(game.mechanic, 500);
    pushDeathToast(game.mechanic, "Mara", () => 0);
    tickVoice(game.mechanic, 0);
    expect(game.mechanic.activeLine.text).toBe(firstText);
    // Cross the 1 s threshold; the death toast should now preempt.
    tickVoice(game.mechanic, 600);
    expect(game.mechanic.activeLine.category).toBe("death");
  });

  it("pity lines cannot be preempted by queued lines", () => {
    const game = makeGame();
    initCull(game);
    pushPityTaunt(game.mechanic, () => 0);
    const pityText = game.mechanic.activeLine.text;
    // Even if a new line waits and we sit well past 1 s, pity holds.
    pushIdleTaunt(game.mechanic, () => 0);
    tickVoice(game.mechanic, 1100);
    expect(game.mechanic.activeLine.text).toBe(pityText);
    expect(game.mechanic.activeLine.category).toBe("pity");
  });
});

describe("rollIdleTauntInterval", () => {
  it("returns a value in [IDLE_TAUNT_MIN_MS, IDLE_TAUNT_MAX_MS]", () => {
    for (let i = 0; i < 200; i++) {
      const v = rollIdleTauntInterval(Math.random);
      expect(v).toBeGreaterThanOrEqual(IDLE_TAUNT_MIN_MS);
      expect(v).toBeLessThanOrEqual(IDLE_TAUNT_MAX_MS);
    }
  });
});

describe("tickCull — voice integration", () => {
  it("idle taunts surface on the cadence", () => {
    const game = makeGame();
    initCull(game);
    // Force the cadence to its minimum so the test runs within a known
    // window. rngSeq feeds: cadence roll → 0 = MIN. After that, all
    // subsequent rolls (target pick, taunt pick) just consume 0.
    runMs(game, IDLE_TAUNT_MIN_MS + 200, rngSeq([0]));
    expect(
      game.mechanic.activeLine?.category === "idle" ||
        game.mechanic.voiceQueue.some((l) => l.category === "idle")
    ).toBe(true);
  });

  it("a sunk kin queues a death toast carrying its name", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[10, 10]], "Norbert");
    resolveImpact(game, 10, 10);
    expect(kin.alive).toBe(false);
    expect(game.mechanic.voiceQueue.length).toBe(1);
    const toast = game.mechanic.voiceQueue[0];
    expect(toast.category).toBe("death");
    expect(toast.text).toContain("Norbert");
  });

  it("a partial hit does NOT queue a death toast (kin survives)", () => {
    const game = makeGame();
    initCull(game);
    placeKin(
      game,
      [
        [10, 10],
        [11, 10],
      ],
      "Twinly"
    );
    resolveImpact(game, 10, 10);
    expect(game.mechanic.voiceQueue.length).toBe(0);
  });

  it("a pity-forced throw surfaces a pity taunt before the telegraph completes", () => {
    const game = makeGame();
    initCull(game);
    placeKin(game, [
      [12, 12],
      [13, 12],
    ]);
    game.mechanic.missStreak = PITY_THRESHOLD_MAX;
    // Advance only as far as the start of the telegraph fuse (interval +
    // small slop) so the bubble is observed BEFORE impact.
    runMs(game, THROW_INTERVAL_MS + 50, rngSeq([0, 0]));
    expect(game.mechanic.state).toBe("telegraph");
    expect(game.mechanic.activeLine?.category).toBe("pity");
  });

  it("non-pity throws do not produce a pity taunt", () => {
    const game = makeGame();
    initCull(game);
    // Run past one full throw; no kin around (12,12) so it's a miss in
    // search mode. missStreak=0 means no pity.
    runMs(game, THROW_INTERVAL_MS + 50, aimAt(game.grid, 12, 12));
    // The voice queue might hold an idle taunt by now, but never a pity.
    expect(game.mechanic.activeLine?.category).not.toBe("pity");
    expect(game.mechanic.voiceQueue.every((l) => l.category !== "pity")).toBe(true);
  });
});

// ── Step 13: shields consumable ─────────────────────────────────────

describe("resolveImpact — shields absorb hits", () => {
  it("a shielded kin returns 'block' and is not memorialised", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [10, 10],
      [11, 10],
    ]);
    kin.shielded = true;
    const result = resolveImpact(game, 10, 10);
    expect(result).toBe("block");
    expect(kin.alive).toBe(true);
    expect(kin.shielded).toBe(false);
    const w = game.grid.width;
    expect(game.grid.terrain[10 * w + 10]).toBe(TERRAIN_KIN_HEAD);
    expect(game.grid.terrain[10 * w + 11]).toBe(TERRAIN_KIN_BODY);
  });

  it("a block queues a block taunt", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[10, 10]]);
    kin.shielded = true;
    resolveImpact(game, 10, 10);
    expect(game.mechanic.voiceQueue.length).toBe(1);
    expect(game.mechanic.voiceQueue[0].category).toBe("block");
  });

  it("a block enters hunt mode around the blocked cell + resets miss streak", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [10, 10],
      [11, 10],
    ]);
    kin.shielded = true;
    game.mechanic.missStreak = 3;
    resolveImpact(game, 10, 10);
    expect(game.mechanic.targetingMode).toBe("hunt");
    expect(game.mechanic.lastKillX).toBe(10);
    expect(game.mechanic.lastKillY).toBe(10);
    expect(game.mechanic.missStreak).toBe(0);
    expect(game.mechanic.huntHitCells.has("10,10")).toBe(true);
    // Blocked cell is deliberately NOT in the tried set — the kin is
    // still alive at (10, 10), so `pickHuntTarget` may re-target it.
    expect(game.mechanic.huntTriedCells.has("10,10")).toBe(false);
  });

  it("blocked cell stays targetable by hunt (no lockout on shielded-kin cells)", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[10, 10]]);
    kin.shielded = true;
    // Simulate the picker's tried-add for the throw that lands as a
    // block — the resolver must undo it so hunt can re-target the still-
    // alive cell.
    game.mechanic.huntTriedCells.add("10,10");
    resolveImpact(game, 10, 10);
    expect(game.mechanic.huntTriedCells.has("10,10")).toBe(false);
    // A follow-up hunt pick with the blocked cell as the only pivot
    // should be able to select (10, 10) itself.
    let sawSelf = false;
    for (let i = 0; i < 100; i++) {
      const pick = pickHuntTarget(game, Math.random);
      if (pick && pick.x === 10 && pick.y === 10) {
        sawSelf = true;
        break;
      }
    }
    expect(sawSelf).toBe(true);
  });

  it("a block does not queue a death toast (kin survives)", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[10, 10]], "Norbert");
    kin.shielded = true;
    resolveImpact(game, 10, 10);
    expect(game.mechanic.voiceQueue.every((l) => l.category !== "death")).toBe(true);
  });

  it("a second hit on the same kin (now unshielded) memorialises the cell", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [10, 10],
      [11, 10],
    ]);
    kin.shielded = true;
    resolveImpact(game, 10, 10); // absorbed
    expect(kin.shielded).toBe(false);
    resolveImpact(game, 10, 10); // now memorialises
    const w = game.grid.width;
    expect(game.grid.terrain[10 * w + 10]).toBe(TERRAIN_MEMORIAL_HEAD);
  });
});

// ── Step 15: brood-specific score (kin + unused shields) ────────────

// ── Step 16: brood game-over screen ────────────────────────────────

describe("brood game-over trigger", () => {
  it("flips state to STATE_DEAD_BROOD after the final kin's impact flash", () => {
    const game = makeGame();
    game.state = "playing";
    initCull(game);
    const lastKin = placeKin(game, [[10, 10]]);
    runMs(
      game,
      THROW_INTERVAL_MS + TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 300,
      aimAt(game.grid, 10, 10)
    );
    expect(lastKin.alive).toBe(false);
    expect(game.state).toBe("dead_brood");
    expect(typeof game._broodGameOverTaunt).toBe("string");
    expect(game._broodGameOverTaunt.length).toBeGreaterThan(0);
  });

  it("does not trigger game-over while any kin remain alive", () => {
    const game = makeGame();
    game.state = "playing";
    initCull(game);
    const alive = placeKin(game, [[10, 10]], "Alive");
    const doomed = placeKin(game, [[12, 12]], "Doomed");
    runMs(
      game,
      THROW_INTERVAL_MS + TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 300,
      aimAt(game.grid, 12, 12)
    );
    expect(doomed.alive).toBe(false);
    expect(alive.alive).toBe(true);
    expect(game.state).toBe("playing");
    expect(game._broodGameOverTaunt).toBeFalsy();
  });
});

describe("computeBroodActClearBonus", () => {
  it("returns zero when no kin and no shield charges", () => {
    const game = makeGame();
    initCull(game);
    game.upgrades = new UpgradeState();
    const b = computeBroodActClearBonus(game);
    expect(b).toEqual({ kin: 0, shields: 0, total: 0 });
  });

  it("counts only alive kin (dead kin excluded)", () => {
    const game = makeGame();
    initCull(game);
    game.upgrades = new UpgradeState();
    placeKin(game, [[10, 10]], "Alive1");
    placeKin(game, [[12, 12]], "Alive2");
    const dead = placeKin(game, [[14, 14]], "Dead");
    transitionKinToMemorial(game, dead);
    const b = computeBroodActClearBonus(game);
    expect(b.kin).toBe(2 * SCORE_PER_KIN);
  });

  it("counts unused shield charges from the upgrades state", () => {
    const game = makeGame();
    initCull(game);
    game.upgrades = new UpgradeState();
    game.upgrades.addConsumable("shield", 3);
    const b = computeBroodActClearBonus(game);
    expect(b.shields).toBe(3 * SCORE_PER_UNUSED_SHIELD);
  });

  it("sums kin + shields into total", () => {
    const game = makeGame();
    initCull(game);
    game.upgrades = new UpgradeState();
    placeKin(game, [[10, 10]]);
    game.upgrades.addConsumable("shield", 2);
    const b = computeBroodActClearBonus(game);
    expect(b.total).toBe(b.kin + b.shields);
    expect(b.total).toBe(SCORE_PER_KIN + 2 * SCORE_PER_UNUSED_SHIELD);
  });

  it("enforces D22 invariant: SCORE_PER_KIN > SCORE_PER_UNUSED_SHIELD > 0", () => {
    expect(SCORE_PER_KIN).toBeGreaterThan(SCORE_PER_UNUSED_SHIELD);
    expect(SCORE_PER_UNUSED_SHIELD).toBeGreaterThan(0);
  });

  it("returns zero for a non-cull mechanic", () => {
    const game = makeGame();
    game.mechanic = { type: "rifts" };
    expect(computeBroodActClearBonus(game)).toEqual({ kin: 0, shields: 0, total: 0 });
  });
});

// ── Smarter hunt — multi-pivot + line-extension prior ─────────────

describe("scoreLineExtending", () => {
  it("returns 0 when the candidate has no aligned neighbours", () => {
    const hits = new Set(["10,10"]);
    expect(scoreLineExtending(15, 15, hits)).toBe(0);
  });

  it("returns 0 with a single aligned hit (no confirmed line yet)", () => {
    const hits = new Set(["10,10"]);
    expect(scoreLineExtending(11, 10, hits)).toBe(0);
  });

  it("returns the axis count when the candidate extends 2 aligned hits", () => {
    const hits = new Set(["10,10", "11,10"]);
    // (12, 10) extends the row of 2 hits.
    expect(scoreLineExtending(12, 10, hits)).toBe(2);
  });

  it("returns the axis count when the candidate extends 3 aligned hits", () => {
    const hits = new Set(["10,10", "11,10", "12,10"]);
    expect(scoreLineExtending(13, 10, hits)).toBe(3);
  });

  it("aligns on either axis independently", () => {
    const hits = new Set(["5,5", "5,6"]);
    // Column axis: (5, 7) extends it.
    expect(scoreLineExtending(5, 7, hits)).toBe(2);
    // Row axis has only one hit at row 6; not enough.
    expect(scoreLineExtending(6, 6, hits)).toBe(0);
  });

  it("requires the candidate to be directly adjacent to an aligned hit", () => {
    const hits = new Set(["10,10", "12,10"]);
    // (13, 10) is adjacent to (12, 10) and both hits share row 10.
    expect(scoreLineExtending(13, 10, hits)).toBe(2);
    // (14, 10) is on the same row but not adjacent to any hit.
    expect(scoreLineExtending(14, 10, hits)).toBe(0);
  });
});

describe("multi-pivot hunt (Tier 1)", () => {
  it("probes cardinals of any hit cell — not just the latest", () => {
    // Reproduce the T-shape bug: hitting the middle of a T then hitting
    // one arm, then exhausting the vertical line, must still leave the
    // sideways arms probeable via the middle hit's cardinals — that
    // was the "forget the middle" bug the single-pivot picker had.
    const game = makeGame();
    initCull(game);
    // T layout: middle (10, 10), up-arm (10, 9), sideways arms (9, 10)
    // and (11, 10).
    game.mechanic.targetingMode = "hunt";
    game.mechanic.huntHitCells = new Set(["10,10", "10,9"]);
    // The line extends UP to (10, 8) (miss) and DOWN to (10, 11) (miss).
    // Both have been tried, so the score-2 line-extension pool is empty.
    // Now the picker must fall back to score-0 cardinals — including
    // (9, 10) and (11, 10), the sideways arms of the T.
    game.mechanic.huntTriedCells = new Set(["10,10", "10,9", "10,8", "10,11"]);
    game.mechanic.lastKillX = 10;
    game.mechanic.lastKillY = 9;
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const pick = pickHuntTarget(game, Math.random);
      if (pick) {
        seen.add(pick.x + "," + pick.y);
      }
    }
    expect(seen.has("9,10")).toBe(true);
    expect(seen.has("11,10")).toBe(true);
  });

  it("deduplicates candidates shared between multiple pivots", () => {
    const game = makeGame();
    initCull(game);
    // Two hits horizontally adjacent — (10, 10) and (11, 10). The
    // cardinals of both include some overlaps but each unique candidate
    // should only appear once in the picker's pool.
    game.mechanic.targetingMode = "hunt";
    game.mechanic.huntHitCells = new Set(["10,10", "11,10"]);
    game.mechanic.huntTriedCells = new Set(["10,10", "11,10"]);
    game.mechanic.lastKillX = 11;
    game.mechanic.lastKillY = 10;
    // Expected pool: (9, 10), (12, 10), (10, 9), (10, 11), (11, 9), (11, 11).
    // With line-extension, (9, 10) and (12, 10) score 2 (extending the row);
    // the others score 0.
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const pick = pickHuntTarget(game, Math.random);
      if (pick) {
        seen.add(pick.x + "," + pick.y);
      }
    }
    // The row extensions must be reachable.
    expect(seen.has("9,10")).toBe(true);
    expect(seen.has("12,10")).toBe(true);
  });
});

describe("line-extension prior (Tier 2)", () => {
  it("after two aligned hits, prefers extending the line", () => {
    // Two hits at (10, 10) and (11, 10) — row-axis line. Expected
    // candidates: (9, 10) and (12, 10) score 2; corners score 0. The
    // picker should always pick from the score-2 subset.
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.huntHitCells = new Set(["10,10", "11,10"]);
    game.mechanic.huntTriedCells = new Set(["10,10", "11,10"]);
    game.mechanic.lastKillX = 11;
    game.mechanic.lastKillY = 10;
    const extensions = new Set(["9,10", "12,10"]);
    for (let i = 0; i < 200; i++) {
      const pick = pickHuntTarget(game, Math.random);
      expect(pick).not.toBeNull();
      expect(extensions.has(pick.x + "," + pick.y)).toBe(true);
    }
  });

  it("with a single hit, falls back to uniform random cardinals", () => {
    // Only one hit — no line yet. All four cardinals should be
    // reachable with a uniform random RNG.
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.huntHitCells = new Set(["15,15"]);
    game.mechanic.huntTriedCells = new Set(["15,15"]);
    game.mechanic.lastKillX = 15;
    game.mechanic.lastKillY = 15;
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const pick = pickHuntTarget(game, Math.random);
      if (pick) {
        seen.add(pick.x + "," + pick.y);
      }
    }
    expect(seen.size).toBe(4);
  });

  it("after the line exhausts, falls back to perpendicular candidates", () => {
    // Hits at (10, 10) and (11, 10). If both row-extensions are
    // ineligible (memorial or tried), the picker falls back to the
    // score-0 candidates — the perpendicular corners.
    const game = makeGame();
    initCull(game);
    game.mechanic.targetingMode = "hunt";
    game.mechanic.huntHitCells = new Set(["10,10", "11,10"]);
    // Mark both row-extensions as tried so the score-2 subset is empty.
    game.mechanic.huntTriedCells = new Set(["10,10", "11,10", "9,10", "12,10"]);
    game.mechanic.lastKillX = 11;
    game.mechanic.lastKillY = 10;
    const perpendicular = new Set(["10,9", "10,11", "11,9", "11,11"]);
    for (let i = 0; i < 200; i++) {
      const pick = pickHuntTarget(game, Math.random);
      expect(pick).not.toBeNull();
      expect(perpendicular.has(pick.x + "," + pick.y)).toBe(true);
    }
  });
});

// ── Food-triggered specials — plus + line bombs ──────────────────────

describe("onFoodEaten cadence", () => {
  it("queues a plus at every 3rd food (except multiples of 6)", () => {
    const game = makeGame();
    initCull(game);
    game.foodEaten = 3;
    onFoodEaten(game);
    expect(game.mechanic.pendingSpecial).toBe("plus");
    game.mechanic.pendingSpecial = null;
    game.foodEaten = 9;
    onFoodEaten(game);
    expect(game.mechanic.pendingSpecial).toBe("plus");
  });

  it("queues a line at every 6th food (supersedes the plus)", () => {
    const game = makeGame();
    initCull(game);
    game.foodEaten = 6;
    onFoodEaten(game);
    expect(game.mechanic.pendingSpecial).toBe("line");
    game.mechanic.pendingSpecial = null;
    game.foodEaten = 12;
    onFoodEaten(game);
    expect(game.mechanic.pendingSpecial).toBe("line");
  });

  it("no-op on non-multiples of 3", () => {
    const game = makeGame();
    initCull(game);
    for (const n of [1, 2, 4, 5, 7, 8]) {
      game.mechanic.pendingSpecial = null;
      game.foodEaten = n;
      onFoodEaten(game);
      expect(game.mechanic.pendingSpecial).toBeNull();
    }
  });

  it("no-op for non-cull mechanic", () => {
    const game = makeGame();
    game.mechanic = { type: "rifts" };
    game.foodEaten = 3;
    expect(() => onFoodEaten(game)).not.toThrow();
  });
});

describe("getThrowCells", () => {
  it("returns a single cell for a normal throw", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.throwType = "normal";
    game.mechanic.targetX = 10;
    game.mechanic.targetY = 5;
    const cells = getThrowCells(game.mechanic, game.grid);
    expect(cells).toEqual([[10, 5]]);
  });

  it("plus returns the centre + 4 cardinals (clipped to bounds)", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.throwType = "plus";
    game.mechanic.targetX = 10;
    game.mechanic.targetY = 10;
    const cells = getThrowCells(game.mechanic, game.grid);
    expect(cells.length).toBe(5);
    expect(cells).toEqual(
      expect.arrayContaining([
        [10, 10],
        [11, 10],
        [9, 10],
        [10, 11],
        [10, 9],
      ])
    );
  });

  it("plus clips off-grid cardinals when the centre sits at a corner", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.throwType = "plus";
    game.mechanic.targetX = 0;
    game.mechanic.targetY = 0;
    const cells = getThrowCells(game.mechanic, game.grid);
    // Centre + right + down; left + up are off-grid.
    expect(cells.length).toBe(3);
  });

  it("line_h returns a full row", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.throwType = "line_h";
    game.mechanic.targetY = 7;
    const cells = getThrowCells(game.mechanic, game.grid);
    expect(cells.length).toBe(game.grid.width);
    for (const [x, y] of cells) {
      expect(y).toBe(7);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(game.grid.width);
    }
  });

  it("line_v returns a full column", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.throwType = "line_v";
    game.mechanic.targetX = 3;
    const cells = getThrowCells(game.mechanic, game.grid);
    expect(cells.length).toBe(game.grid.height);
    for (const [x] of cells) {
      expect(x).toBe(3);
    }
  });
});

describe("tickCull — plus bomb (end-to-end)", () => {
  it("consumes the pending special and enters telegraph at plus fuse", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.pendingSpecial = "plus";
    // rngSeq: [plus x, plus y] — pick target (5, 5).
    const rand = rngSeq([(5 + 0.5) / game.grid.width, (5 + 0.5) / game.grid.height]);
    runMs(game, 50, rand);
    expect(game.mechanic.throwType).toBe("plus");
    expect(game.mechanic.state).toBe("telegraph");
    expect(game.mechanic.pendingSpecial).toBeNull();
    expect(game.mechanic.throwTimer).toBe(0);
  });

  it("plus impact hits every alive kin cell within the +", () => {
    const game = makeGame();
    initCull(game);
    // T-shape kin at (10, 10) centre with cardinals filled.
    const kin = placeKin(game, [
      [10, 10],
      [11, 10],
      [9, 10],
      [10, 11],
      [10, 9],
    ]);
    game.mechanic.pendingSpecial = "plus";
    const rand = rngSeq([(10 + 0.5) / game.grid.width, (10 + 0.5) / game.grid.height]);
    runMs(game, PLUS_TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 200, rand);
    // All 5 cells hit — kin fully sunk.
    expect(kin.alive).toBe(false);
  });

  it("plus fully absorbed by shielded kin — no cells memorialised", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [10, 10],
      [11, 10],
      [9, 10],
      [10, 11],
      [10, 9],
    ]);
    kin.shielded = true;
    game.mechanic.pendingSpecial = "plus";
    const rand = rngSeq([(10 + 0.5) / game.grid.width, (10 + 0.5) / game.grid.height]);
    runMs(game, PLUS_TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 200, rand);
    expect(kin.alive).toBe(true);
    expect(kin.shielded).toBe(false);
    // Block taunt queued (or active).
    const seen =
      game.mechanic.activeLine?.category === "block" ||
      game.mechanic.voiceQueue.some((l) => l.category === "block");
    expect(seen).toBe(true);
  });

  it("plus hits enter hunt mode with multi-pivot huntHitCells", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [10, 10],
      [11, 10],
    ]);
    // Fake the plus so it lands right on the kin's cells: place another
    // kin at (9, 10) and (10, 11) so the plus lands on multiple kin.
    game.mechanic.pendingSpecial = "plus";
    const rand = rngSeq([(10 + 0.5) / game.grid.width, (10 + 0.5) / game.grid.height]);
    runMs(game, PLUS_TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 200, rand);
    expect(game.mechanic.targetingMode).toBe("hunt");
    // Hit cells populated with the kin cells the + landed on.
    expect(game.mechanic.huntHitCells.has("10,10")).toBe(true);
    expect(game.mechanic.huntHitCells.has("11,10")).toBe(true);
    expect(kin.alive).toBe(false);
  });

  it("plus resets miss streak when it hits at least one kin cell", () => {
    const game = makeGame();
    initCull(game);
    placeKin(game, [[10, 10]]);
    game.mechanic.missStreak = 5;
    game.mechanic.pendingSpecial = "plus";
    const rand = rngSeq([(10 + 0.5) / game.grid.width, (10 + 0.5) / game.grid.height]);
    runMs(game, PLUS_TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 200, rand);
    expect(game.mechanic.missStreak).toBe(0);
  });

  it("a plus that misses everything leaves miss streak untouched", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.missStreak = 4;
    game.mechanic.pendingSpecial = "plus";
    // Plus at (25, 25) — no kin around.
    const rand = rngSeq([(25 + 0.5) / game.grid.width, (25 + 0.5) / game.grid.height]);
    runMs(game, PLUS_TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 200, rand);
    expect(game.mechanic.missStreak).toBe(4);
  });
});

describe("tickCull — line bomb (end-to-end)", () => {
  it("line bomb hits every kin cell on the chosen row", () => {
    const game = makeGame();
    initCull(game);
    const kinA = placeKin(game, [[5, 10]], "A");
    const kinB = placeKin(game, [[20, 10]], "B");
    const kinControl = placeKin(game, [[10, 5]], "ControlOtherRow");
    game.mechanic.pendingSpecial = "line";
    // rngSeq [horizontal roll < 0.5, y roll → row 10].
    const rand = rngSeq([0, (10 + 0.5) / game.grid.height]);
    runMs(game, LINE_TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 200, rand);
    expect(kinA.alive).toBe(false);
    expect(kinB.alive).toBe(false);
    expect(kinControl.alive).toBe(true);
  });

  it("line bomb absorbed by shield leaves the kin alive", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [
      [5, 10],
      [6, 10],
      [7, 10],
      [8, 10],
      [9, 10],
    ]);
    kin.shielded = true;
    game.mechanic.pendingSpecial = "line";
    const rand = rngSeq([0, (10 + 0.5) / game.grid.height]);
    runMs(game, LINE_TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 200, rand);
    expect(kin.alive).toBe(true);
    expect(kin.shielded).toBe(false);
  });
});

describe("mines (Phase 3)", () => {
  it("resolveImpact returns 'mine' when hitting a mine cell and consumes it", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.mines.add("7,8");
    const result = resolveImpact(game, 7, 8);
    expect(result).toBe("mine");
    expect(game.mechanic.mines.has("7,8")).toBe(false);
  });

  it("mine detonation stuns Reginald for MINE_STUN_MS", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.mines.add("5,5");
    resolveImpact(game, 5, 5);
    expect(game.mechanic.stunRemaining).toBe(MINE_STUN_MS);
  });

  it("mine stun matches THROW_INTERVAL_MS — a mine buys the player one throw", () => {
    expect(MINE_STUN_MS).toBe(THROW_INTERVAL_MS);
  });

  it("mine detonation installs a stun taunt as the active line", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.mines.add("6,6");
    resolveImpact(game, 6, 6);
    expect(game.mechanic.activeLine).not.toBeNull();
    expect(game.mechanic.activeLine.category).toBe("stun");
  });

  it("stun taunt is not preempted by queued death/idle lines", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.mines.add("6,6");
    resolveImpact(game, 6, 6);
    // Queue a would-be preemptor.
    game.mechanic.voiceQueue.push({
      text: "queued",
      category: "idle",
      dwellMs: 3500,
    });
    // Dwell past the normal preempt threshold; stun should still be up.
    runMs(game, 1200, () => 0.5);
    expect(game.mechanic.activeLine?.category).toBe("stun");
  });

  it("mine detonation enters hunt mode anchored at the mine cell", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.mines.add("3,4");
    game.mechanic.targetingMode = "search";
    game.mechanic.missStreak = 5;
    resolveImpact(game, 3, 4);
    expect(game.mechanic.targetingMode).toBe("hunt");
    expect(game.mechanic.huntHitCells.has("3,4")).toBe(true);
    expect(game.mechanic.huntTriedCells.has("3,4")).toBe(true);
    expect(game.mechanic.lastKillX).toBe(3);
    expect(game.mechanic.lastKillY).toBe(4);
    expect(game.mechanic.missStreak).toBe(0);
  });

  it("stun blocks the regular throw cadence — no telegraph fires", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.stunRemaining = 2000;
    runMs(game, THROW_INTERVAL_MS + 200, () => 0.5);
    expect(game.mechanic.state).toBe("idle");
    expect(game.mechanic.stunRemaining).toBeLessThan(2000);
  });

  it("stun blocks pending specials — they wait until the stun ends", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.stunRemaining = 1000;
    game.mechanic.pendingSpecial = "plus";
    runMs(game, 500, () => 0.5);
    // Stun still ticking — special still pending, no telegraph yet.
    expect(game.mechanic.pendingSpecial).toBe("plus");
    expect(game.mechanic.state).toBe("idle");
    // Finish the stun; the special should now fire on the next tick.
    runMs(game, 700, rngSeq([0.5, 0.5]));
    expect(game.mechanic.pendingSpecial).toBeNull();
    expect(game.mechanic.state).toBe("telegraph");
    expect(game.mechanic.throwType).toBe("plus");
  });

  it("mine sitting on a shielded kin cell detonates before the shield check", () => {
    const game = makeGame();
    initCull(game);
    const kin = placeKin(game, [[8, 8]]);
    kin.shielded = true;
    game.mechanic.mines.add("8,8");
    const result = resolveImpact(game, 8, 8);
    // Mine takes precedence — shield stays intact, kin unhurt.
    expect(result).toBe("mine");
    expect(kin.shielded).toBe(true);
    expect(kin.alive).toBe(true);
    expect(game.mechanic.stunRemaining).toBe(MINE_STUN_MS);
  });

  it("plus bomb footprint detonates every mine it covers", () => {
    const game = makeGame();
    initCull(game);
    // Mines at three of the plus's five cells.
    game.mechanic.mines.add("10,10");
    game.mechanic.mines.add("11,10");
    game.mechanic.mines.add("10,11");
    game.mechanic.pendingSpecial = "plus";
    const rand = rngSeq([(10 + 0.5) / game.grid.width, (10 + 0.5) / game.grid.height]);
    runMs(game, PLUS_TELEGRAPH_FUSE_MS + IMPACT_FLASH_MS + 200, rand);
    expect(game.mechanic.mines.has("10,10")).toBe(false);
    expect(game.mechanic.mines.has("11,10")).toBe(false);
    expect(game.mechanic.mines.has("10,11")).toBe(false);
    expect(game.mechanic.stunRemaining).toBeGreaterThan(0);
  });

  it("mine impact on an empty cell doesn't count as a search miss", () => {
    const game = makeGame();
    initCull(game);
    game.mechanic.missStreak = 3;
    game.mechanic.mines.add("15,15");
    resolveImpact(game, 15, 15);
    // Mine reset the streak because it counts as a "hit-event" for AI.
    expect(game.mechanic.missStreak).toBe(0);
  });
});
