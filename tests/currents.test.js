// currents.test.js — tests for river current generation and drift mechanics

import { describe, it, expect } from 'vitest';
import { Board } from '../src/core/board';
import { Snake } from '../src/core/snake';
import {
  initCurrents,
  advanceCurrents,
  applyCurrentDrift,
} from '../src/core/mechanics/currents.js';
import { TERRAIN_CURRENT, TERRAIN_NONE } from '../src/core/board/constants.js';

function makeGame(width = 21, height = 21) {
  const board = new Board(width, height);
  const snake = new Snake();
  snake.init(board, 10, 10, 3, 1, 0);
  return {
    board,
    snake,
    boardIndex: 1,
    mechanic: null,
  };
}

describe('initCurrents', () => {
  it('sets mechanic type to currents', () => {
    const game = makeGame();
    initCurrents(game);
    expect(game.mechanic.type).toBe('currents');
    expect(game.mechanic.phase).toBe(0);
  });

  it('generates river cells', () => {
    const game = makeGame();
    initCurrents(game);
    expect(game.mechanic.cells.length).toBeGreaterThan(0);
  });

  it('river cells have flow direction', () => {
    const game = makeGame();
    initCurrents(game);
    for (const cell of game.mechanic.cells) {
      expect(typeof cell.x).toBe('number');
      expect(typeof cell.y).toBe('number');
      expect(Math.abs(cell.flowDx) + Math.abs(cell.flowDy)).toBe(1);
    }
  });

  it('paints TERRAIN_CURRENT on river cells', () => {
    const game = makeGame();
    initCurrents(game);
    const w = game.board.width;
    for (const cell of game.mechanic.cells) {
      expect(game.board.terrain[cell.y * w + cell.x]).toBe(TERRAIN_CURRENT);
    }
  });

  it('does not place river on wall cells', () => {
    const game = makeGame();
    // Fill a row with walls
    for (let x = 0; x < game.board.width; x++) {
      game.board.setCell('wall', x, 5);
    }
    initCurrents(game);
    for (const cell of game.mechanic.cells) {
      expect(game.board.isWallCell(cell.x, cell.y)).toBe(false);
    }
  });

  it('does not place river on snake cells', () => {
    const game = makeGame();
    initCurrents(game);
    for (const cell of game.mechanic.cells) {
      expect(cell.x === 8 && cell.y === 10).toBe(false); // snake body
      expect(cell.x === 9 && cell.y === 10).toBe(false);
      expect(cell.x === 10 && cell.y === 10).toBe(false);
    }
  });
});

describe('advanceCurrents', () => {
  it('no-ops if mechanic is null', () => {
    const game = makeGame();
    advanceCurrents(game); // should not throw
  });

  it('no-ops if mechanic is not currents', () => {
    const game = makeGame();
    game.mechanic = { type: 'lattice' };
    advanceCurrents(game); // should not throw
  });

  it('cycles through phases: telegraph → flow → surge → back to telegraph', () => {
    const game = makeGame();
    initCurrents(game);
    expect(game.mechanic.phase).toBe(0); // telegraph

    advanceCurrents(game);
    expect(game.mechanic.phase).toBe(1); // flow

    advanceCurrents(game);
    expect(game.mechanic.phase).toBe(2); // surge

    advanceCurrents(game);
    // shift (3) immediately becomes telegraph (0) of new river
    expect(game.mechanic.phase).toBe(0); // telegraph again
  });

  it('widens river on surge phase', () => {
    const game = makeGame();
    initCurrents(game);
    const cellsBefore = game.mechanic.cells.length;

    advanceCurrents(game); // flow
    advanceCurrents(game); // surge — widens

    expect(game.mechanic.cells.length).toBeGreaterThanOrEqual(cellsBefore);
  });

  it('generates new river on shift phase', () => {
    const game = makeGame();
    initCurrents(game);
    advanceCurrents(game); // flow
    advanceCurrents(game); // surge
    advanceCurrents(game); // shift → telegraph of new river

    // New river generated — cells should exist
    expect(game.mechanic.cells.length).toBeGreaterThan(0);
  });

  it('resets contactApplied on advance', () => {
    const game = makeGame();
    initCurrents(game);
    game.mechanic.contactApplied = true;
    advanceCurrents(game);
    expect(game.mechanic.contactApplied).toBe(false);
  });

  it('clears old terrain before repainting', () => {
    const game = makeGame();
    initCurrents(game);
    const w = game.board.width;

    // Note a cell from current river
    const oldCell = game.mechanic.cells[0];
    const oldIdx = oldCell.y * w + oldCell.x;

    // Advance through full cycle to get new river
    advanceCurrents(game); // flow
    advanceCurrents(game); // surge
    advanceCurrents(game); // shift → new telegraph

    // Old cell should not have TERRAIN_CURRENT unless new river happens to overlap
    const newCellSet = new Set(game.mechanic.cells.map((c) => c.y * w + c.x));
    if (!newCellSet.has(oldIdx)) {
      expect(game.board.terrain[oldIdx]).toBe(TERRAIN_NONE);
    }
  });
});

