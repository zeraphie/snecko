// KeyboardBrowserController.js — Browser keyboard input
//
// Maps DOM keyboard events to semantic actions, then dispatches them.
// Platform-specific concerns: preventDefault for Tab, native keyup for boss release.

import { Controller } from "./Controller.js";
import { triggerFox } from "../core/upgrades/consumables/fox.js";
import {
  dispatchAction,
  ACTION_UP,
  ACTION_DOWN,
  ACTION_LEFT,
  ACTION_RIGHT,
  ACTION_CONFIRM,
  ACTION_CANCEL,
  ACTION_USE_CONSUMABLE,
  ACTION_CYCLE_CONSUMABLE,
  ACTION_SELECT_1,
  ACTION_SELECT_2,
  ACTION_SELECT_3,
  ACTION_SELECT_4,
  ACTION_RELEASE_UP,
  ACTION_RELEASE_DOWN,
  ACTION_RELEASE_LEFT,
  ACTION_RELEASE_RIGHT,
  ACTION_STAB,
  ACTION_DODGE,
  ACTION_PARRY,
} from "./actions.js";

// ── Key → action mapping ──────────────────────────────────────────

const KEY_DOWN_MAP = {
  ArrowUp: ACTION_UP,
  w: ACTION_UP,
  W: ACTION_UP,
  ArrowDown: ACTION_DOWN,
  s: ACTION_DOWN,
  S: ACTION_DOWN,
  ArrowLeft: ACTION_LEFT,
  a: ACTION_LEFT,
  A: ACTION_LEFT,
  ArrowRight: ACTION_RIGHT,
  d: ACTION_RIGHT,
  D: ACTION_RIGHT,
  Enter: ACTION_CONFIRM,
  " ": ACTION_USE_CONSUMABLE,
  Escape: ACTION_CANCEL,
  Tab: ACTION_CYCLE_CONSUMABLE,
  1: ACTION_SELECT_1,
  2: ACTION_SELECT_2,
  3: ACTION_SELECT_3,
  4: ACTION_SELECT_4,
  // Soulslike action keys.
  j: ACTION_STAB,
  J: ACTION_STAB,
  k: ACTION_DODGE,
  K: ACTION_DODGE,
  l: ACTION_PARRY,
  L: ACTION_PARRY,
};

/**
 * True for keystrokes the browser owns — refresh, fullscreen, devtools,
 * new tab, close tab, address bar, etc. We exit the handler before any
 * branch can `preventDefault` them so the user can always reload no
 * matter what state the game is in (seed input / name input would
 * otherwise capture the printable char from Ctrl+R / Ctrl+L).
 *
 * @param {KeyboardEvent} e
 */
function isBrowserShortcut(e) {
  // Function keys reserved by the browser.
  if (e.key === "F5" || e.key === "F11" || e.key === "F12") {
    return true;
  }
  // Ctrl/Cmd + letter combos. Match on `e.code` because `e.key` is
  // affected by modifier-induced casing.
  if (e.ctrlKey || e.metaKey) {
    switch (e.code) {
      case "KeyR": // refresh
      case "KeyL": // address bar
      case "KeyT": // new tab
      case "KeyW": // close tab
      case "KeyN": // new window
        return true;
    }
  }
  return false;
}

const KEY_UP_MAP = {
  ArrowUp: ACTION_RELEASE_UP,
  w: ACTION_RELEASE_UP,
  W: ACTION_RELEASE_UP,
  ArrowDown: ACTION_RELEASE_DOWN,
  s: ACTION_RELEASE_DOWN,
  S: ACTION_RELEASE_DOWN,
  ArrowLeft: ACTION_RELEASE_LEFT,
  a: ACTION_RELEASE_LEFT,
  A: ACTION_RELEASE_LEFT,
  ArrowRight: ACTION_RELEASE_RIGHT,
  d: ACTION_RELEASE_RIGHT,
  D: ACTION_RELEASE_RIGHT,
};

// ── Controller ────────────────────────────────────────────────────

export class KeyboardBrowserController extends Controller {
  /** @type {import('../core/game/index.js').Game | null} */
  _game = null;
  _onKeyDown = null;
  _onKeyUp = null;

  /** @param {import('../core/game/index.js').Game} game */
  attach(game) {
    this._game = game;
    this._onKeyDown = (e) => this._handleKeyDown(e);
    this._onKeyUp = (e) => this._handleKeyUp(e);
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
  }

  detach() {
    if (this._onKeyDown) {
      document.removeEventListener("keydown", this._onKeyDown);
    }
    if (this._onKeyUp) {
      document.removeEventListener("keyup", this._onKeyUp);
    }
    this._game = null;
    this._onKeyDown = null;
    this._onKeyUp = null;
  }

  /** @param {KeyboardEvent} e */
  _handleKeyUp(e) {
    const game = this._game;
    if (!game) {
      return;
    }
    const action = KEY_UP_MAP[e.key];
    if (action) {
      dispatchAction(game, action);
    }
  }

  /** @param {KeyboardEvent} e */
  _handleKeyDown(e) {
    if (e.repeat) {
      return;
    }
    const game = this._game;
    if (!game) {
      return;
    }

    // Browser-reserved combos pass through untouched in every state —
    // the seed / name input branches below otherwise swallow printable
    // chars (including the `r` in Ctrl+R) and `preventDefault` them.
    if (isBrowserShortcut(e)) {
      return;
    }

    // Custom-seed input mode: capture raw text input, bypass action mapping.
    if (game.state === "seed_input") {
      if (e.key === "Enter") {
        game.confirmSeedInput();
      } else if (e.key === "Escape") {
        game.cancelSeedInput();
      } else if (e.key === "Backspace") {
        game.backspaceSeedInput();
      } else if (e.key.length === 1 && e.key >= " " && e.key <= "~") {
        game.appendSeedChar(e.key);
      }
      e.preventDefault();
      return;
    }

    // Post-run name input: same raw-text pattern as seed input.
    if (game.state === "name_input") {
      if (e.key === "Enter") {
        game.confirmNameInput();
      } else if (e.key === "Escape") {
        game.cancelNameInput();
      } else if (e.key === "Backspace") {
        game.backspaceNameInput();
      } else if (e.key.length === 1 && e.key >= " " && e.key <= "~") {
        game.appendNameInput(e.key);
      }
      e.preventDefault();
      return;
    }

    // Esc opens the in-game menu from start, dead, or playing states.
    // Inside the menu, Esc closes — handled by the dispatcher's menu branch.
    if (
      e.key === "Escape" &&
      (game.state === "start" || game.state === "dead" || game.state === "playing")
    ) {
      game.openMenu();
      e.preventDefault();
      return;
    }

    // Esc on the soulslike YOU DIED overlay returns to the practice hub.
    if (e.key === "Escape" && game.state === "dead_soulslike") {
      game.dismissYouDied();
      e.preventDefault();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
    }

    // Shift+F — easter-egg / dev trigger for the fox cutscene. Fires
    // the food-eating mode (never the contraband pounce). Limited to
    // once per act in normal play; doesn't consume a consumable charge.
    if (e.shiftKey && (e.key === "F" || e.key === "f")) {
      if (game.state === "playing" && !game._foxAnim && !game._foxEggUsedThisAct) {
        triggerFox(game, "eat");
        // Only burn the per-act egg if the fox actually launched
        // (e.g. food was on the grid).
        if (game._foxAnim) {
          game._foxEggUsedThisAct = true;
        }
      }
      e.preventDefault();
      return;
    }

    const action = KEY_DOWN_MAP[e.key];
    if (action) {
      dispatchAction(game, action);
    }
  }
}
