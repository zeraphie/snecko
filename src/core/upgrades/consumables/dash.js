// dash.js — Dash consumable: move 2 tiles forward, eating walls

/**
 * Dashes the snake 2 tiles forward, clearing walls in its path.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function executeDash(game) {
  // Commit pending direction before dashing
  game.snake.dirX = game.snake.nextDirX;
  game.snake.dirY = game.snake.nextDirY;

  for (let i = 0; i < 2; i++) {
    if (game.state !== "playing") {
      break;
    }

    // Clear wall ahead (dash eats walls)
    const next = game._peekNextCell();
    if (game.board.isWallCell(next.x, next.y)) {
      game.board.clearCell("wall", next.x, next.y);
    }

    const result = game.snake.step(game.board);
    if (result === "food") {
      game._handleFoodEaten();
    } else if (result !== "ok") {
      game.state = "dead";
    }
  }
}
