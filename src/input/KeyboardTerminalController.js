// KeyboardTerminalController.js — Terminal keyboard input
//
// Maps Node readline keypress events to semantic actions, then dispatches them.
// Platform-specific concerns: quit (Ctrl+C / q), 200ms hold-timer for boss mode.

import readline from "node:readline";
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

// ── Key name → action mapping ─────────────────────────────────────

const KEY_MAP = {
  up: ACTION_UP,
  w: ACTION_UP,
  down: ACTION_DOWN,
  s: ACTION_DOWN,
  left: ACTION_LEFT,
  a: ACTION_LEFT,
  right: ACTION_RIGHT,
  d: ACTION_RIGHT,
  return: ACTION_CONFIRM,
  space: ACTION_USE_CONSUMABLE,
  escape: ACTION_CANCEL,
  tab: ACTION_CYCLE_CONSUMABLE,
};

/** Maps directional actions to their release counterparts. */
const RELEASE_MAP = {
  [ACTION_UP]: ACTION_RELEASE_UP,
  [ACTION_DOWN]: ACTION_RELEASE_DOWN,
  [ACTION_LEFT]: ACTION_RELEASE_LEFT,
  [ACTION_RIGHT]: ACTION_RELEASE_RIGHT,
};

// ── Controller ────────────────────────────────────────────────────

export class KeyboardTerminalController extends Controller {
  /** @type {import('../core/game/index.js').Game | null} */
  _game = null;
  _heldKeyTimer = null;
  _handler = null;
  _onQuit = null;

  /** @param {{ onQuit?: () => void }} [opts] */
  constructor(opts = {}) {
    super();
    this._onQuit = opts.onQuit ?? (() => process.exit());
  }

  /** @param {import('../core/game/index.js').Game} game */
  attach(game) {
    this._game = game;
    this._handler = (ch, key) => this._handleKeypress(ch, key);

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("keypress", this._handler);
  }

  detach() {
    if (this._handler) {
      process.stdin.removeListener("keypress", this._handler);
    }
    clearTimeout(this._heldKeyTimer);
    this._game = null;
    this._handler = null;
    this._heldKeyTimer = null;
  }

  /**
   * @param {string | undefined} ch
   * @param {{ name?: string, ctrl?: boolean }} key
   */
  _handleKeypress(ch, key) {
    if (!key) {
      return;
    }
    const game = this._game;
    if (!game) {
      return;
    }

    // Quit
    if ((key.ctrl && key.name === "c") || key.name === "q") {
      this._onQuit();
      return;
    }

    // Map key name to action
    let action = KEY_MAP[key.name] ?? null;

    // Number key shortcuts (ch-based, not key.name)
    if (!action && ch === "1") {
      action = ACTION_SELECT_1;
    } else if (!action && ch === "2") {
      action = ACTION_SELECT_2;
    } else if (!action && ch === "3") {
      action = ACTION_SELECT_3;
    } else if (!action && ch === "4") {
      action = ACTION_SELECT_4;
    }

    if (!action) {
      return;
    }

    dispatchAction(game, action);

    // Boss hold-timer: simulate key release after 200ms
    const release = RELEASE_MAP[action];
    if (release && game.state === "boss") {
      clearTimeout(this._heldKeyTimer);
      this._heldKeyTimer = setTimeout(() => dispatchAction(game, release), 200);
    }
  }
}
