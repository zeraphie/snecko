// KeyboardBrowserController.js — Browser keyboard input
//
// Maps DOM keyboard events to semantic actions, then dispatches them.
// Platform-specific concerns: preventDefault for Tab, native keyup for boss release.

import { Controller } from "./Controller.js";
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
};

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
    if (e.key === "Tab") {
      e.preventDefault();
    }
    const action = KEY_DOWN_MAP[e.key];
    if (action) {
      dispatchAction(game, action);
    }
  }
}
