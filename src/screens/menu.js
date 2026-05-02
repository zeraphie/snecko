// menu.js — In-game menu screen
//
// Reachable from the start and dead screens via Esc. Items vary by
// context (begin/restart) plus shared options like custom seed. New
// menu items are added by extending Game.openMenu's items array and
// adding a label under LABELS.menu.

import { LABELS } from "../text/labels.js";

export const menuScreen = {
  draw(renderer, game) {
    renderer.clear();
    const lines = [LABELS.menu.title, ""];
    for (let i = 0; i < game._menuItems.length; i++) {
      const item = game._menuItems[i];
      const label = LABELS.menu[item.id] ?? item.id;
      const prefix = i === game._menuSelection ? "▶ " : "  ";
      lines.push(prefix + label);
    }
    lines.push("", LABELS.menu.hint);
    renderer.drawScreen("menu", lines);
    renderer.flush();
  },
};
