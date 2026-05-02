// wormhole.js — Wormhole portal placement overlay (composes on top of playing screen)

import { playingScreen } from "./playing.js";

export const wormholeScreen = {
  draw(renderer, game) {
    playingScreen.draw(renderer, game, { skipFlush: true });
    if (game._wormholeCursor) {
      renderer.drawWormholeOverlay(
        game._wormholeCursor.x,
        game._wormholeCursor.y,
        game._wormholePhase,
        game._wormholeA,
        game.grid.width,
        game.grid.height
      );
    }
    renderer.flush();
  },
};
