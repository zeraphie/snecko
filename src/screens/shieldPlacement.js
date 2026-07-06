// shieldPlacement.js — Shield-placement overlay (Step 13).
//
// Composes on top of the playing screen — the cull tick is paused
// while the cursor is open, but the world stays visible so the player
// can see which kin is at risk. Shows the cursor at its current
// position; if the cursor is over an alive, un-shielded kin, every
// cell of that kin highlights so the player knows their charge will
// cover the whole shape.

import { playingScreen } from "./playing.js";
import { shieldTargetKin } from "../core/upgrades/consumables/shield.js";

export const shieldPlacementScreen = {
  draw(renderer, game) {
    playingScreen.draw(renderer, game, { skipFlush: true });
    const cursor = game._shieldCursor;
    if (cursor) {
      const kin = shieldTargetKin(game);
      const highlightCells = kin ? kin.cells : [];
      renderer.drawShieldPlacementOverlay?.(
        cursor.x,
        cursor.y,
        highlightCells,
        game.grid.width,
        game.grid.height
      );
    }
    renderer.flush();
  },
};
