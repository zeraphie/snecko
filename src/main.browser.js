// main.browser.js — Browser entry point with game loop

import { Game } from "./core/game/index.js";
import { generateGrid, advanceGrid } from "./core/generation/index.js";
import { CanvasRenderer } from "./render/canvas/index.js";
import { setActiveRenderer } from "./render/active.js";
import { loadAssets, getLoaderDots } from "./core/loader.js";
import { KeyboardBrowserController } from "./input/KeyboardBrowserController.js";
import { ensureSeeded } from "./core/leaderboard/index.js";

// Seed the leaderboard with placeholder scores on first launch so the
// board isn't empty before the player has finished a run.
ensureSeeded();

const CELL_SIZE = 20;
const game = new Game();
game.generateGrid = generateGrid;
game.advanceGrid = advanceGrid;
const canvas = document.getElementById("game");
game.renderer = new CanvasRenderer(canvas, CELL_SIZE, Game.GRID_W, Game.GRID_H);
setActiveRenderer(game.renderer);

const controller = new KeyboardBrowserController();
controller.attach(game);

const logoEl = document.getElementById("logo");
let excitedTimer = 0;
let wasDead = false;

function loop() {
  const scoreBefore = game.score;
  game.tick();

  // Excited bounce on food eaten
  if (game.score > scoreBefore) {
    logoEl.classList.remove("excited");
    void logoEl.offsetWidth;
    logoEl.classList.add("excited");
    clearTimeout(excitedTimer);
    excitedTimer = setTimeout(() => logoEl.classList.remove("excited"), 700);
  }

  // Fall over on death, recover on restart
  const isDead = game.state === Game.STATE_DEAD;
  if (isDead && !wasDead) {
    logoEl.classList.remove("excited");
    logoEl.classList.add("dead");
  } else if (!isDead && wasDead) {
    logoEl.classList.remove("dead");
  }
  wasDead = isDead;

  game.renderFrame();
  requestAnimationFrame(loop);
}

// ── Loader → game transition ────────────────────────────────────────

(async function () {
  const loaderStart = Date.now();

  function loaderLoop() {
    const elapsed = Date.now() - loaderStart;
    const dots = getLoaderDots(elapsed);
    game.renderer.drawLoader(dots);
    requestAnimationFrame(loaderLoop);
  }

  // Start the loader animation while assets load
  const loaderRaf = requestAnimationFrame(loaderLoop);

  const readFile = async (path) => {
    const res = await fetch(path);
    return res.text();
  };
  game.manifest = await loadAssets(readFile);

  // Stop the loader, start the game
  cancelAnimationFrame(loaderRaf);
  game.renderFrame();
  requestAnimationFrame(loop);
})();
