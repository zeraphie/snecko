// seedInput.js — Custom-seed input screen
//
// Hidden affordance reachable from the start screen via the backtick/tilde
// key. Lets the player type any string; on Enter the string is hashed
// (FNV-1a 32-bit) into runSeed for a reproducible "share this seed" run.

import { LABELS } from "../text/labels.js";

export const seedInputScreen = {
  draw(renderer, game) {
    renderer.clear();
    const buf = game._seedInput || "";
    renderer.drawScreen("seed_input", [
      LABELS.seedInput.title,
      "",
      LABELS.seedInput.prompt,
      "",
      "> " + buf + "_",
      "",
      LABELS.seedInput.hint,
    ]);
    renderer.flush();
  },
};