describe('applyCurrentDrift', () => {
  function makeFlowGame() {
    const game = makeGame();
    // Manually set up a controlled current mechanic
    game.mechanic = {
      type: 'currents',
      phase: 1, // FLOW
      cells: [{ x: 11, y: 10, flowDx: 1, flowDy: 0 }],
      contactApplied: false,
    };
    return game;
  }

  it('no-ops if mechanic is null', () => {
    const game = makeGame();
    const hx = game.snake.snakeX[game.snake.headIndex];
    applyCurrentDrift(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(hx);
  });

  it('no-ops if not in flow or surge phase', () => {
    const game = makeGame();
    game.mechanic = {
      type: 'currents',
      phase: 0, // telegraph — no drift
      cells: [{ x: 11, y: 10, flowDx: 1, flowDy: 0 }],
      contactApplied: false,
    };
    // Move snake head to (11,10)
    game.snake.step(game.board);
    const hx = game.snake.snakeX[game.snake.headIndex];
    expect(hx).toBe(11);

    applyCurrentDrift(game);
    // No drift applied
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(11);
  });

  it('applies drift when head is on current cell in flow phase', () => {
    const game = makeFlowGame();
    // Move snake head to (11,10) — the current cell
    game.snake.step(game.board);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(11);

    applyCurrentDrift(game);
    // Drift pushes head right by 1
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(12);
  });

  it('applies 2 drift steps in surge phase', () => {
    const game = makeFlowGame();
    game.mechanic.phase = 2; // surge
    // Move snake to (11,10)
    game.snake.step(game.board);

    applyCurrentDrift(game);
    // Drift pushes head right by 2
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(13);
  });

  it('sets contactApplied flag after drift', () => {
    const game = makeFlowGame();
    game.snake.step(game.board);

    applyCurrentDrift(game);
    expect(game.mechanic.contactApplied).toBe(true);
  });

  it('does not apply drift twice while contactApplied is true', () => {
    const game = makeFlowGame();
    game.snake.step(game.board);

    applyCurrentDrift(game);
    const hx = game.snake.snakeX[game.snake.headIndex];

    applyCurrentDrift(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(hx);
  });

  it('resets contactApplied when head leaves current cells', () => {
    const game = makeFlowGame();
    game.snake.step(game.board); // head at (11,10)

    applyCurrentDrift(game); // drift to (12,10), contactApplied = true

    // Now step again — head moves to (13,10), not a current cell
    game.snake.step(game.board);
    applyCurrentDrift(game);
    // contactApplied should be reset since head is not on a current cell
    expect(game.mechanic.contactApplied).toBe(false);
  });

  it('absorbs drift into wall (no death)', () => {
    const game = makeFlowGame();
    // Place wall at (12,10) — where drift would push
    game.board.setCell('wall', 12, 10);

    game.snake.step(game.board); // head at (11,10)
    applyCurrentDrift(game);

    // Head should stay at (11,10) — drift absorbed
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(11);
    expect(game.snake.alive).toBe(true);
  });

  it('absorbs drift into snake body (no death)', () => {
    const game = makeFlowGame();
    // Place snake body at (12,10)
    game.board.setCell('snake', 12, 10);

    game.snake.step(game.board); // head at (11,10)
    applyCurrentDrift(game);

    // Head should stay at (11,10) — drift absorbed
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(11);
    expect(game.snake.alive).toBe(true);
  });

  it('wraps drift around board edges', () => {
    const game = makeGame();
    game.mechanic = {
      type: 'currents',
      phase: 1,
      cells: [{ x: 20, y: 10, flowDx: 1, flowDy: 0 }],
      contactApplied: false,
    };
    // Position snake at right edge heading right
    game.snake.init(game.board, 19, 10, 3, 1, 0);
    game.snake.step(game.board); // head at (20,10)

    applyCurrentDrift(game);
    // Drift should wrap to x=0
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(0);
  });

  it('partial surge — absorbs second step if blocked', () => {
    const game = makeFlowGame();
    game.mechanic.phase = 2; // surge (2 drift steps)
    // Place wall at (13,10) — blocks second drift step
    game.board.setCell('wall', 13, 10);

    game.snake.step(game.board); // head at (11,10)
    applyCurrentDrift(game);

    // First drift to (12,10) succeeds, second to (13,10) blocked by wall
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(12);
    expect(game.snake.alive).toBe(true);
  });

  it('does not drift when head is not on current cell', () => {
    const game = makeFlowGame();
    // Current cell is at (11,10), snake head starts at (10,10)
    // Don't step — head is not on current cell
    const hx = game.snake.snakeX[game.snake.headIndex];

    applyCurrentDrift(game);
    expect(game.snake.snakeX[game.snake.headIndex]).toBe(hx);
  });
});
