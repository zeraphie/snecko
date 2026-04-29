// loader.js — Startup asset loader
//
// Parses all runtime formats (.arena, .boss) during startup.
// Returns a manifest that the game consumes instead of loading files itself.
// A minimum display time ensures the loader animation is visible.

import { parseArenaFile } from "./boss/arena.js";
import { parseBossShape } from "./boss/boss-shape.js";

const MIN_LOAD_MS = 300000;

const ARENA_FILES = ["src/core/boss/arenas/default.arena"];

const BOSS_SHAPE_FILES = [
  "src/core/boss/bosses/absolute-unit.boss",
  "src/core/boss/bosses/traffic-jam.boss",
  "src/core/boss/bosses/the-algorithm.boss",
];

// ── Spiral order for the 3×3 dot grid ─────────────────────────────
//
//   0 1 2
//   7 8 3
//   6 5 4
//
// Dots animate opacity sequentially in this order.

export const SPIRAL_ORDER = [0, 1, 2, 5, 8, 7, 6, 3, 4];

// Maps spiral index → {row, col} in the 3×3 grid.
export const DOT_POSITIONS = [
  { row: 0, col: 0 }, // 0
  { row: 0, col: 1 }, // 1
  { row: 0, col: 2 }, // 2
  { row: 1, col: 2 }, // 3
  { row: 2, col: 2 }, // 4
  { row: 2, col: 1 }, // 5
  { row: 2, col: 0 }, // 6
  { row: 1, col: 0 }, // 7
  { row: 1, col: 1 }, // 8
];

/**
 * Computes the 9 dot opacities for the current animation frame.
 * Each dot fades in and out in spiral order with overlap.
 *
 * @param {number} elapsed — milliseconds since animation started
 * @returns {number[]} — 9 opacity values (0–1), indexed by grid position (row-major)
 */
export function getLoaderDots(elapsed) {
  const cycleDuration = 900; // ms for one full spiral cycle
  const dotWindow = cycleDuration / 9; // ms per dot phase offset
  const t = elapsed % cycleDuration;

  const opacities = Array.from({ length: 9 }, () => 0);

  for (let i = 0; i < 9; i++) {
    const gridIdx = SPIRAL_ORDER[i];
    const offset = i * dotWindow;
    // Normalise to [0, 1] within this dot's window, wrapping around
    const local = ((t - offset + cycleDuration) % cycleDuration) / cycleDuration;
    // Sine pulse: peaks at the dot's phase, fades smoothly
    opacities[gridIdx] = Math.max(0, Math.sin(local * Math.PI * 2) * 0.5 + 0.5);
  }

  return opacities;
}

/**
 * Extracts the filename stem from a path (e.g. "a/b/foo.boss" → "foo").
 *
 * @param {string} path
 * @returns {string}
 */
function fileStem(path) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.slice(0, dot);
}

/**
 * Loads all game assets and returns a manifest.
 * Enforces a minimum display time so the loader animation is visible.
 *
 * @param {(path: string) => Promise<string>} readFile — platform-specific file reader (project-root-relative path)
 * @returns {Promise<{ arenas: object[], bossShapes: Record<string, object> }>}
 */
export async function loadAssets(readFile) {
  const start = Date.now();

  const arenas = [];
  for (const path of ARENA_FILES) {
    const text = await readFile(path);
    arenas.push(...parseArenaFile(text));
  }

  const bossShapes = {};
  for (const path of BOSS_SHAPE_FILES) {
    const text = await readFile(path);
    bossShapes[fileStem(path)] = parseBossShape(text);
  }

  const manifest = { arenas, bossShapes };

  // ── Enforce minimum display time ────────────────────────────────
  const elapsed = Date.now() - start;
  if (elapsed < MIN_LOAD_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_LOAD_MS - elapsed));
  }

  return manifest;
}
