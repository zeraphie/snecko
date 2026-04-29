// GamepadBrowserController.js — Browser Gamepad API input
//
// Maps d-pad / left stick + face buttons to semantic actions.
// Uses requestAnimationFrame polling since the Gamepad API is poll-based.

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
  ACTION_RELEASE_UP,
  ACTION_RELEASE_DOWN,
  ACTION_RELEASE_LEFT,
  ACTION_RELEASE_RIGHT,
} from "./actions.js";

// ── Standard Gamepad button indices (W3C "standard" mapping) ──────

const BTN_A = 0; // bottom face — confirm
const BTN_B = 1; // right face — cancel
const BTN_X = 2; // left face — use consumable
const BTN_Y = 3; // top face — cycle consumable
const BTN_DPAD_UP = 12;
const BTN_DPAD_DOWN = 13;
const BTN_DPAD_LEFT = 14;
const BTN_DPAD_RIGHT = 15;

// Stick axis dead-zone (0–1). Below this magnitude the stick is considered centred.
const DEAD_ZONE = 0.4;

// ── Controller ────────────────────────────────────────────────────

export class GamepadBrowserController extends Controller {
  /** @type {import('../core/game/index.js').Game | null} */
  _game = null;
  _rafId = null;
  _onConnect = null;
  _onDisconnect = null;

  // Track which directional actions are currently "held" so we can
  // emit release actions when the stick/d-pad returns to neutral.
  _held = { up: false, down: false, left: false, right: false };

  // Debounce face buttons — only fire on the frame the button transitions to pressed.
  _btnPrev = {};

  /** @param {import('../core/game/index.js').Game} game */
  attach(game) {
    this._game = game;

    this._onConnect = () => {}; // gamepad auto-detected in poll loop
    this._onDisconnect = () => {};
    window.addEventListener("gamepadconnected", this._onConnect);
    window.addEventListener("gamepaddisconnected", this._onDisconnect);

    this._poll();
  }

  detach() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._onConnect) {
      window.removeEventListener("gamepadconnected", this._onConnect);
      window.removeEventListener("gamepaddisconnected", this._onDisconnect);
    }
    this._game = null;
    this._onConnect = null;
    this._onDisconnect = null;
  }

  // ── Polling loop ──────────────────────────────────────────────

  _poll() {
    this._rafId = requestAnimationFrame(() => this._poll());

    const game = this._game;
    if (!game) {
      return;
    }

    const gamepads = navigator.getGamepads();
    if (!gamepads) {
      return;
    }

    // Use the first connected gamepad
    let gp = null;
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i].connected) {
        gp = gamepads[i];
        break;
      }
    }
    if (!gp) {
      return;
    }

    this._pollDirections(game, gp);
    this._pollButtons(game, gp);
  }

  /**
   * @param {import('../core/game/index.js').Game} game
   * @param {Gamepad} gp
   */
  _pollDirections(game, gp) {
    // Combine d-pad buttons + left stick into directional intent
    const stickX = gp.axes[0] || 0;
    const stickY = gp.axes[1] || 0;

    const wantUp = this._btn(gp, BTN_DPAD_UP) || stickY < -DEAD_ZONE;
    const wantDown = this._btn(gp, BTN_DPAD_DOWN) || stickY > DEAD_ZONE;
    const wantLeft = this._btn(gp, BTN_DPAD_LEFT) || stickX < -DEAD_ZONE;
    const wantRight = this._btn(gp, BTN_DPAD_RIGHT) || stickX > DEAD_ZONE;

    // Press edges
    if (wantUp && !this._held.up) {
      dispatchAction(game, ACTION_UP);
    }
    if (wantDown && !this._held.down) {
      dispatchAction(game, ACTION_DOWN);
    }
    if (wantLeft && !this._held.left) {
      dispatchAction(game, ACTION_LEFT);
    }
    if (wantRight && !this._held.right) {
      dispatchAction(game, ACTION_RIGHT);
    }

    // Release edges
    if (!wantUp && this._held.up) {
      dispatchAction(game, ACTION_RELEASE_UP);
    }
    if (!wantDown && this._held.down) {
      dispatchAction(game, ACTION_RELEASE_DOWN);
    }
    if (!wantLeft && this._held.left) {
      dispatchAction(game, ACTION_RELEASE_LEFT);
    }
    if (!wantRight && this._held.right) {
      dispatchAction(game, ACTION_RELEASE_RIGHT);
    }

    this._held.up = wantUp;
    this._held.down = wantDown;
    this._held.left = wantLeft;
    this._held.right = wantRight;
  }

  /**
   * @param {import('../core/game/index.js').Game} game
   * @param {Gamepad} gp
   */
  _pollButtons(game, gp) {
    this._onBtnEdge(game, gp, BTN_A, ACTION_CONFIRM);
    this._onBtnEdge(game, gp, BTN_B, ACTION_CANCEL);
    this._onBtnEdge(game, gp, BTN_X, ACTION_USE_CONSUMABLE);
    this._onBtnEdge(game, gp, BTN_Y, ACTION_CYCLE_CONSUMABLE);
  }

  /**
   * Fire `action` only on the frame the button transitions from released to pressed.
   * @param {import('../core/game/index.js').Game} game
   * @param {Gamepad} gp
   * @param {number} btnIdx
   * @param {string} action
   */
  _onBtnEdge(game, gp, btnIdx, action) {
    const pressed = this._btn(gp, btnIdx);
    const wasPrev = this._btnPrev[btnIdx] || false;
    this._btnPrev[btnIdx] = pressed;
    if (pressed && !wasPrev) {
      dispatchAction(game, action);
    }
  }

  /**
   * @param {Gamepad} gp
   * @param {number} idx
   * @returns {boolean}
   */
  _btn(gp, idx) {
    const b = gp.buttons[idx];
    return b ? b.pressed : false;
  }
}
