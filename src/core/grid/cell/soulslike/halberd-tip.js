// soulslike/halberd-tip.js — CELL_HALBERD_TIP: damaging tip of the
// glaive. Three render variants tied to attack state:
//   - `isSignifier` true (final windup tick) → bright white flash; the
//     "the strike is now" cue.
//   - `attackPhase === "execute"` → white, mid-swing live hitbox.
//   - otherwise (idle / windup / recovery) → red, neutral pose.
//
// Renders as a thin oriented rectangle (the blade), matching the
// handle's orientation so the glaive reads as a continuous line.

import { CELL_HALBERD_TIP } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { RED, WHITE } from "../../../../render/terminal/palette.js";
import { drawThinRect } from "./_thin-rect.js";

const COLOR_REST = "#c0392b";
const COLOR_HOT = "#ffffff";

defineCell(CELL_HALBERD_TIP, {
  render(x, y, context) {
    const facing = context?.facing ?? { dx: 0, dy: 1 };
    const signifier = !!context?.isSignifier;
    const live = context?.attackPhase === "execute";
    const hot = signifier || live;
    activeRenderer.cell(x, y, {
      glyph: hot ? "◆◆" : "▲▲",
      glyphColor: hot ? WHITE : RED,
      detailed: (ctx, px, py, cs) => {
        drawThinRect(ctx, px, py, cs, facing, hot ? COLOR_HOT : COLOR_REST);
      },
    });
  },
});
