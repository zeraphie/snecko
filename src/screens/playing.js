// playing.js — Main gameplay screen (board + HUD)

import { drawHUD } from "./shared.js";

export const playingScreen = {
  /**
   * @param {object} renderer
   * @param {object} game
   * @param {{ skipFlush?: boolean }} [opts]
   */
  draw(renderer, game, opts) {
    renderer.clear();
    game._drawBoard();
    drawHUD(renderer, game);
    if (!opts?.skipFlush) {
      renderer.flush();
    }
  },
};
