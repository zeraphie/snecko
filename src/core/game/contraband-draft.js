// contraband-draft.js — Contraband pick screen: selection and confirmation

import { generateDraftPool } from "../upgrades/draft.js";
import { STATE_CONTRABAND, STATE_PLAYING, STATE_DRAFT } from "./constants.js";

/**
 * Changes the currently highlighted Contraband pick.
 * Clamps to valid pool indices; no-op outside STATE_CONTRABAND.
 *
 * @param {number} index
 */
export function selectContraband(index) {
  if (this.state !== STATE_CONTRABAND || !this._contrabandPool) {
    return;
  }
  const max = this._contrabandPool.length - 1;
  this._contrabandSelection = Math.max(0, Math.min(index, max));
}

/**
 * Applies the selected Contraband item, stores it in the run's stash, then
 * transitions:
 *   → STATE_DRAFT  if the boss food reward pushed foodEaten ≥ foodRequired
 *   → STATE_PLAYING otherwise (fresh grid generated)
 *
 * No-op outside STATE_CONTRABAND.
 */
export function confirmContraband() {
  if (this.state !== STATE_CONTRABAND || !this._contrabandPool) {
    return;
  }

  const chosen = this._contrabandPool[this._contrabandSelection];
  if (chosen) {
    this._contraband.push(chosen);
    chosen.apply(this);
  }

  this._contrabandPool = null;

  if (this.foodEaten >= this.foodRequired) {
    // Food threshold crossed — regular upgrade draft next
    this._draftPool = generateDraftPool(this.upgrades, Math.random, this._draftsSinceMutation);
    if (this._draftPool.mutation) {
      this._draftsSinceMutation = 0;
    } else {
      this._draftsSinceMutation++;
    }
    this._draftSelection = 0;
    this._draftMutationAccepted = false;
    this.state = STATE_DRAFT;
  } else {
    // Back to normal gameplay
    this.state = STATE_PLAYING;
    if (this.generateGrid) {
      this.generateGrid(this);
    } else {
      this._resetGridSimple();
    }
  }
}
