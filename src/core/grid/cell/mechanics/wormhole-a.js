// mechanics/wormhole-a.js — CELL_WORMHOLE_A: orange portal (entry).

import { CELL_WORMHOLE_A } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { ORANGE } from "../../../../render/terminal/palette.js";
import { drawPortal } from "./_portal.js";

const COLOR = "#ff6600";

defineCell(CELL_WORMHOLE_A, {
  render(x, y) {
    const t = Date.now() / 1000;
    activeRenderer.cell(x, y, {
      glyph: "◉◉",
      glyphColor: ORANGE,
      detailed: (ctx, px, py, cs) => drawPortal(ctx, px, py, cs, COLOR, t, 0),
    });
  },
});
