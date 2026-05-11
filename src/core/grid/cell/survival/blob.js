// survival/blob.js — CELL_BLOB: catacombs-survival chasing blob (2×2 entity).
//
// Same purple as the bullet-hell boss family — the survival blob is
// thematically a fragment of the boss, not a snake-coloured creature,
// so it shares BOSS_PURPLE with `boss/body.js` and `boss/hit.js`.

import { CELL_BLOB } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { MAGENTA } from "../../../../render/terminal/palette.js";
import { BOSS_PURPLE } from "../palette.js";

defineCell(CELL_BLOB, {
  render(x, y) {
    activeRenderer.cell(x, y, {
      color: BOSS_PURPLE,
      glyph: "██",
      glyphColor: MAGENTA,
    });
  },
});
