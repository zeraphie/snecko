// contraband.js — Contraband pick screen (after boss victory)

export const contrabandScreen = {
  draw(renderer, game) {
    renderer.drawContrabandScreen(
      game._contrabandPool,
      game._contrabandSelection,
      game._contraband
    );
  },
};
