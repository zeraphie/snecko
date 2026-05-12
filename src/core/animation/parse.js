// parse.js — `.animation` file parser
//
// File format:
//
//   @palette                       (optional — canvas-detail files only)
//   K #1a1a2e   label
//   O #d35b00   label
//   ...
//
//   frame-name
//   ........
//   ...rows of pixel chars...
//
// Blocks are separated by blank lines. A block starting with `@palette`
// declares the colour legend; every other block is a named frame whose
// rows are exactly its width (rectangular). Empty cells use `.` or
// space; in palette-less files `█` is solid and `░` empty.

/**
 * @typedef {Object} AnimationFrame
 * @property {number} width
 * @property {number} height
 * @property {string[]} rows — raw pixel chars per row (left-to-right, top-to-bottom)
 */

/**
 * @typedef {Object} Animation
 * @property {Record<string, string>|null} palette — char → "#RRGGBB"; null when palette-less
 * @property {Record<string, AnimationFrame>} frames
 */

/**
 * @param {string} text
 * @returns {Animation}
 */
export function parseAnimation(text) {
  /** @type {Record<string, string>|null} */
  let palette = null;
  /** @type {Record<string, AnimationFrame>} */
  const frames = {};

  const blocks = text.replace(/\r\n/g, "\n").trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.length > 0);
    if (lines.length === 0) {
      continue;
    }
    const header = lines[0].trim();

    if (header === "@palette") {
      palette = {};
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length < 2) {
          continue;
        }
        const [ch, color] = parts;
        if (ch.length !== 1) {
          throw new Error(`animation: palette key "${ch}" must be a single char`);
        }
        palette[ch] = color;
      }
      continue;
    }

    const rows = lines.slice(1);
    if (rows.length === 0) {
      throw new Error(`animation: frame "${header}" has no rows`);
    }
    const width = rows[0].length;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].length !== width) {
        throw new Error(
          `animation: frame "${header}" row ${i} width ${rows[i].length} != ${width}`
        );
      }
    }
    frames[header] = { width, height: rows.length, rows };
  }

  return { palette, frames };
}
