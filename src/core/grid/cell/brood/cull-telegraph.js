// brood/cull-telegraph.js — CELL_CULL_TELEGRAPH: Reginald's locked-on
// throw target during the 1 s fuse.
//
// A red warning cell, drawn over whatever occupies the target (kin /
// empty / food) so the incoming hit reads. Distinct from the dim grey
// CELL_TELEGRAPH (The Algorithm's current warning) — this is an attack
// the player has one second to react to.

import { CELL_CULL_TELEGRAPH } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { RED } from "../../../../render/terminal/palette.js";

defineCell(CELL_CULL_TELEGRAPH, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#b3261e",
      glyph: "╳╳",
      glyphColor: RED,
    });
  },
});
