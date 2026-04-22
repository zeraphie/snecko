// boss-shape.js — .boss file parser
//
// Parses a .boss text file into a shape definition used by BossEntity.
// Format: first line is the boss name, remaining lines are the visual grid.
//   █ = body cell
//   ◈ = weak point (exactly one required)
//   ░ = empty (gap)

const BODY = "\u2588"; // █
const WEAK = "\u25C8"; // ◈

/**
 * Parses a .boss file's text content into a shape definition.
 *
 * @param {string} text — raw .boss file contents
 * @returns {{ name: string, cells: Array<{dx: number, dy: number, weak: boolean}>, width: number, height: number }}
 */
export function parseBossShape(text) {
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) {
    throw new Error(".boss file must have a name line and at least one grid row");
  }

  const name = lines[0].trim();
  const gridLines = lines.slice(1);

  const cells = [];
  let weakCount = 0;
  let width = 0;

  for (let dy = 0; dy < gridLines.length; dy++) {
    const row = gridLines[dy];
    if (row.length > width) {
      width = row.length;
    }
    for (let dx = 0; dx < row.length; dx++) {
      const ch = row[dx];
      if (ch === BODY) {
        cells.push({ dx, dy, weak: false });
      } else if (ch === WEAK) {
        cells.push({ dx, dy, weak: true });
        weakCount++;
      }
      // ░ or anything else = empty, skip
    }
  }

  if (weakCount !== 1) {
    throw new Error(`.boss "${name}": expected exactly 1 weak point (◈), found ${weakCount}`);
  }

  return {
    name,
    cells,
    width,
    height: gridLines.length,
  };
}
