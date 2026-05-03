// practiceHub.js — Practice mode hub
//
// Reachable from the menu's "Practice" item. Lets the player branch into
// one of four practice modes: mutation picker, boss picker, random boss,
// or boss rush.

import { LABELS } from "../text/labels.js";
import { PRACTICE_HUB_ITEMS } from "../core/game/practice.js";

export const practiceHubScreen = {
  draw(renderer, game) {
    renderer.clear();
    const lines = [LABELS.practiceHub.title, "", LABELS.practiceHub.subtitle, ""];
    for (let i = 0; i < PRACTICE_HUB_ITEMS.length; i++) {
      const item = PRACTICE_HUB_ITEMS[i];
      const label = LABELS.practiceHub.items[item.id] ?? item.id;
      const prefix = i === game._practiceHubSelection ? "▶ " : "  ";
      lines.push(prefix + label);
    }
    lines.push("", LABELS.practiceHub.hint);
    renderer.drawScreen("practice_hub", lines);
    renderer.flush();
  },
};
