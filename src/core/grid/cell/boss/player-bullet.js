// boss/player-bullet.js — CELL_PLAYER_BULLET: player-fired projectile (cyan).

import { CELL_PLAYER_BULLET } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { CYAN, DIM_CYAN } from "../../../../render/terminal/palette.js";

const PULSE_HZ = 8.0;

defineCell(CELL_PLAYER_BULLET, {
  render(x, y) {
    const t = Date.now() / 1000;
    const bright = Math.sin(t * PULSE_HZ) > 0;
    activeRenderer.cell(x, y, {
      color: "#00e5ff",
      glyph: "∙∙",
      glyphColor: bright ? CYAN : DIM_CYAN,
    });
  },
});
