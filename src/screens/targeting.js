// targeting.js — Bomb targeting overlay (composes on top of playing screen)

import { playingScreen } from "./playing.js";

export const targetingScreen = {
  draw(renderer, game) {
    playingScreen.draw(renderer, game, { skipFlush: true });
    if (game._bombCursor) {
      renderer.drawTargetingOverlay(
        game._bombCursor.x,
        game._bombCursor.y,
        game.grid.width,
        game.grid.height
      );
    }
    renderer.flush();
  },
};
