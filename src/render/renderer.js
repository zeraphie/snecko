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

// ── Renderer base class ───────────────────────────────────────────────────
//
// Required methods throw — subclasses must override.
// Optional methods default to safe no-ops or sensible fallbacks.

// ── Required / Optional boundary ──────────────────────────────────────────
//
// Required (called unconditionally by game/render.js):
//   clear, drawCell, drawSnakeHead, drawHUD, drawScreen, flush
//
// Optional (guarded or has a sensible default):
//   drawSnakeHeadInvul, drawDraftScreen, drawContrabandScreen,
//   drawBossInfo, drawBossIntroOverlay, drawTargetingOverlay,
//   drawWormholeOverlay, drawLoader, destroy

export class Renderer {
  // ── Required — subclass must override ───────────────────────────────────────

  /** Prepare a fresh frame (clear the buffer / canvas). */
  clear() {
    this._required("clear");
  }

  /**
   * Draw one grid cell.
   * @param {number} x
   * @param {number} y
   * @param {number} type — a CELL_* constant from renderer.js
   */
  drawCell(x, y, type) {
    this._required("drawCell");
  }

  /**
   * Draw the snake head with a direction indicator.
   * @param {number} x
   * @param {number} y
   * @param {number} dx — facing direction x
   * @param {number} dy — facing direction y
   */
  drawSnakeHead(x, y, dx, dy) {
    this._required("drawSnakeHead");
  }

  /**
   * Draw the heads-up display.
   * @param {number} score
   * @param {number} length
   * @param {object} board
   * @param {string} time
   * @param {object} upgrades
   * @param {number} foodEaten
   * @param {number} foodRequired
   * @param {number} level
   * @param {number} selectedConsumable
   */
  drawHUD(
    score,
    length,
    board,
    time,
    upgrades,
    foodEaten,
    foodRequired,
    level,
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

  /**
   * Draw the snake head during invulnerability.
   * Defaults to the normal drawSnakeHead — override for a flicker effect.
   */
  drawSnakeHeadInvul(x, y, dx, dy) {
    this.drawSnakeHead(x, y, dx, dy);
  }

  /** Draw the upgrade draft screen. No-op if not overridden. */
  drawDraftScreen(choices, mutation, selectedIndex, mutationAccepted) {}

  /** Draw the contraband pick screen. No-op if not overridden. */
  drawContrabandScreen(choices, selectedIndex, collected) {}

  /** Draw boss HP bar and phase info. No-op if not overridden. */
  drawBossInfo(name, hp, maxHp, phase) {}

  /** Draw the boss intro overlay. No-op if not overridden. */
  drawBossIntroOverlay(name, ticksLeft, total) {}

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
