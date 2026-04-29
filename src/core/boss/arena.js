// arena.js — Arena format parser and loader for boss fights
//
// .arena format:
//   █ = wall
//   ░ = empty
//   B = boss spawn point
//   S = snake spawn point
//
// Arenas are separated by blank lines. First line of each block is the name.

const WALL = "\u2588"; // █
const BOSS = "B";
const SNAKE = "S";

/**
 * Parses a .arena file into an array of arena definitions.
 *
 * @param {string} text — raw .arena file content
 * @returns {Array<{ name: string, walls: boolean[][], bossSpawn: { x: number, y: number }, snakeSpawn: { x: number, y: number } }>}
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
    let bossSpawn = null;
    let snakeSpawn = null;

    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < grid[y].length; x++) {
        const ch = grid[y][x];
        if (ch === WALL) {
          row.push(true);
        } else {
          row.push(false);
          if (ch === BOSS) {
            bossSpawn = { x, y };
          } else if (ch === SNAKE) {
            snakeSpawn = { x, y };
          }
        }
      }
      walls.push(row);
    }

    arenas.push({ name, width, height, walls, bossSpawn, snakeSpawn });
  }

  return arenas;
}

/**
 * Applies an arena definition to a board, setting wall cells and clearing everything else.
 *
 * @param {object} board — Board instance
 * @param {object} arena — parsed arena definition
 */
export function applyArena(board, arena) {
  board.clearMasks("wall");
  board.clearMasks("snake");
  board.clearMasks("reserved");
  board.terrain.fill(0);
  board.foodX = -1;
  board.foodY = -1;
  board.bossFoodX = -1;
  board.bossFoodY = -1;

  for (let y = 0; y < arena.height; y++) {
    for (let x = 0; x < arena.width; x++) {
      if (arena.walls[y][x]) {
        board.setCell("wall", x, y);
      }
    }
  }
}
