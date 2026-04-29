// loader.js — 3×3 pixel dot-grid loader animation

/**
 * Draws the 3×3 pixel loader centered in the terminal.
 * Called during startup before the game is initialised.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {number[]} dots — 9 opacity values (0–1), indexed by grid position
 */
export function drawLoader(r, dots) {
  const fullWidth = r._w * 2;
  const gridRows = 3;
  const gridCols = 3;
  const dotChar = "██";
  const gapChar = "  ";

  // Build the 3 visual rows of the dot grid
  const lines = [];
  for (let row = 0; row < gridRows; row++) {
    let line = "";
    for (let c = 0; c < gridCols; c++) {
      const idx = row * 3 + c;
      const opacity = dots[idx];
      // Map opacity to ANSI brightness: dim (240) → bright (255)
      const bright = Math.round(232 + opacity * 23); // 256-color grayscale 232–255
      const code = Math.min(255, Math.max(232, bright));
      line += `\x1b[38;5;${code}m${dotChar}\x1b[0m`;
      if (c < gridCols - 1) {
        line += gapChar;
      }
    }
    lines.push(line);
  }

  // Centre vertically and horizontally
  const padTop = Math.max(0, Math.floor((r._h - gridRows) / 2));
  const lineVisWidth = gridCols * 2 + (gridCols - 1) * 2; // "██  ██  ██" = 14 chars
  const padLeft = Math.max(0, Math.floor((fullWidth - lineVisWidth) / 2));
  const padStr = " ".repeat(padLeft);
  const blankLine = " ".repeat(fullWidth);

  let buf = "\x1b[H"; // cursor home
  for (let y = 0; y < r._h; y++) {
    const ri = y - padTop;
    if (ri >= 0 && ri < gridRows) {
      buf += padStr + lines[ri] + " ".repeat(Math.max(0, fullWidth - padLeft - lineVisWidth));
    } else {
      buf += blankLine;
    }
    buf += "\n";
  }

  r._stdout.write(buf);
}
