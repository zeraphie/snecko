// Controller.js — Base class for all input controllers
//
// Required methods throw — subclasses must override.
// A controller translates raw platform input events into game API calls.

export class Controller {
  /**
   * Set up event listeners and wire them to the game.
   * @param {import('../core/game/index.js').Game} game
   */
  attach(game) {
    this._required("attach");
  }

  /**
   * Tear down all event listeners. Safe to call multiple times.
   */
  detach() {
    this._required("detach");
  }

  /** @param {string} method */
  _required(method) {
    throw new Error(`Controller subclass must implement ${method}()`);
  }
}
