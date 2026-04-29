// GyroscopeBrowserController.js — Browser DeviceOrientation input
//
// Maps device tilt angles (beta/gamma) to directional actions.
// Primarily useful on mobile — tilt phone to steer the snake.
// Requires user gesture to activate on iOS (DeviceOrientationEvent.requestPermission).

import { Controller } from "./Controller.js";
import { dispatchAction, ACTION_UP, ACTION_DOWN, ACTION_LEFT, ACTION_RIGHT } from "./actions.js";

// ── Tilt thresholds (degrees) ─────────────────────────────────────
//
// beta  = front-back tilt (positive = phone tilted toward user)
// gamma = left-right tilt (positive = phone tilted to the right)
//
// Dead zone: within ±DEAD_ZONE degrees of neutral → no direction.
// Beyond DEAD_ZONE → the dominant axis fires a direction.

const DEAD_ZONE = 15; // degrees

// ── Controller ────────────────────────────────────────────────────

export class GyroscopeBrowserController extends Controller {
  /** @type {import('../core/game/index.js').Game | null} */
  _game = null;
  _onOrientation = null;
  _lastAction = null;
  _permissionGranted = false;

  /** @param {import('../core/game/index.js').Game} game */
  attach(game) {
    this._game = game;
    this._requestPermission().then(() => {
      if (!this._game) {
        return;
      } // detached while waiting
      this._onOrientation = (e) => this._handleOrientation(e);
      window.addEventListener("deviceorientation", this._onOrientation);
    });
  }

  detach() {
    if (this._onOrientation) {
      window.removeEventListener("deviceorientation", this._onOrientation);
    }
    this._game = null;
    this._onOrientation = null;
    this._lastAction = null;
  }

  // ── Permission (iOS) ──────────────────────────────────────────

  async _requestPermission() {
    // iOS 13+ requires an explicit permission request from a user gesture.
    // This stub calls it eagerly — in practice, wire this to a UI button tap.
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        this._permissionGranted = result === "granted";
      } catch {
        this._permissionGranted = false;
      }
    } else {
      // Non-iOS or older browsers — permission not needed
      this._permissionGranted = true;
    }
  }

  // ── Orientation handler ───────────────────────────────────────

  /** @param {DeviceOrientationEvent} e */
  _handleOrientation(e) {
    const game = this._game;
    if (!game || !this._permissionGranted) {
      return;
    }

    const beta = e.beta ?? 0; // front-back tilt (-180..180)
    const gamma = e.gamma ?? 0; // left-right tilt (-90..90)

    // Determine dominant axis (whichever exceeds dead zone more)
    const absBeta = Math.abs(beta);
    const absGamma = Math.abs(gamma);

    let action = null;
    if (absBeta > DEAD_ZONE || absGamma > DEAD_ZONE) {
      if (absBeta >= absGamma) {
        action = beta > 0 ? ACTION_DOWN : ACTION_UP;
      } else {
        action = gamma > 0 ? ACTION_RIGHT : ACTION_LEFT;
      }
    }

    // Only dispatch when direction changes (avoid spamming)
    if (action && action !== this._lastAction) {
      this._lastAction = action;
      dispatchAction(game, action);
    } else if (!action) {
      this._lastAction = null;
    }
  }
}
