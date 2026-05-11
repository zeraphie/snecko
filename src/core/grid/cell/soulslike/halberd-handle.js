// soulslike/halberd-handle.js — CELL_HALBERD_HANDLE: wood shaft of
// Hissalia's glaive. Renders as a thin filled rectangle oriented along
// the boss's facing axis — reads as a haft "in" the cell rather than
// filling it.

import { CELL_HALBERD_HANDLE } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { drawThinRect } from "./_thin-rect.js";

const DARK_BROWN_ANSI = "\x1b[38;5;94m";
const COLOR = "#5a4030";

defineCell(CELL_HALBERD_HANDLE, {
  render(x, y, context) {
    const facing = context?.facing ?? { dx: 0, dy: 1 };
    activeRenderer.cell(x, y, {
      glyph: "║║",
      glyphColor: DARK_BROWN_ANSI,
      detailed: (ctx, px, py, cs) => {
        drawThinRect(ctx, px, py, cs, facing, COLOR);
      },
    });
  },
});
