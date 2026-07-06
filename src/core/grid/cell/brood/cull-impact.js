// brood/cull-impact.js — CELL_CULL_IMPACT: the cell-local flash at the
// moment a throw lands.
//
// A brief bright burst (D25, Q10 — local flash, no full-grid effects).
// On a hit the cell becomes a memorial once the flash clears; on a miss
// it reverts to whatever was underneath.

import { CELL_CULL_IMPACT } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { YELLOW } from "../../../../render/terminal/palette.js";

defineCell(CELL_CULL_IMPACT, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#ffe08a",
      glyph: "██",
      glyphColor: YELLOW,
    });
  },
});
