// bossRushComplete.js — Boss rush completion splash
//
// Shown after the player defeats every boss in a rush. Enter or Esc
// returns to the practice hub.

import { LABELS } from "../text/labels.js";

export const bossRushCompleteScreen = {
  draw(renderer, _game) {
    renderer.clear();
    const lines = [
      LABELS.bossRushComplete.title,
      "",
      LABELS.bossRushComplete.subtitle,
      "",
      LABELS.bossRushComplete.hint,
    ];
    renderer.drawScreen("boss_rush_complete", lines);
    renderer.flush();
  },
};
