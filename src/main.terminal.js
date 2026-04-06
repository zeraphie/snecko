// main.terminal.js — Terminal entry point with game loop

import readline from "node:readline";
import { TerminalRenderer } from "./render/terminal.js";
import { Game } from "./core/game/index.js";
import { generateBoard, advanceBoard } from "./core/generation/index.js";

const game = new Game();
game.generateBoard = generateBoard;
game.advanceBoard = advanceBoard;
game.renderer = new TerminalRenderer(process.stdout, Game.BOARD_W, Game.BOARD_H);

// Clear screen on start
process.stdout.write("\x1b[2J\x1b[H");

// Raw mode for keypress input
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();

process.stdin.on("keypress", function (ch, key) {
  if (!key) return;

  if (key.ctrl && key.name === "c") {
    game.renderer.destroy();
    process.exit();
  }

  if (key.name === "q") {
    game.renderer.destroy();
    process.exit();
  }

  if (game.state === Game.STATE_DRAFT) {
    switch (key.name) {
      case "up":
      case "w":
        game.selectDraft(Math.max(0, game._draftSelection - 1));
        break;
      case "down":
      case "s":
        game.selectDraft(game._draftSelection + 1);
        break;
      case "left":
      case "right":
      case "a":
      case "d":
        game.toggleMutation();
        break;
      case "return":
      case "space":
        game.confirmDraft();
        break;
      default:
        if (ch === "1") game.selectDraft(0);
        else if (ch === "2") game.selectDraft(1);
        else if (ch === "3") game.selectDraft(2);
        else if (ch === "4") game.toggleMutation();
        break;
    }
    return;
  }

  switch (key.name) {
    case "escape":
      if (game.state === Game.STATE_TARGETING) {
        game.cancelTargeting();
      }
      break;
    case "return":
      game.confirm();
      break;
    case "space":
      if (game.state === Game.STATE_PLAYING) {
        game.useConsumable();
      } else {
        game.confirm();
      }
      break;
    case "tab":
      game.cycleConsumable();
      break;
    case "up":
    case "w":
      game.onInput(0, -1);
      break;
    case "down":
    case "s":
      game.onInput(0, 1);
      break;
    case "left":
    case "a":
      game.onInput(-1, 0);
      break;
    case "right":
    case "d":
      game.onInput(1, 0);
      break;
  }
});

game.renderFrame();

setInterval(function () {
  game.tick();
  game.renderFrame();
}, 16);
