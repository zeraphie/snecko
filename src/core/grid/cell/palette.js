// cell/palette.js — Shared canvas colors used by multiple cell files.
//
// Cells that own a one-off color keep it inline; only colors that appear
// in more than one cell file belong here. Terminal palette lives in
// `render/terminal/palette.js` (ANSI escapes).

// Bullet-hell boss family — same purple is reused by BOSS_BODY,
// BOSS_HIT (as the dark end of the white→purple pulse), and BLOB
// (catacombs survival boss).
export const BOSS_PURPLE = "#8e44ad";
