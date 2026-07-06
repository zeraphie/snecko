// main.browser.js — Browser entry point with game loop

import { Game } from "./core/game/index.js";
import { generateGrid, advanceGrid } from "./core/generation/index.js";
import { CanvasRenderer } from "./render/canvas/index.js";
import { setActiveRenderer } from "./render/active.js";
import { loadAssets, getLoaderDots } from "./core/loader.js";
import { KeyboardBrowserController } from "./input/KeyboardBrowserController.js";
import { ensureSeeded } from "./core/leaderboard/index.js";
import { paintReginald, paintReginaldBubble } from "./render/canvas/reginald.js";

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
const reginaldEl = /** @type {HTMLCanvasElement} */ (document.getElementById("reginald-panel"));
const reginaldCtx = reginaldEl?.getContext("2d") ?? null;
const REGINALD_PX = 4; // px per source pixel — 24×24 sprite → 96×96 silhouette
let excitedTimer = 0;
let wasDead = false;
// Cache the last-painted (pose, bubble-text, bubble-category) so we
// only redraw the Reginald panel when something visibly changes.
let reginaldDrawnPose = null;
let bubbleDrawnText = null;
let bubbleDrawnCategory = null;
// setTimeout handle that removes the `.excited` class from the Reginald
// panel after his speaking bob finishes (0.6 s animation + slack).
let reginaldExcitedTimer = 0;

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

  // Brood mutation: swap the snecko logo for the Reginald panel
  // (D9 — predator perches above the playfield, outside the grid).
  // Sprite + speech bubble share one canvas so a bubble appearing
  // never reflows the surrounding layout.
  const isBrood = game.upgrades.mutation === "brood";
  document.body.classList.toggle("state-brood", isBrood);
  if (isBrood && reginaldCtx) {
    const animData = game.manifest?.animations?.reginald?.canvas;
    const pose = game.mechanic?.type === "cull" ? game.mechanic.state : "idle";
    const activeLine = game.mechanic?.activeLine ?? null;
    const lineText = activeLine?.text ?? null;
    const lineCategory = activeLine?.category ?? null;
    // Speaking bob — triggered when a NEW non-pity line arrives. Reuses
    // the same `.excited` CSS animation as the snecko logo does on food
    // eaten. Restart the class (with a reflow trick) so consecutive
    // lines each get their own hop cycle even if the class is still on.
    if (lineText && lineText !== bubbleDrawnText && lineCategory !== "pity") {
      reginaldEl.classList.remove("excited");
      void reginaldEl.offsetWidth;
      reginaldEl.classList.add("excited");
      clearTimeout(reginaldExcitedTimer);
      reginaldExcitedTimer = setTimeout(() => reginaldEl.classList.remove("excited"), 700);
    }
    const changed =
      pose !== reginaldDrawnPose ||
      lineText !== bubbleDrawnText ||
      lineCategory !== bubbleDrawnCategory;
    if (animData && changed) {
      reginaldCtx.clearRect(0, 0, reginaldEl.width, reginaldEl.height);
      const sprite = paintReginald(reginaldCtx, animData, pose, REGINALD_PX);
      if (activeLine) {
        paintReginaldBubble(reginaldCtx, activeLine, sprite);
      }
      reginaldDrawnPose = pose;
      bubbleDrawnText = lineText;
      bubbleDrawnCategory = lineCategory;
    }
  } else {
    reginaldDrawnPose = null;
    bubbleDrawnText = null;
    bubbleDrawnCategory = null;
    reginaldEl?.classList.remove("excited");
    clearTimeout(reginaldExcitedTimer);
  }

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
