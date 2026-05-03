// bossPicker.js — Boss picker (practice mode)
//
// Reachable from the practice hub's "Boss picker" item. Lists every boss
// by display name; confirming spawns that boss directly.

import { LABELS } from "../text/labels.js";
import { ALL_BOSS_DEFS } from "../core/boss/bosses/index.js";

export const bossPickerScreen = {
  draw(renderer, game) {
    renderer.clear();
    const lines = [LABELS.bossPicker.title, "", LABELS.bossPicker.subtitle, ""];
    for (let i = 0; i < ALL_BOSS_DEFS.length; i++) {
      const def = ALL_BOSS_DEFS[i];
      const name = LABELS.bosses[def.id]?.name ?? def.name ?? def.id;
      const prefix = i === game._bossPickerSelection ? "▶ " : "  ";
      lines.push(prefix + name);
    }
    lines.push("", LABELS.bossPicker.hint);
    renderer.drawScreen("boss_picker", lines);
    renderer.flush();
  },
};
