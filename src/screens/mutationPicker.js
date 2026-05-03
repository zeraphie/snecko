// mutationPicker.js — Mutation picker screen (practice mode).
//
// Reachable from the menu's "Mutation" item. Lets the player pick the
// starting mutation for the next run. Renders mutation cards in the
// same red-themed style as the draft screen's mutation slot.

import { MUTATIONS } from "../core/generation/registry.js";

export const mutationPickerScreen = {
  draw(renderer, game) {
    const ids = Object.keys(MUTATIONS);
    renderer.drawMutationPickerScreen(ids, game._mutationPickerSelection);
  },
};
