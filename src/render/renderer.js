// renderer.js — Renderer interface documentation and shared constants
//
// Every renderer must implement:
//   clear()                          — prepare a fresh frame
//   drawCell(x, y, type)             — draw one grid cell; type is a CELL_* constant
//   drawSnakeHead(x, y, dx, dy)      — draw the snake head with direction indicator
//   drawHUD(score, length, board, time) — draw the heads-up display
//   drawScreen(name, lines)          — draw a full-screen overlay (name: 'start' | 'dead')
//   flush()                          — finalize the frame (no-op on canvas, writes buffer on terminal)

export const CELL_EMPTY = 0;
export const CELL_WALL = 1;
export const CELL_SNAKE = 2;
export const CELL_SNAKE_HEAD = 3;
export const CELL_FOOD = 4;
export const CELL_WALL_LOW = 5;
export const CELL_CURRENT_RIGHT = 6;
export const CELL_CURRENT_LEFT = 7;
export const CELL_CURRENT_DOWN = 8;
export const CELL_CURRENT_UP = 9;
export const CELL_TELEGRAPH = 10;
export const CELL_WORMHOLE_A = 11;
export const CELL_WORMHOLE_B = 12;
