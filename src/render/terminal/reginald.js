// reginald.js — Terminal overlay for Sir Reginald Caw.
//
// Step 9 stamps the idle silhouette near the top-right of the play
// field. Sprite cells are stamped as solid blocks at integer cell
// coordinates — no sub-cell precision in the terminal, so this is
// just a silhouette.
//
// Step 12 adds the speech bubble: when `game.mechanic.activeLine` is
// non-null, stamp the text into the cells to the left of the
// silhouette. The text overlays whatever play cells it covers; the
// silhouette itself already does the same.

import { DIM, WHITE, RESET, BRIGHT_AMBER, DIM_CYAN, YELLOW } from "./palette.js";

const SOLID_CELL_GLYPH = "██";

/**
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {import('../../core/game/index.js').Game} game
 */
export function drawReginald(r, game) {
  const animData = game.manifest?.animations?.reginald?.terminal;
  if (!animData) {
    return;
  }
  const poseName = game.mechanic?.type === "cull" ? game.mechanic.state : "idle";
  const frame = animData.frames[poseName] ?? animData.frames.idle;
  if (!frame) {
    return;
  }

  // Top-right of the playfield with a 1-cell margin so it doesn't crowd
  // the edge column.
  const startX = r._w - frame.width - 1;
  const startY = 1;
  const stamp = DIM + WHITE + SOLID_CELL_GLYPH + RESET;

  for (let py = 0; py < frame.height; py++) {
    const gy = startY + py;
    if (gy < 0 || gy >= r._h) {
      continue;
    }
    const row = frame.rows[py];
    for (let px = 0; px < frame.width; px++) {
      const gx = startX + px;
      if (gx < 0 || gx >= r._w) {
        continue;
      }
      if (row[px] === "█") {
        r._grid[gy][gx] = stamp;
      }
    }
  }

  drawReginaldBubble(r, game, startX, startY);
}

/**
 * Stamps the active speech-bubble line in the cells to the left of the
 * Reginald silhouette. Each play-grid cell holds two characters, so a
 * `bubbleCells` window of N cells fits roughly 2N characters of text;
 * lines longer than that are truncated with `…`.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {import('../../core/game/index.js').Game} game
 * @param {number} spriteStartX — cull silhouette's leftmost column.
 * @param {number} spriteStartY — cull silhouette's topmost row.
 */
function drawReginaldBubble(r, game, spriteStartX, spriteStartY) {
  const line = game.mechanic?.activeLine;
  if (!line) {
    return;
  }
  // Reserve a 1-cell margin between bubble and sprite so the text
  // doesn't run into the silhouette.
  const bubbleEndX = spriteStartX - 1; // exclusive
  const bubbleStartX = 0;
  const bubbleCells = bubbleEndX - bubbleStartX;
  if (bubbleCells <= 0) {
    return;
  }
  const maxChars = bubbleCells * 2;
  let text = line.text;
  if (text.length > maxChars) {
    text = text.slice(0, Math.max(0, maxChars - 1)) + "…";
  }
  // Pad to even length so each cell holds exactly 2 chars.
  if (text.length % 2 === 1) {
    text += " ";
  }
  const color = colorForCategory(line.category);
  const startCol = bubbleEndX - text.length / 2;
  const row = spriteStartY;
  if (row < 0 || row >= r._h) {
    return;
  }
  for (let i = 0; i < text.length; i += 2) {
    const gx = startCol + i / 2;
    if (gx < 0 || gx >= r._w) {
      continue;
    }
    r._grid[row][gx] = color + text.slice(i, i + 2) + RESET;
  }
}

function colorForCategory(category) {
  if (category === "pity") {
    return BRIGHT_AMBER;
  }
  if (category === "death") {
    return YELLOW;
  }
  return DIM_CYAN;
}
