// consumables.js — Consumable activation, cycling, and dispatch

import { executeDash } from "../upgrades/consumables/dash.js";
import { enterTargeting, cancelBomb } from "../upgrades/consumables/bomb.js";
import { enterWormholePlacement, cancelWormhole } from "../upgrades/consumables/wormhole.js";
import { triggerFox } from "../upgrades/consumables/fox.js";
import { enterShieldPlacement, cancelShieldPlacement } from "../upgrades/consumables/shield.js";
import { STATE_PLAYING, STATE_WORMHOLE, STATE_BOSS, STATE_SHIELD_PLACEMENT } from "./constants.js";

/** Cycles to the next consumable in the inventory. */
export function cycleConsumable() {
  if (this.state !== STATE_PLAYING) {
    return;
  }
  const consumables = this.upgrades.consumables;
  if (consumables.length === 0) {
    return;
  }
  this._selectedConsumable = (this._selectedConsumable + 1) % consumables.length;
}

/**
 * Activates the currently selected consumable and dispatches its effect.
 *
 * @returns {string|false} — the consumable id used, or false if none available
 */
export function useConsumable() {
  // A running fox cutscene swallows further uses — don't spend a charge.
  if (this._foxAnim) {
    return false;
  }

  // Boss state: only the fox consumable is usable, and it pounces the
  // boss instead of eating food. Selection cursor is irrelevant — the
  // fox is unique in working mid-fight, so we look it up by id.
  if (this.state === STATE_BOSS) {
    if (!this.upgrades.getConsumable("fox")) {
      return false;
    }
    if (!this.upgrades.useConsumable("fox")) {
      return false;
    }
    triggerFox(this, "pounce");
    return "fox";
  }

  if (this.state !== STATE_PLAYING) {
    return false;
  }
  const consumables = this.upgrades.consumables;
  if (consumables.length === 0) {
    return false;
  }
  if (this._selectedConsumable >= consumables.length) {
    this._selectedConsumable = 0;
  }
  const entry = consumables[this._selectedConsumable];
  const used = this.upgrades.useConsumable(entry.id);
  if (!used) {
    return false;
  }
  // Clamp selection if consumable was depleted
  if (this._selectedConsumable >= consumables.length) {
    this._selectedConsumable = Math.max(0, consumables.length - 1);
  }
  // Dispatch effect
  if (entry.id === "dash") {
    executeDash(this);
  } else if (entry.id === "wormhole") {
    enterWormholePlacement(this);
  } else if (entry.id === "bomb") {
    enterTargeting(this);
  } else if (entry.id === "fox") {
    triggerFox(this, "eat");
  } else if (entry.id === "shield") {
    enterShieldPlacement(this);
  }
  return entry.id;
}

/** Cancels the current targeting/wormhole/shield placement mode and returns to playing. */
export function cancelTargeting() {
  if (this.state === STATE_WORMHOLE) {
    cancelWormhole(this);
  } else if (this.state === STATE_SHIELD_PLACEMENT) {
    cancelShieldPlacement(this);
  } else {
    cancelBomb(this);
  }
}
