// cell/empty.js — CELL_EMPTY: the no-op cell.
//
// Empty positions on canvas are visually the BG checkerboard drawn by
// `CanvasRenderer.clear()`; the spec carries no `color` so canvas's
// `cell()` is a no-op for empty (and the canvas render path doesn't
// explicitly draw empty cells anyway). Terminal stamps a dim glyph so
// `flush.js` has something to emit; `TerminalRenderer.clear()` calls
// this for every cell on each frame, before any other draws.

import { CELL_EMPTY } from "../../../render/renderer.js";
import { activeRenderer } from "../../../render/active.js";
import { defineCell } from "./registry.js";
import { DIM } from "../../../render/terminal/palette.js";

defineCell(CELL_EMPTY, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      glyph: "░░",
      glyphColor: DIM,
    });
  },
});
