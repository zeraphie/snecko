// iron-jaw.js — Iron Jaw bites upgrade: eat wall ahead, consume one bite charge

/**
 * Clears the wall ahead of the snake if the iron-jaw bites upgrade has charges.
 * Each wall eaten consumes one charge; the upgrade auto-removes when charges hit 0.
 * Called before each step.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function applyIronJaw(game) {
  if (!game.upgrades.hasBites("iron_jaw")) {
    return;
  }
  const next = game._peekNextCell();
  if (game.grid.isWallCell(next.x, next.y)) {
    game.grid.clearCell("wall", next.x, next.y);
    game.upgrades.useBites("iron_jaw");
  }
}
