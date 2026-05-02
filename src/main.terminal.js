// main.terminal.js — Terminal entry point with game loop

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TerminalRenderer } from "./render/terminal/index.js";
import { loadAssets, getLoaderDots } from "./core/loader.js";
import { KeyboardTerminalController } from "./input/KeyboardTerminalController.js";
import { Game } from "./core/game/index.js";
import { generateGrid, advanceGrid } from "./core/generation/index.js";
import {
  generateWildlandsGrid,
  advanceWildlandsGrid,
} from "./core/generation/wildlands/generator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ── Mode / world selection ────────────────────────────────────────
//
// process.argv[2]  mode  — play style
//   (empty)               normal crystalline game
//   boss                  skip straight to boss arena every fight
//   wildlands             wildlands terrain + currents
//
// process.argv[3]  world — boss biome override (only meaningful with mode=boss,
//                          but also respected in wildlands mode for consistency)
//   (empty)               derive from mode (wildlands → wildlands boss)
//   wildlands             The Current Sovereign
//   crystalline           The Anchor  (explicit; same as default)
//
// Examples
//   just play                   → crystalline game, The Anchor on trigger
//   just play boss              → boss arena, The Anchor (crystalline)
//   just play wildlands         → wildlands terrain, The Current Sovereign
//   just play boss wildlands    → boss arena, The Current Sovereign

const mode = process.argv[2] || "";
const worldArg = process.argv[3] || "";

// The effective mutation: explicit override first, then infer from play mode.
const effectiveWorld = worldArg || (mode === "wildlands" ? "wildlands" : "");

// ── Generator setup ───────────────────────────────────────────────

const game = new Game();

if (mode === "wildlands") {
  game.generateGrid = generateWildlandsGrid;
  game.advanceGrid = advanceWildlandsGrid;
} else {
  game.generateGrid = generateGrid;
  game.advanceGrid = advanceGrid;
}

// ── startRun patch ────────────────────────────────────────────────
//
// startRun() calls upgrades.reset() which resets the mutation to 'crystalline'.
// Any dev-mode override needs to be re-applied after that reset.
// This single patch handles:
//   1. Restoring the effective mutation after reset.
//   2. Entering the boss arena immediately (boss mode only).

if (effectiveWorld || mode === "boss") {
  const _origStartRun = game.startRun.bind(game);
  game.startRun = function () {
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
