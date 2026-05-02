// bomb.js — Bomb consumable: targeting cursor + 3x3 blast radius

import { DEATH_BOMB } from "../../game/constants.js";

const BLAST_RADIUS = 1; // 3x3 area (1 cell in each direction from center)

/**
 * Enters bomb targeting mode, placing the cursor at the snake's head.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function enterTargeting(game) {
  game.state = "targeting";
  game._bombCursor = {
    x: game.snake.snakeX[game.snake.headIndex],
    y: game.snake.snakeY[game.snake.headIndex],
  };
}

/**
 * Moves the bomb targeting cursor by one cell, wrapping at edges.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} dx
 * @param {number} dy
 */
export function moveCursor(game, dx, dy) {
  if (game.state !== "targeting") {
    return;
  }
  let nx = game._bombCursor.x + dx;
  let ny = game._bombCursor.y + dy;
  if (nx < 0) {
    nx = game.grid.width - 1;
  } else if (nx >= game.grid.width) {
    nx = 0;
  }
  if (ny < 0) {
    ny = game.grid.height - 1;
  } else if (ny >= game.grid.height) {
    ny = 0;
  }
  game._bombCursor.x = nx;
  game._bombCursor.y = ny;
}

/**
 * Detonates the bomb at the cursor position, clearing walls in a 3x3 area.
 * Kills the snake if caught in the blast.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function confirmBomb(game) {
  if (game.state !== "targeting") {
    return;
  }

  const cx = game._bombCursor.x;
  const cy = game._bombCursor.y;
  const w = game.grid.width;
  const h = game.grid.height;
  let hitSnake = false;

  for (let dy = -BLAST_RADIUS; dy <= BLAST_RADIUS; dy++) {
    for (let dx = -BLAST_RADIUS; dx <= BLAST_RADIUS; dx++) {
      let bx = cx + dx;
      let by = cy + dy;
      // Wrap
      if (bx < 0) {
        bx += w;
      } else if (bx >= w) {
        bx -= w;
      }
      if (by < 0) {
        by += h;
      } else if (by >= h) {
        by -= h;
      }

      if (game.grid.isWallCell(bx, by)) {
        game.grid.clearCell("wall", bx, by);
      }
      if (game.grid.isSnakeCell(bx, by)) {
        hitSnake = true;
      }
    }
  }

  game._bombCursor = null;

  if (hitSnake) {
    game.snake.alive = false;
    game.snake.deathCause = DEATH_BOMB;
    game.state = "dead";
  } else {
    game.state = "playing";
    game.lastTickTime = Date.now();
  }
}

/**
 * Cancels bomb targeting, refunds the charge, and returns to playing.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function cancelBomb(game) {
  if (game.state !== "targeting") {
    return;
  }
  game._bombCursor = null;
  game.upgrades.addConsumable("bomb", 1); // refund charge
  game.state = "playing";
  game.lastTickTime = Date.now();
}

export { BLAST_RADIUS };
