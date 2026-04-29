// shared.js — Shared helpers used by multiple screens

/**
 * Draws the standard HUD bar. Used by playing, boss, targeting, and wormhole screens.
 *
 * @param {object} renderer
 * @param {object} game
 */
export function drawHUD(renderer, game) {
  renderer.drawHUD(
    game.score,
    game.boardIndex,
    game.runTime,
    game.level,
    game.foodEaten,
    game.foodRequired,
    game.upgrades.passives,
    game.upgrades.consumables,
    game._selectedConsumable
  );
}
