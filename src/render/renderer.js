// renderer.js — Shared cell-type constants and Renderer base class

// ── Cell-type constants ───────────────────────────────────────────────────

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
export const CELL_RED_FOOD = 13;
export const CELL_BOSS_BODY = 14;
export const CELL_BOSS_WEAK = 15;
export const CELL_PROJECTILE = 16;
export const CELL_PLAYER_INVUL = 17;
export const CELL_BOSS_HIT = 18;
export const CELL_WALL_ARENA = 19;
export const CELL_ANCHOR_LOCK = 20;
export const CELL_DANGER_TRAIL = 21;
export const CELL_ECHO_ZONE = 22;
export const CELL_PLAYER_BULLET = 23;
export const CELL_BOSS_DAMAGED = 24;
export const CELL_EXHAUST = 25;
export const CELL_WALL_HIGH = 26;
export const CELL_WALL_LOW_EDIBLE = 27;
export const CELL_BLOB = 28;

// ── Soulslike (Hissalia, Blade of Wormwood) ────────────────────
//
// Registered in `core/grid/cell/soulslike/` with starter visuals.
// Soulslike-plan Step 11 wires them into the screen render path and
// refines the detailed canvas drawings.
export const CELL_FIGHTER_IDLE = 29;
export const CELL_FIGHTER_STAB_ACTIVE = 30;
export const CELL_FIGHTER_DODGE_ACTIVE = 31;
export const CELL_FIGHTER_DODGE_RECOVERY = 32;
export const CELL_FIGHTER_PARRY_ACTIVE = 33;
/** Hissalia is now a single 1×1 cell (the original NE/SW/SE corners are
 * unused; their CELL_* constants are kept as orphans only for stable
 * cell-type integers, never registered or rendered). */
export const CELL_HISSALIA = 34;
export const CELL_HALBERD_HANDLE = 38;
export const CELL_HALBERD_TIP = 39;
// CELL_KNIFE_HANDLE (40) is removed — the knife is a single cell.
export const CELL_KNIFE_TIP = 41;

// ── Soulslike arena scenery ────────────────────────────────────────
//
// Decorative + obstacle cells placed in the soulslike arena to make
// it read as a real location instead of an empty box. Flowers are
// non-blocking (cosmetic only, terminal hides them); tree and
// gravestones are blocking walls with distinct visuals.
export const CELL_FLOWER = 42;
export const CELL_TREE = 43;
export const CELL_GRAVESTONE = 44;
export const CELL_WATER = 45;
export const CELL_WALL_CATACOMB = 46;
export const CELL_WALL_CRYSTAL = 47;
export const CELL_CRYSTAL_TELEGRAPH = 48;

// ── Renderer base class ───────────────────────────────────────────────────
//
// Required methods throw — subclasses must override.
// Optional methods default to safe no-ops or sensible fallbacks.

// ── Required / Optional boundary ──────────────────────────────────────────
//
// Required (called unconditionally by game/render.js):
//   clear, cell, drawHUD, drawScreen, flush
//
// Optional (guarded or has a sensible default):
//   drawDraftScreen, drawContrabandScreen,
//   drawBossInfo, drawBossIntroOverlay, drawTargetingOverlay,
//   drawWormholeOverlay, drawLoader, destroy

export class Renderer {
  // ── Required — subclass must override ───────────────────────────────────────

  /** Prepare a fresh frame (clear the buffer / canvas). */
  clear() {
    this._required("clear");
  }

  /**
   * Draw one grid cell from a renderer-agnostic spec. The cell adapter
   * (`core/grid/cell/`) calls this with `{ color, glyph, glyphColor,
   * detailed? }` where canvas uses `color` (and the optional `detailed`
   * callback for richer drawing) and terminal uses `glyph` +
   * `glyphColor`. No-op default so test mocks without `cell()` don't
   * crash; real renderers override.
   *
   * @param {number} _x
   * @param {number} _y
   * @param {{ color?: string, glyph?: string, glyphColor?: string,
   *   detailed?: (ctx: object, px: number, py: number, cs: number) => void }} _spec
   */
  cell(_x, _y, _spec) {}

  /**
   * Draw the heads-up display.
   * @param {number} score
   * @param {number} actIndex
   * @param {string} time
   * @param {number} foodEaten
   * @param {number} foodRequired
   * @param {Array|null} passives
   * @param {Array|null} consumables
   * @param {Array|null} bites
   * @param {number} selectedConsumable
   */
  drawHUD(
    score,
    actIndex,
    time,
    foodEaten,
    foodRequired,
    passives,
    consumables,
    bites,
    selectedConsumable
  ) {
    this._required("drawHUD");
  }

  /**
   * Draw a full-screen overlay (start screen, death screen, etc.).
   * @param {string} name — 'start' | 'dead' | etc.
   * @param {string[]} lines — text lines to display centred
   */
  drawScreen(name, lines) {
    this._required("drawScreen");
  }

  /** Finalise the frame (no-op on canvas, writes buffer on terminal). */
  flush() {
    this._required("flush");
  }

  // ── Optional — safe defaults ──────────────────────────────────────────

  /** Draw the upgrade draft screen. No-op if not overridden. */
  drawDraftScreen(choices, mutation, selectedIndex, mutationAccepted) {}

  /** Draw the contraband pick screen. No-op if not overridden. */
  drawContrabandScreen(choices, selectedIndex, collected) {}

  /** Draw the mutation picker screen. No-op if not overridden. */
  drawMutationPickerScreen(mutationIds, selectedIndex) {}

  /** Draw boss HP bar and phase info. No-op if not overridden. */
  drawBossInfo(name, hp, maxHp, phase) {}

  /** Draw the survival countdown HUD. No-op if not overridden. */
  drawSurvivalInfo(name, ticksLeft, totalTicks) {}

  /**
   * Draw the soulslike HUD: snake HP bar, stamina pips, boss HP bar.
   * No-op if not overridden.
   *
   * @param {number} snakeHp
   * @param {number} snakeHpMax
   * @param {number} stamina
   * @param {number} staminaMax
   * @param {string} bossName
   * @param {number} bossHp
   * @param {number} bossHpMax
   */
  drawSoulslikeInfo(snakeHp, snakeHpMax, stamina, staminaMax, bossName, bossHp, bossHpMax) {}

  /** Draw the boss intro overlay. No-op if not overridden. */
  drawBossIntroOverlay(name, ticksLeft, total) {}

  /**
   * Draw the soulslike YOU DIED overlay. Full-screen red-on-black with
   * the death cause string. No-op if not overridden.
   *
   * @param {string} causeText
   */
  drawYouDiedOverlay(causeText) {}

  /** Draw the bomb targeting overlay. No-op if not overridden. */
  drawTargetingOverlay(cursorX, cursorY, boardW, boardH) {}

  /** Draw the wormhole placement overlay. No-op if not overridden. */
  drawWormholeOverlay(cursorX, cursorY, phase, portalA, boardW, boardH) {}

  /**
   * Draw the startup loader animation.
   * @param {number[]} dots — 9 opacity values (0–1)
   */
  drawLoader(dots) {}

  /** Clean up resources (terminal cursor restore, etc.). No-op if not overridden. */
  destroy() {}

  // ── Internal ────────────────────────────────────────────────────

  /** @param {string} method */
  _required(method) {
    throw new Error(`Renderer subclass must implement ${method}()`);
  }
}
