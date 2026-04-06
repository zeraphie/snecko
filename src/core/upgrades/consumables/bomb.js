// bomb.js — Bomb consumable: targeting cursor + 3x3 blast radius

const BLAST_RADIUS = 1; // 3x3 area (1 cell in each direction from center)

export function enterTargeting(game) {
  game.state = "targeting";
  game._bombCursor = {
    x: game.snake.snakeX[game.snake.headIndex],
    y: game.snake.snakeY[game.snake.headIndex],
  };
}

export function moveCursor(game, dx, dy) {
  if (game.state !== "targeting") return;
  let nx = game._bombCursor.x + dx;
  let ny = game._bombCursor.y + dy;
  if (nx < 0) nx = game.board.width - 1;
  else if (nx >= game.board.width) nx = 0;
  if (ny < 0) ny = game.board.height - 1;
  else if (ny >= game.board.height) ny = 0;
  game._bombCursor.x = nx;
  game._bombCursor.y = ny;
}

export function confirmBomb(game) {
  if (game.state !== "targeting") return;

  const cx = game._bombCursor.x;
  const cy = game._bombCursor.y;
  const w = game.board.width;
  const h = game.board.height;
  let hitSnake = false;

  for (let dy = -BLAST_RADIUS; dy <= BLAST_RADIUS; dy++) {
    for (let dx = -BLAST_RADIUS; dx <= BLAST_RADIUS; dx++) {
      let bx = cx + dx;
      let by = cy + dy;
      // Wrap
      if (bx < 0) bx += w;
      else if (bx >= w) bx -= w;
      if (by < 0) by += h;
      else if (by >= h) by -= h;

      if (game.board.isWallCell(bx, by)) {
        game.board.clearCell("wall", bx, by);
      }
      if (game.board.isSnakeCell(bx, by)) {
        hitSnake = true;
      }
    }
  }

  game._bombCursor = null;

  if (hitSnake) {
    game.snake.alive = false;
    game.snake.deathCause = "bomb";
    game.state = "dead";
  } else {
    game.state = "playing";
    game.lastTickTime = Date.now();
  }
}

export function cancelBomb(game) {
  if (game.state !== "targeting") return;
  game._bombCursor = null;
  game.upgrades.addConsumable("bomb", 1); // refund charge
  game.state = "playing";
  game.lastTickTime = Date.now();
}

export { BLAST_RADIUS };
