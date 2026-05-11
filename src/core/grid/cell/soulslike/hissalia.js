// soulslike/hissalia.js — One of the 4 cells of the 2×2 boss footprint.
//
// Same `CELL_HISSALIA` cell type is drawn at each of the 4 footprint
// cells; each invocation draws the FULL body+arms canvas pattern
// (centred on the boss centre) but clipped to its own cell so the
// quadrants fit together into a single creature silhouette.
//
// The screen layer passes `context.bossX` / `bossY` so each cell
// knows where the shared centre is. Terminal renders as a solid block
// per cell — no clipping there.

import { CELL_HISSALIA } from "../../../../render/renderer.js";
import { activeRenderer } from "../../../../render/active.js";
import { defineCell } from "../registry.js";
import { MAGENTA, WHITE } from "../../../../render/terminal/palette.js";
import { BOSS_PURPLE } from "../palette.js";

const EYE_COLOR = "#1a0a2a";

defineCell(CELL_HISSALIA, {
  render(x, y, context) {
    const staggered = !!context?.staggered;
    const color = staggered ? "#ffffff" : BOSS_PURPLE;
    const bossX = context?.bossX ?? x;
    const bossY = context?.bossY ?? y;
    const facing = context?.facing ?? { dx: 0, dy: 1 };
    activeRenderer.cell(x, y, {
      glyph: "██",
      glyphColor: staggered ? WHITE : MAGENTA,
      detailed: (ctx, px, py, cs) => {
        // Boss centre in pixel space — the meeting point of the 4
        // cells when (bossX, bossY) is the top-left of a 2×2.
        const bodyCx = (bossX - x) * cs + px + cs;
        const bodyCy = (bossY - y) * cs + py + cs;
        // Arms hang perpendicular to facing — when she turns to face
        // the player, the arms swing to her sides rather than always
        // pointing east/west.
        const perpX = -facing.dy;
        const perpY = facing.dx;

        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, cs, cs);
        ctx.clip();

        ctx.fillStyle = color;
        // Body — large central circle spanning ~60% of the 2×2 area.
        ctx.beginPath();
        ctx.arc(bodyCx, bodyCy, cs * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Arms — two smaller circles flanking the body perpendicular
        // to facing.
        ctx.beginPath();
        ctx.arc(bodyCx + perpX * cs * 0.75, bodyCy + perpY * cs * 0.75, cs * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bodyCx - perpX * cs * 0.75, bodyCy - perpY * cs * 0.75, cs * 0.28, 0, Math.PI * 2);
        ctx.fill();
        // Forward "eye" dot in the body so facing reads at a glance
        // (mirrors the fighter silhouette).
        ctx.fillStyle = EYE_COLOR;
        ctx.beginPath();
        ctx.arc(
          bodyCx + facing.dx * cs * 0.32,
          bodyCy + facing.dy * cs * 0.32,
          cs * 0.14,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.restore();
      },
    });
  },
});
