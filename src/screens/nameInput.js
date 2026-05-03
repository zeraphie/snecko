// nameInput.js — Post-run name entry, gates the leaderboard record.

import { LABELS } from "../text/labels.js";

export const nameInputScreen = {
  draw(renderer, game) {
    renderer.clear();
    const cause = game.snake.deathCause || "unknown";
    const lines = [
      LABELS.nameInput.title,
      "",
      `${LABELS.dead.cause}: ${cause}`,
      `${LABELS.hud.score}: ${game.score}`,
      `${LABELS.hud.act}: ${game.actIndex}`,
      `${LABELS.hud.time}: ${game.constructor.formatTime(game.runTime)}`,
      "",
      LABELS.nameInput.prompt,
      `> ${game._nameInput}_`,
      "",
      LABELS.nameInput.hint,
    ];
    renderer.drawScreen("name_input", lines);
    renderer.flush();
  },
};
