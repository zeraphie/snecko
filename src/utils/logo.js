// logo.js — Z-shaped snake pixel art (single source of truth)
//
// Color keys:  B = body, H = head, E = eye, T = tongue, t = tail
// Grid is read top-to-bottom, left-to-right.

export const LOGO_COLORS = {
  B: "#00e5ff", // body — snake cyan
  H: "#80f0ff", // head — lighter cyan
  E: "#16162a", // eye  — dark
  T: "#e74c3c", // tongue — red
  t: "#00b8d4", // tail — slightly darker cyan
};

//  The Z-shape IS the snake. 2px thick.
//  Head at left end of top bar, facing left with forked tongue.
//  Tongue forks from col 2 (adjacent to head at col 3), curving outward.
//  Tail tapers at right end of bottom bar.
//
//  T . . . . . . . .
//  . T . . . . . . .
//  . . T H E H B B B
//  . T . H B B B B B
//  T . . . . . . B B
//  . . . . . . B B .
//  . . . . . B B . .
//  . . . . B B B B B
//  . . . . B B B B t
//
const GRID_ROWS = [
  "T........", // 0   tongue upper fork tip
  ".T.......", // 1   tongue curves in
  "..THEHBBB", // 2   tongue meets head + top bar (eye at col 4)
  ".T.HBBBBB", // 3   tongue lower fork + top bar
  "T......BB", // 4   tongue lower tip + diagonal
  "......BB.", // 5   diagonal
  ".....BB..", // 6   diagonal
  "....BBBBB", // 7   bottom bar
  "....BBBBt", // 8   bottom bar + tail taper
];

export const LOGO_HEIGHT = GRID_ROWS.length;
export const LOGO_WIDTH = GRID_ROWS[0].length;

// Parse into structured pixel list: [ { x, y, color } ... ]
export const LOGO_PIXELS = [];
for (let y = 0; y < LOGO_HEIGHT; y++) {
  for (let x = 0; x < LOGO_WIDTH; x++) {
    const ch = GRID_ROWS[y][x];
    if (ch !== ".") {
      LOGO_PIXELS.push({ x, y, color: ch });
    }
  }
}

// Also export the raw grid for renderers that prefer row-by-row access
export const LOGO_GRID = GRID_ROWS;
