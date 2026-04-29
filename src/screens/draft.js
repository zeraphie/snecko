// draft.js — Upgrade draft selection screen

export const draftScreen = {
  draw(renderer, game) {
    renderer.drawDraftScreen(
      game._draftPool.choices,
      game._draftPool.mutation,
      game._draftSelection,
      game._draftMutationAccepted
    );
  },
};
