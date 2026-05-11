// main.terminal.js — Terminal entry point with game loop

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TerminalRenderer } from "./render/terminal/index.js";
import { setActiveRenderer } from "./render/active.js";
import { loadAssets, getLoaderDots } from "./core/loader.js";
import { KeyboardTerminalController } from "./input/KeyboardTerminalController.js";
import { Game } from "./core/game/index.js";
import { MUTATIONS, getMutationGenerator } from "./core/generation/registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ── Mode / world selection ────────────────────────────────────────
//
// process.argv[2]  mode  — play style
//   (empty)               default crystalline game
//   boss                  skip straight to boss arena every fight
//   <mutation>            any registered mutation (see MUTATIONS in
//                         core/generation/registry.js) — wildlands,
//                         catacombs, etc.
//
// process.argv[3]  world — boss biome override (only meaningful with mode=boss,
//                          but also respected when mode is a mutation)
//   (empty)               derive from mode
//   <mutation>            any registered mutation
//
// Examples
//   npm run play                    → crystalline game, The Anchor on trigger
//   npm run play boss               → boss arena, The Anchor
//   npm run play wildlands          → wildlands terrain, The Current Sovereign
//   npm run play catacombs          → catacombs maze, default boss
//   npm run play boss wildlands     → boss arena, The Current Sovereign
//
// Adding a new mutation: register it in MUTATIONS — that's it. No edits here.

const mode = process.argv[2] || "";
const worldArg = process.argv[3] || "";

const isMutationMode = mode in MUTATIONS;
// The effective mutation: explicit override first, then infer from play mode.
const effectiveWorld = worldArg || (isMutationMode ? mode : "");

// ── Generator setup ───────────────────────────────────────────────

const game = new Game();

const generators =
  getMutationGenerator(isMutationMode ? mode : "crystalline") ?? MUTATIONS.crystalline;
game.generateGrid = generators.generate;
game.advanceGrid = generators.advance;

// ── startRun patch ────────────────────────────────────────────────
//
// `confirm()` (and the start menu) explicitly reset `generateGrid`/`advanceGrid`
// back to the crystalline default *before* invoking `startRun()`, then
// `startRun()` calls the generator at the end. So if we want a dev-mode
// mutation to actually take effect on every fresh run, we have to:
//   1. Restore the dev-mode generator pair *before* the inner startRun runs
//      its generator (otherwise `confirm()`'s reset wins).
//   2. Restore the mutation string *after* `upgrades.reset()` flips it back
//      to crystalline.
//   3. Enter the boss arena immediately (boss mode only).

if (effectiveWorld || mode === "boss") {
  const _origStartRun = game.startRun.bind(game);
  game.startRun = function () {
    if (effectiveWorld) {
      const gen = getMutationGenerator(effectiveWorld);
      if (gen) {
        this.generateGrid = gen.generate;
        this.advanceGrid = gen.advance;
      }
    }
    _origStartRun();
    if (effectiveWorld) {
      this.upgrades.mutation = effectiveWorld;
    }
    if (mode === "boss") {
      this._enterBossFight();
    }
  };
}

// ── Renderer & screen init ────────────────────────────────────────

game.renderer = new TerminalRenderer(process.stdout, Game.GRID_W, Game.GRID_H);
setActiveRenderer(game.renderer);

// Clear screen; set terminal tab title for dev modes
process.stdout.write("\x1b[2J\x1b[H");
const titleParts = [mode, worldArg].filter(Boolean);
if (titleParts.length > 0) {
  process.stdout.write(`\x1b]0;snecko [${titleParts.join("/")}]\x07`);
}

const controller = new KeyboardTerminalController({
  onQuit: () => {
    game.renderer.destroy();
    process.exit();
  },
});
controller.attach(game);

// ── Loader → game loop ────────────────────────────────────────────

(async function () {
  const loaderStart = Date.now();
  const loaderInterval = setInterval(function () {
    const elapsed = Date.now() - loaderStart;
    const dots = getLoaderDots(elapsed);
    game.renderer.drawLoader(dots);
  }, 16);

  const readFile = async (path) => readFileSync(resolve(projectRoot, path), "utf-8");
  game.manifest = await loadAssets(readFile);

  clearInterval(loaderInterval);

  game.renderFrame();

  setInterval(function () {
    // Boss mode: whenever the game lands in STATE_PLAYING (e.g. after a boss
    // victory that didn't trigger a draft), restore the mutation and jump
    // straight back into the arena so there's no detour through normal boards.
    if (mode === "boss" && game.state === Game.STATE_PLAYING) {
      if (effectiveWorld) {
        game.upgrades.mutation = effectiveWorld;
      }
      game._enterBossFight();
    }
    game.tick();
    game.renderFrame();
  }, 16);
})();
