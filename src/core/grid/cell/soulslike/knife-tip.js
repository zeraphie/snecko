// soulslike/knife-tip.js — CELL_KNIFE_TIP: the snake fighter's knife.
//
// One-cell weapon (the knife is 1 cell shorter than the glaive). The
// SCREEN layer decides where this cell renders — right of the player
// when idle, jumped 1 forward when `snakeAnim.state === "stab_active"`.
// During stab the cell flashes brighter to read as the active hitbox.

import { CELL_KNIFE_TIP } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { CYAN, WHITE } from "../../../../render/terminal/palette.js";
import { drawThinRect } from "./_thin-rect.js";

const COLOR_REST = "#bdc3c7"; // silver — passive blade
const COLOR_LIVE = "#ffffff"; // bright — active stab hitbox

defineCell(CELL_KNIFE_TIP, {
  render(x, y, context) {
    const facing = context?.facing ?? { dx: 0, dy: -1 };
    const live = context?.snakeAnimState === "stab_active";
    activeRenderer.cell(x, y, {
      glyph: live ? "◆◆" : "▴▴",
      glyphColor: live ? WHITE : CYAN,
      detailed: (ctx, px, py, cs) => {
        drawThinRect(ctx, px, py, cs, facing, live ? COLOR_LIVE : COLOR_REST, 0.22, 1.0);
      },
    });
  },
});
