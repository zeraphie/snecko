// actions.js — Semantic input actions and state-based dispatch
//
// Defines platform-agnostic action constants and a central dispatcher.
// Controllers map raw events to actions, then call dispatchAction().

// ── Action constants ──────────────────────────────────────────────

export const ACTION_UP = "up";
export const ACTION_DOWN = "down";
export const ACTION_LEFT = "left";
export const ACTION_RIGHT = "right";
export const ACTION_CONFIRM = "confirm";
export const ACTION_CANCEL = "cancel";
export const ACTION_USE_CONSUMABLE = "use_consumable";
export const ACTION_CYCLE_CONSUMABLE = "cycle_consumable";
export const ACTION_TOGGLE_MUTATION = "toggle_mutation";
export const ACTION_SELECT_1 = "select_1";
export const ACTION_SELECT_2 = "select_2";
export const ACTION_SELECT_3 = "select_3";
export const ACTION_SELECT_4 = "select_4";
export const ACTION_RELEASE_UP = "release_up";
export const ACTION_RELEASE_DOWN = "release_down";
export const ACTION_RELEASE_LEFT = "release_left";
export const ACTION_RELEASE_RIGHT = "release_right";

// ── Dispatcher ────────────────────────────────────────────────────

/**
 * Routes a semantic action to the appropriate game method based on current state.
 *
 * @param {import('../core/game/index.js').Game} game
 * @param {string} action — one of the ACTION_* constants
 */
export function dispatchAction(game, action) {
  const state = game.state;

  // ── Release actions (boss fight only) ───────────────────────
  if (action === ACTION_RELEASE_UP) {
    if (state === "boss") {
      game.onInputRelease(0, -1);
    }
    return;
  }
  if (action === ACTION_RELEASE_DOWN) {
    if (state === "boss") {
      game.onInputRelease(0, 1);
    }
    return;
  }
  if (action === ACTION_RELEASE_LEFT) {
    if (state === "boss") {
      game.onInputRelease(-1, 0);
    }
    return;
  }
  if (action === ACTION_RELEASE_RIGHT) {
    if (state === "boss") {
      game.onInputRelease(1, 0);
    }
    return;
  }

  // ── Menu ────────────────────────────────────────────────────
  if (state === "menu") {
    switch (action) {
      case ACTION_UP:
        game.selectMenu(game._menuSelection - 1);
        break;
      case ACTION_DOWN:
        game.selectMenu(game._menuSelection + 1);
        break;
      case ACTION_CONFIRM:
      case ACTION_USE_CONSUMABLE:
        game.confirmMenu();
        break;
      case ACTION_CANCEL:
        game.closeMenu();
        break;
    }
    return;
  }

  // ── Contraband draft ────────────────────────────────────────
  if (state === "contraband") {
    switch (action) {
      case ACTION_UP:
        game.selectContraband(game._contrabandSelection - 1);
        break;
      case ACTION_DOWN:
        game.selectContraband(game._contrabandSelection + 1);
        break;
      case ACTION_SELECT_1:
        game.selectContraband(0);
        break;
      case ACTION_SELECT_2:
        game.selectContraband(1);
        break;
      case ACTION_SELECT_3:
        game.selectContraband(2);
        break;
      case ACTION_CONFIRM:
        game.confirmContraband();
        break;
    }
    return;
  }

  // ── Upgrade draft ───────────────────────────────────────────
  if (state === "draft") {
    switch (action) {
      case ACTION_UP:
        game.selectDraft(Math.max(0, game._draftSelection - 1));
        break;
      case ACTION_DOWN:
        game.selectDraft(game._draftSelection + 1);
        break;
      case ACTION_LEFT:
      case ACTION_RIGHT:
      case ACTION_TOGGLE_MUTATION:
        game.toggleMutation();
        break;
      case ACTION_SELECT_1:
        game.selectDraft(0);
        break;
      case ACTION_SELECT_2:
        game.selectDraft(1);
        break;
      case ACTION_SELECT_3:
        game.selectDraft(2);
        break;
      case ACTION_SELECT_4:
        game.toggleMutation();
        break;
      case ACTION_CONFIRM:
        game.confirmDraft();
        break;
    }
    return;
  }

  // ── All other states (start, playing, dead, boss, targeting, wormhole) ──
  switch (action) {
    case ACTION_CANCEL:
      if (state === "targeting") {
        game.cancelTargeting();
      }
      break;
    case ACTION_CONFIRM:
      game.confirm();
      break;
    case ACTION_USE_CONSUMABLE:
      if (state === "playing") {
        game.useConsumable();
      } else {
        game.confirm();
      }
      break;
    case ACTION_CYCLE_CONSUMABLE:
      game.cycleConsumable();
      break;
    case ACTION_UP:
      game.onInput(0, -1);
      break;
    case ACTION_DOWN:
      game.onInput(0, 1);
      break;
    case ACTION_LEFT:
      game.onInput(-1, 0);
      break;
    case ACTION_RIGHT:
      game.onInput(1, 0);
      break;
  }
}
