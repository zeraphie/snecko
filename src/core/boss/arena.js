// arena.js — Arena format parser and loader for boss fights
//
// .arena format (1 char per cell):
//   █  wall
//   ░  empty (walkable floor)
//   B  boss spawn point          (stripped to floor under the hood)
//   S  snake spawn point         (stripped to floor under the hood)
//
// Scenery markers (case = blocking?):
//   UPPERCASE letters → blocking scenery (also walls for collision)
//     T  tree
//     G  gravestone
//   lowercase letters → non-blocking scenery (decoration; floor stays passable)
//     f  flower
//
// Connected scenery cells of the same marker are grouped into a single
// "region" so the renderer can scale its drawing to the size — e.g. a
// 1×1 flower is a small cluster, while a 3×3 patch scatters petals
// across the whole area. Each region carries its bounds, the cell
// list, and an integer id (for stable per-region seeding in the
// renderer).
//
// Arenas are separated by blank lines. First line of each block is
// the arena name.

const WALL = "█"; // █
const BOSS = "B";
const SNAKE = "S";

/**
 * Registry of scenery characters. Add new entries here to extend the
 * format — the parser, applyArena, and renderer all look up by
 * `type` so adding a char is the only place you need to touch.
 *
 * @type {Record<string, { type: string, blocking: boolean }>}
 */
const SCENERY_CHARS = {
  T: { type: "tree", blocking: true },
  G: { type: "gravestone", blocking: true },
  f: { type: "flower", blocking: false },
  w: { type: "water", blocking: false },
};

/**
 * @typedef {Object} SceneryRegion
 * @property {number} id           — unique within the arena
 * @property {string} type         — e.g. 'tree', 'flower'
 * @property {boolean} blocking    — true if cells are also walls
 * @property {Array<{x:number, y:number}>} cells
 * @property {{x:number, y:number, w:number, h:number}} bounds — inclusive
 */

/**
 * Parses a .arena file into an array of arena definitions.
 *
 * @param {string} text — raw .arena file content
 * @returns {Array<{
 *   name: string,
 *   width: number,
 *   height: number,
 *   walls: boolean[][],
 *   bossSpawn: { x: number, y: number },
 *   snakeSpawn: { x: number, y: number },
 *   scenery: SceneryRegion[]
 * }>}
 */
export function parseArenaFile(text) {
  const blocks = text.trim().split(/\n\n+/);
  const arenas = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.length > 0);
    if (lines.length < 2) {
      continue;
    }

    const name = lines[0].trim();
    const grid = lines.slice(1);
    const height = grid.length;
    const width = grid[0].length;
    const walls = [];
    // Parallel grid of scenery characters per cell (or "" if none).
    // Used during the region-grouping pass below.
    const sceneryGrid = [];
    let bossSpawn = null;
    let snakeSpawn = null;

    for (let y = 0; y < height; y++) {
      const wallRow = [];
      const sceneryRow = [];
      for (let x = 0; x < grid[y].length; x++) {
        const ch = grid[y][x];
        const scenerySpec = SCENERY_CHARS[ch];
        if (ch === WALL) {
          wallRow.push(true);
          sceneryRow.push("");
        } else if (scenerySpec) {
          // Blocking scenery shares the wall mask so movement
          // collision works without any extra plumbing.
          wallRow.push(scenerySpec.blocking);
          sceneryRow.push(ch);
        } else {
          wallRow.push(false);
          sceneryRow.push("");
          if (ch === BOSS) {
            bossSpawn = { x, y };
          } else if (ch === SNAKE) {
            snakeSpawn = { x, y };
          }
        }
      }
      walls.push(wallRow);
      sceneryGrid.push(sceneryRow);
    }

    // Spawn cells (B/S) carry no scenery char of their own. If their
    // 4-neighbours sit on a non-blocking scenery (e.g. the pond's
    // water region or a flower carpet), inherit that char so the
    // spawn cell renders as the same texture instead of standing
    // out as a blank patch when the boss/snake moves off the spawn
    // position.
    inheritSceneryFor(sceneryGrid, bossSpawn, width, height);
    inheritSceneryFor(sceneryGrid, snakeSpawn, width, height);

    const scenery = groupSceneryRegions(sceneryGrid, width, height);
    arenas.push({ name, width, height, walls, bossSpawn, snakeSpawn, scenery });
  }

  return arenas;
}

function inheritSceneryFor(grid, spawn, width, height) {
  if (!spawn) {
    return;
  }
  const neighbours = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of neighbours) {
    const nx = spawn.x + dx;
    const ny = spawn.y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      continue;
    }
    const ch = grid[ny][nx];
    const spec = SCENERY_CHARS[ch];
    if (spec && !spec.blocking) {
      grid[spawn.y][spawn.x] = ch;
      return;
    }
  }
}

/**
 * BFS over the scenery grid to bucket connected (4-neighbour) cells
 * of the same marker character into a single region. Returns regions
 * in deterministic order — by top-left cell — so per-region seeds in
 * the renderer stay stable across reloads.
 *
 * @param {string[][]} sceneryGrid
 * @param {number} width
 * @param {number} height
 * @returns {SceneryRegion[]}
 */
function groupSceneryRegions(sceneryGrid, width, height) {
  const visited = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const regions = [];
  let nextId = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = sceneryGrid[y][x];
      if (!ch || visited[y][x]) {
        continue;
      }
      const spec = SCENERY_CHARS[ch];
      // Floodfill all 4-connected neighbours with the SAME char.
      const cells = [];
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      const queue = [[x, y]];
      visited[y][x] = true;
      while (queue.length > 0) {
        const [cx, cy] = queue.pop();
        cells.push({ x: cx, y: cy });
        if (cx < minX) {
          minX = cx;
        }
        if (cy < minY) {
          minY = cy;
        }
        if (cx > maxX) {
          maxX = cx;
        }
        if (cy > maxY) {
          maxY = cy;
        }
        const neighbours = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of neighbours) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (visited[ny][nx]) {
            continue;
          }
          if (sceneryGrid[ny][nx] !== ch) {
            continue;
          }
          visited[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
      regions.push({
        id: nextId++,
        type: spec.type,
        blocking: spec.blocking,
        cells,
        bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      });
    }
  }

  return regions;
}

/**
 * Applies an arena definition to a grid: sets walls (including
 * blocking scenery) and clears everything else. Scenery itself is
 * just returned via the parsed arena — the screen render path is
 * what consumes it.
 *
 * @param {object} grid — Grid instance
 * @param {object} arena — parsed arena definition
 */
export function applyArena(grid, arena) {
  grid.clearMasks("wall");
  grid.clearMasks("snake");
  grid.clearMasks("reserved");
  grid.terrain.fill(0);
  grid.foodX = -1;
  grid.foodY = -1;
  grid.bossFoodX = -1;
  grid.bossFoodY = -1;

  for (let y = 0; y < arena.height; y++) {
    for (let x = 0; x < arena.width; x++) {
      if (arena.walls[y][x]) {
        grid.setCell("wall", x, y);
      }
    }
  }
}
