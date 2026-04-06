// wormhole.js — Wormhole consumable: place two portals, teleport between them

export function enterWormholePlacement(game) {
  game.state = "wormhole";
  game._wormholePhase = 1;
  game._wormholeCursor = {
    x: game.snake.snakeX[game.snake.headIndex],
    y: game.snake.snakeY[game.snake.headIndex],
  };
}

export function moveWormholeCursor(game, dx, dy) {
  if (game.state !== "wormhole") return;
  let nx = game._wormholeCursor.x + dx;
  let ny = game._wormholeCursor.y + dy;
  if (nx < 0) nx = game.board.width - 1;
  else if (nx >= game.board.width) nx = 0;
  if (ny < 0) ny = game.board.height - 1;
  else if (ny >= game.board.height) ny = 0;
  game._wormholeCursor.x = nx;
  game._wormholeCursor.y = ny;
}

export function isValidPortalCell(game, x, y) {
  if (game.board.isWallCell(x, y)) return false;
  if (game.board.isSnakeCell(x, y)) return false;
  if (x === game.board.foodX && y === game.board.foodY) return false;
  return true;
}

export function confirmWormholePlacement(game) {
  if (game.state !== "wormhole") return;
  const cx = game._wormholeCursor.x;
  const cy = game._wormholeCursor.y;

  if (!isValidPortalCell(game, cx, cy)) return;

  if (game._wormholePhase === 1) {
    // Can't place on existing portal A (shouldn't happen in phase 1, but guard)
    game._wormholeA = { x: cx, y: cy };
    game._wormholePhase = 2;
  } else {
    // Can't place B on same cell as A
    if (cx === game._wormholeA.x && cy === game._wormholeA.y) return;
    game._wormholeB = { x: cx, y: cy };
    game._wormholeCursor = null;
    game._wormholePhase = 0;
    game.state = "playing";
    game.lastTickTime = Date.now();
  }
}

export function cancelWormhole(game) {
  if (game.state !== "wormhole") return;
  game._wormholeCursor = null;
  game._wormholePhase = 0;
  game._wormholeA = null;
  game._wormholeB = null;
  game.upgrades.addConsumable("wormhole", 1); // refund charge
  game.state = "playing";
  game.lastTickTime = Date.now();
}

export function applyWormholeTeleport(game) {
  if (!game._wormholeA || !game._wormholeB) return;
  const hx = game.snake.snakeX[game.snake.headIndex];
  const hy = game.snake.snakeY[game.snake.headIndex];

  let destX = null;
  let destY = null;

  if (hx === game._wormholeA.x && hy === game._wormholeA.y) {
    destX = game._wormholeB.x;
    destY = game._wormholeB.y;
  } else if (hx === game._wormholeB.x && hy === game._wormholeB.y) {
    destX = game._wormholeA.x;
    destY = game._wormholeA.y;
  }

  if (destX === null) return;

  // Move the head to the destination
  game.board.clearCell("snake", hx, hy);
  game.snake.snakeX[game.snake.headIndex] = destX;
  game.snake.snakeY[game.snake.headIndex] = destY;
  game.board.setCell("snake", destX, destY);
}
