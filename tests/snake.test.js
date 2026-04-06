import { describe, it, expect, beforeEach } from "vitest";
import { Board } from "../src/core/board";
import { Snake } from "../src/core/snake";

describe("init", () => {
  let board, snake;

  beforeEach(() => {
    board = new Board(21, 21);
    snake = new Snake();
  });

  it("places snake body in correct positions", () => {
    snake.init(board, 10, 10, 3, 1, 0);
    // Body: (8,10), (9,10), (10,10)
    expect(board.isSnakeCell(8, 10)).toBe(true);
    expect(board.isSnakeCell(9, 10)).toBe(true);
    expect(board.isSnakeCell(10, 10)).toBe(true);
    expect(board.isSnakeCell(11, 10)).toBe(false);
  });

  it("sets direction and length", () => {
    snake.init(board, 10, 10, 4, 0, -1);
    expect(snake.snakeLength).toBe(4);
    expect(snake.dirX).toBe(0);
    expect(snake.dirY).toBe(-1);
    expect(snake.alive).toBe(true);
  });
});

describe("setNextDirection", () => {
  it("accepts valid turns", () => {
    const snake = new Snake();
    snake.dirX = 1;
    snake.dirY = 0;
    snake.setNextDirection(0, -1);
    expect(snake.nextDirX).toBe(0);
    expect(snake.nextDirY).toBe(-1);
  });

  it("rejects 180-degree reversal", () => {
    const snake = new Snake();
    snake.dirX = 1;
    snake.dirY = 0;
    snake.nextDirX = 1;
    snake.nextDirY = 0;
    snake.setNextDirection(-1, 0);
    expect(snake.nextDirX).toBe(1);
  });

  it("rejects zero direction", () => {
    const snake = new Snake();
    snake.dirX = 1;
    snake.dirY = 0;
    snake.nextDirX = 1;
    snake.nextDirY = 0;
    snake.setNextDirection(0, 0);
    expect(snake.nextDirX).toBe(1);
  });
});

describe("step", () => {
  let board, snake;

  beforeEach(() => {
    board = new Board(21, 21);
    snake = new Snake();
    snake.init(board, 10, 10, 3, 1, 0);
  });

  it("returns 'ok' on normal step", () => {
    expect(snake.step(board)).toBe("ok");
    expect(snake.snakeX[snake.headIndex]).toBe(11);
    expect(snake.snakeY[snake.headIndex]).toBe(10);
  });

  it("clears old tail on normal step", () => {
    // Tail is at (8,10)
    expect(board.isSnakeCell(8, 10)).toBe(true);
    snake.step(board);
    expect(board.isSnakeCell(8, 10)).toBe(false);
  });

  it("wraps around right edge", () => {
    snake.init(board, 20, 10, 3, 1, 0);
    expect(snake.step(board)).toBe("ok");
    expect(snake.snakeX[snake.headIndex]).toBe(0);
    expect(snake.snakeY[snake.headIndex]).toBe(10);
    expect(snake.alive).toBe(true);
  });

  it("wraps around left edge", () => {
    snake.init(board, 2, 10, 3, -1, 0);
    expect(snake.step(board)).toBe("ok"); // head at (1,10)
    expect(snake.step(board)).toBe("ok"); // head at (0,10)
    expect(snake.step(board)).toBe("ok"); // wraps to (20,10)
    expect(snake.snakeX[snake.headIndex]).toBe(20);
  });

  it("wraps around top edge", () => {
    snake.init(board, 10, 2, 3, 0, -1);
    snake.step(board); // (10,1)
    snake.step(board); // (10,0)
    expect(snake.step(board)).toBe("ok"); // wraps to (10,20)
    expect(snake.snakeY[snake.headIndex]).toBe(20);
  });

  it("wraps around bottom edge", () => {
    snake.init(board, 10, 20, 3, 0, 1);
    expect(snake.step(board)).toBe("ok");
    expect(snake.snakeY[snake.headIndex]).toBe(0);
  });

  it("returns 'wall' on wall collision", () => {
    board.setCell("wall", 11, 10);
    expect(snake.step(board)).toBe("wall");
    expect(snake.alive).toBe(false);
    expect(snake.deathCause).toBe("wall");
  });

  it("returns 'self' on self collision", () => {
    snake.init(board, 5, 5, 5, 1, 0);
    // Body: (1,5)(2,5)(3,5)(4,5)(5,5) heading right
    snake.step(board); // (6,5)
    snake.setNextDirection(0, -1);
    snake.step(board); // (6,4)
    snake.setNextDirection(-1, 0);
    snake.step(board); // (5,4)
    snake.setNextDirection(0, 1);
    expect(snake.step(board)).toBe("self"); // (5,5) still occupied
  });

  it("returns 'food' and sets growing flag", () => {
    board.foodX = 11;
    board.foodY = 10;
    expect(snake.step(board)).toBe("food");
    expect(snake.growing).toBe(true);
    expect(board.foodX).toBe(-1);
  });

  it("grows on the step after eating", () => {
    board.foodX = 11;
    board.foodY = 10;
    snake.step(board); // eat food
    const len = snake.snakeLength;
    snake.step(board); // grow
    expect(snake.snakeLength).toBe(len + 1);
    expect(snake.growing).toBe(false);
  });

  it("allows moving into vacating tail cell", () => {
    snake.init(board, 3, 5, 4, 1, 0);
    // Body: (0,5)(1,5)(2,5)(3,5) heading right
    snake.setNextDirection(0, -1);
    snake.step(board); // head (3,4), tail (1,5)
    snake.setNextDirection(-1, 0);
    snake.step(board); // head (2,4), tail (2,5)
    snake.setNextDirection(0, 1);
    snake.step(board); // head (2,5) — was old tail
    expect(snake.alive).toBe(true);
  });

  it("returns 'dead' if already dead", () => {
    snake.alive = false;
    expect(snake.step(board)).toBe("dead");
  });
});
