// broodPlacement.js — Brood placement screen
//
// Renders the grid (empty for v1) + ghost-shape preview at the cursor
// + placement-specific HUD (active / next shape + controls). Step 4
// uses placeholder ghost visuals (blue solid head + soft fill body);
// proper kin cell types land in Step 5.

import {
  ghostCells,
  isPlacementValid,
  PLACEMENT_MODE_MINES,
} from "../core/generation/brood/placement.js";
import { SHAPES, SHAPE_IDS, shapeCells } from "../core/generation/brood/shapes.js";

function nextShapeId(placement) {
  if (placement.unplaced.length <= 1) {
    return null;
  }
  const idx = placement.unplaced.indexOf(placement.activeShapeId);
  return placement.unplaced[(idx + 1) % placement.unplaced.length];
}

function identityLabel(placement, shapeId) {
  if (!shapeId) {
    return null;
  }
  const id = placement.identities?.[shapeId];
  if (!id) {
    return shapeId.toUpperCase();
  }
  return `${id.name} the ${id.kind}`;
}

export const broodPlacementScreen = {
  draw(renderer, game) {
    renderer.clear();
    game._drawGrid();

    const p = game._broodPlacement;
    if (!p) {
      renderer.flush();
      return;
    }

    // Already-placed mines — drawn every frame so the player can see
    // their existing traps while lining up the next one. Same visual as
    // during play (drawn from `game.mechanic.mines`), just sourced from
    // the placement-in-progress list.
    for (const m of p.minesPlaced) {
      renderer.drawMineCell?.(m.x, m.y);
    }

    // Ghost preview overlay; tint flips red when the candidate
    // placement fails any of the four rules (kin) or the mine-drop
    // rules. Ghost is a single cell in mines mode.
    const valid = isPlacementValid(game);
    renderer.drawBroodPlacementOverlay(ghostCells(game), p.cursorX, p.cursorY, valid);

    // Placement-specific HUD. In kin mode: active + next kin label. In
    // mines mode: "Placing mine" + remaining counter, so the player
    // sees the phase shift immediately.
    if (p.mode === PLACEMENT_MODE_MINES) {
      const placed = p.minesPlaced.length;
      const total = placed + p.minesRemaining;
      renderer.drawBroodPlacementHud({
        activeLabel: "mine",
        nextLabel: p.minesRemaining > 1 ? "mine" : null,
        nextShapeCells: [],
        placedCount: placed,
        totalCount: total,
      });
    } else {
      const nextId = nextShapeId(p);
      const nextCells = nextId ? shapeCells(SHAPES[nextId], 0) : [];
      renderer.drawBroodPlacementHud({
        activeLabel: identityLabel(p, p.activeShapeId),
        nextLabel: identityLabel(p, nextId),
        nextShapeCells: nextCells,
        placedCount: p.placed.length,
        totalCount: SHAPE_IDS.length,
      });
    }

    // Reginald is rendered outside the play field, above the canvas
    // (D9) — the browser entry swaps him into the snecko-logo slot;
    // terminal stamps the sprite in the top-right corner via the
    // renderer-bound `drawReginald`.
    renderer.drawReginald(game);

    renderer.flush();
  },
};
