// terrain/wall-crystal.js — CELL_WALL_CRYSTAL: crystalline wall facet.
//
// Functionally identical to CELL_WALL (impassable, eats no walls).
// Canvas paints faceted quartz-style detailing per cell (added in a
// follow-up step); terminal stays a colour-coded glyph since the
// detail doesn't survive at 2-char-wide cells.

import { CELL_WALL_CRYSTAL } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { CYAN } from "../../../../render/terminal/palette.js";

// Canvas-side detail (faceted spikes spanning the whole cluster) is
// drawn in a single overlay pass — see `render/canvas/crystal-cluster.js`.
// No per-cell background on canvas: the checker grid shows through
// the corners that the thicker spikes don't fill, which keeps the
// crystal reading as a sculpted shape instead of a filled rectangle.
// Terminal still gets a coloured glyph so the wall remains visible.
defineCell(CELL_WALL_CRYSTAL, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      glyph: "██",
      glyphColor: CYAN,
    });
  },
});
