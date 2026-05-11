// mechanics/wormhole-b.js — CELL_WORMHOLE_B: blue portal (exit).

import { CELL_WORMHOLE_B } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { BLUE } from "../../../../render/terminal/palette.js";
import { drawPortal } from "./_portal.js";

const COLOR = "#3399ff";

defineCell(CELL_WORMHOLE_B, {
  render(x, y) {
    const t = Date.now() / 1000;
    activeRenderer.cell(x, y, {
      glyph: "◉◉",
      glyphColor: BLUE,
      detailed: (ctx, px, py, cs) => drawPortal(ctx, px, py, cs, COLOR, t, Math.PI),
    });
  },
});
