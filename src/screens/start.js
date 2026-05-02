// start.js — Start/title screen

import { LABELS } from "../text/labels.js";

export const startScreen = {
  draw(renderer, game) {
    renderer.clear();
    renderer.drawScreen("start", [
      LABELS.start.title,
      "",
      LABELS.start.controls,
      "",
      LABELS.start.begin,
    ]);
    renderer.flush();
  },
};
