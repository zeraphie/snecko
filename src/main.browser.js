// main.browser.js — Browser entry point with game loop

import { Game } from './core/game/index.js';
import { generateBoard, advanceBoard } from './core/generation/index.js';
import { CanvasRenderer } from './render/canvas.js';

const CELL_SIZE = 20;
const game = new Game();
game.generateBoard = generateBoard;
game.advanceBoard = advanceBoard;
const canvas = document.getElementById('game');
game.renderer = new CanvasRenderer(canvas, CELL_SIZE, Game.BOARD_W, Game.BOARD_H);

document.addEventListener('keydown', function (e) {
  if (game.state === Game.STATE_DRAFT) {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        game.selectDraft(Math.max(0, game._draftSelection - 1));
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        game.selectDraft(game._draftSelection + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'a':
      case 'A':
      case 'd':
      case 'D':
        game.toggleMutation();
        break;
      case '1':
        game.selectDraft(0);
        break;
      case '2':
        game.selectDraft(1);
        break;
      case '3':
        game.selectDraft(2);
        break;
      case '4':
        game.toggleMutation();
        break;
      case 'Enter':
      case ' ':
        game.confirmDraft();
        break;
    }
    return;
  }

  switch (e.key) {
    case 'Escape':
      if (game.state === Game.STATE_TARGETING) {
        game.cancelTargeting();
      }
      break;
    case 'Enter':
      game.confirm();
      break;
    case ' ':
      if (game.state === Game.STATE_PLAYING) {
        game.useConsumable();
      } else {
        game.confirm();
      }
      break;
    case 'Tab':
      e.preventDefault();
      game.cycleConsumable();
      break;
    case 'ArrowUp':
    case 'w':
    case 'W':
      game.onInput(0, -1);
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      game.onInput(0, 1);
      break;
    case 'ArrowLeft':
    case 'a':
    case 'A':
      game.onInput(-1, 0);
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      game.onInput(1, 0);
      break;
  }
});

const logoEl = document.getElementById('logo');
let excitedTimer = 0;
let wasDead = false;

function loop() {
  const scoreBefore = game.score;
  game.tick();

  // Excited bounce on food eaten
  if (game.score > scoreBefore) {
    logoEl.classList.remove('excited');
    void logoEl.offsetWidth;
    logoEl.classList.add('excited');
    clearTimeout(excitedTimer);
    excitedTimer = setTimeout(() => logoEl.classList.remove('excited'), 700);
  }

  // Fall over on death, recover on restart
  const isDead = game.state === Game.STATE_DEAD;
  if (isDead && !wasDead) {
    logoEl.classList.remove('excited');
    logoEl.classList.add('dead');
  } else if (!isDead && wasDead) {
    logoEl.classList.remove('dead');
  }
  wasDead = isDead;

  game.renderFrame();
  requestAnimationFrame(loop);
}

game.renderFrame();
requestAnimationFrame(loop);
