// iron-jaw.js — Iron Jaw passive: eat wall ahead before stepping

export function applyIronJaw(game) {
  if (!game.upgrades.hasPassive("iron_jaw")) return;
  const next = game._peekNextCell();
  if (game.board.isWallCell(next.x, next.y)) {
    game.board.clearCell("wall", next.x, next.y);
  }
}
