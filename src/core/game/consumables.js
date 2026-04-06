// consumables.js — Consumable activation, cycling, and dispatch

import { executeDash } from "../upgrades/consumables/dash.js";
import { enterTargeting, cancelBomb } from "../upgrades/consumables/bomb.js";
import { enterWormholePlacement, cancelWormhole } from "../upgrades/consumables/wormhole.js";
import { STATE_PLAYING, STATE_WORMHOLE } from "./constants.js";

export function cycleConsumable() {
  if (this.state !== STATE_PLAYING) return;
  const consumables = this.upgrades.consumables;
  if (consumables.length === 0) return;
  this._selectedConsumable = (this._selectedConsumable + 1) % consumables.length;
}

export function useConsumable() {
  if (this.state !== STATE_PLAYING) return false;
  const consumables = this.upgrades.consumables;
  if (consumables.length === 0) return false;
  if (this._selectedConsumable >= consumables.length) {
    this._selectedConsumable = 0;
  }
  const entry = consumables[this._selectedConsumable];
  const used = this.upgrades.useConsumable(entry.id);
  if (!used) return false;
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
  }
  return entry.id;
}

export function cancelTargeting() {
  if (this.state === STATE_WORMHOLE) {
    cancelWormhole(this);
  } else {
    cancelBomb(this);
  }
}
