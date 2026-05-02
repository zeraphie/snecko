// dead.js — Game over screen

import { LABELS } from "../text/labels.js";

export const deadScreen = {
  draw(renderer, game) {
    renderer.clear();
    const cause = game.snake.deathCause || "unknown";
    renderer.drawScreen("dead", [
      LABELS.dead.title,
      "",
      `${LABELS.dead.cause}: ${cause}`,
      `${LABELS.hud.score}: ${game.score}`,
      `${LABELS.hud.act}: ${game.actIndex}`,
      `${LABELS.hud.time}: ${game.constructor.formatTime(game.runTime)}`,
      "",
      LABELS.dead.restart,
    ]);
    renderer.flush();
  },
};
