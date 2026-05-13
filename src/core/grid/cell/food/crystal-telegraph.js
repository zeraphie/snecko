// food/crystal-telegraph.js — CELL_CRYSTAL_TELEGRAPH: ghost-preview of an
// upcoming crystal wall. Same paint as `CELL_WALL_CRYSTAL` but at
// reduced opacity so the player reads it as "incoming, not yet solid".
// Detailed pixel-art added in a follow-up step.

import { CELL_CRYSTAL_TELEGRAPH } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { DIM } from "../../../../render/terminal/palette.js";

// Canvas-side: the cluster overlay (`render/canvas/crystal-cluster.js`)
// draws the upcoming crystal shape at reduced alpha. This per-cell
// render is a no-op on canvas (no `color` / no `detailed`) so the
// checker grid shows through where the cluster doesn't reach; terminal
// keeps a dim glyph so the warning is still visible.
defineCell(CELL_CRYSTAL_TELEGRAPH, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      glyph: "░░",
      glyphColor: DIM,
    });
  },
});
