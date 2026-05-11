// boss/projectile.js — CELL_PROJECTILE: boss-fired projectile, flat red.

import { CELL_PROJECTILE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { RED } from "../../../../render/terminal/palette.js";

defineCell(CELL_PROJECTILE, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: "#e74c3c",
      glyph: "••",
      glyphColor: RED,
    });
  },
});
