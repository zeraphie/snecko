// snake.test.js — tests for Snake ring-buffer, movement, growth, and direction handling

import { describe, it, expect, beforeEach } from "vitest";
import { Grid } from "../src/core/grid";
import { Snake } from "../src/core/snake";
import { DEATH_WALL } from "../src/core/game/constants.js";

describe("init", () => {
  let grid, snake;

  beforeEach(() => {
    grid = new Grid(21, 21);
    snake = new Snake();
  });

  it("places snake body in correct positions", () => {
    snake.init(grid, 10, 10, 3, 1, 0);
    // Body: (8,10), (9,10), (10,10)
    expect(grid.isSnakeCell(8, 10)).toBe(true);
    expect(grid.isSnakeCell(9, 10)).toBe(true);
    expect(grid.isSnakeCell(10, 10)).toBe(true);
    expect(grid.isSnakeCell(11, 10)).toBe(false);
  });

  it("sets direction and length", () => {
    snake.init(grid, 10, 10, 4, 0, -1);
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
  let grid, snake;

  beforeEach(() => {
    grid = new Grid(21, 21);
    snake = new Snake();
    snake.init(grid, 10, 10, 3, 1, 0);
  });

  it("returns 'ok' on normal step", () => {
    expect(snake.step(grid)).toBe("ok");
    expect(snake.snakeX[snake.headIndex]).toBe(11);
    expect(snake.snakeY[snake.headIndex]).toBe(10);
  });

  it("clears old tail on normal step", () => {
    // Tail is at (8,10)
    expect(grid.isSnakeCell(8, 10)).toBe(true);
    snake.step(grid);
    expect(grid.isSnakeCell(8, 10)).toBe(false);
  });

  it("wraps around right edge", () => {
    snake.init(grid, 20, 10, 3, 1, 0);
    expect(snake.step(grid)).toBe("ok");
    expect(snake.snakeX[snake.headIndex]).toBe(0);
    expect(snake.snakeY[snake.headIndex]).toBe(10);
    expect(snake.alive).toBe(true);
  });

  it("wraps around left edge", () => {
    snake.init(grid, 2, 10, 3, -1, 0);
    expect(snake.step(grid)).toBe("ok"); // head at (1,10)
    expect(snake.step(grid)).toBe("ok"); // head at (0,10)
    expect(snake.step(grid)).toBe("ok"); // wraps to (20,10)
    expect(snake.snakeX[snake.headIndex]).toBe(20);
  });

  it("wraps around top edge", () => {
    snake.init(grid, 10, 2, 3, 0, -1);
    snake.step(grid); // (10,1)
    snake.step(grid); // (10,0)
    expect(snake.step(grid)).toBe("ok"); // wraps to (10,20)
    expect(snake.snakeY[snake.headIndex]).toBe(20);
  });

  it("wraps around bottom edge", () => {
    snake.init(grid, 10, 20, 3, 0, 1);
    expect(snake.step(grid)).toBe("ok");
    expect(snake.snakeY[snake.headIndex]).toBe(0);
  });

  it("returns 'wall' on wall collision", () => {
    grid.setCell("wall", 11, 10);
    expect(snake.step(grid)).toBe("wall");
    expect(snake.alive).toBe(false);
    expect(snake.deathCause).toBe(DEATH_WALL);
  });

  it("returns 'self' on self collision", () => {
    snake.init(grid, 5, 5, 5, 1, 0);
    // Body: (1,5)(2,5)(3,5)(4,5)(5,5) heading right
    snake.step(grid); // (6,5)
    snake.setNextDirection(0, -1);
    snake.step(grid); // (6,4)
    snake.setNextDirection(-1, 0);
    snake.step(grid); // (5,4)
    snake.setNextDirection(0, 1);
    expect(snake.step(grid)).toBe("self"); // (5,5) still occupied
  });

  it("returns 'food' and sets growing flag", () => {
    grid.foodX = 11;
    grid.foodY = 10;
    expect(snake.step(grid)).toBe("food");
    expect(snake.growing).toBe(true);
    expect(grid.foodX).toBe(-1);
  });

  it("grows on the step after eating", () => {
    grid.foodX = 11;
    grid.foodY = 10;
    snake.step(grid); // eat food
    const len = snake.snakeLength;
    snake.step(grid); // grow
    expect(snake.snakeLength).toBe(len + 1);
    expect(snake.growing).toBe(false);
  });

  it("allows moving into vacating tail cell", () => {
    snake.init(grid, 3, 5, 4, 1, 0);
    // Body: (0,5)(1,5)(2,5)(3,5) heading right
    snake.setNextDirection(0, -1);
    snake.step(grid); // head (3,4), tail (1,5)
    snake.setNextDirection(-1, 0);
    snake.step(grid); // head (2,4), tail (2,5)
    snake.setNextDirection(0, 1);
    snake.step(grid); // head (2,5) — was old tail
    expect(snake.alive).toBe(true);
  });

  it("returns 'dead' if already dead", () => {
    snake.alive = false;
    expect(snake.step(grid)).toBe("dead");
  });
});
