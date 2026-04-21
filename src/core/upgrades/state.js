// state.js — Upgrade state tracking (passives, consumables, world mode)

/** Tracks active passives, consumable charges, and the current world mode. */
export class UpgradeState {
  constructor() {
    this.worldMode = 'crystalline';
    this.passives = [];
    this.consumables = [];
  }

  /** Clears all passives and consumables, resets world mode to crystalline. */
  reset() {
    this.worldMode = 'crystalline';
    this.passives = [];
    this.consumables = [];
  }

  /**
   * Adds or refreshes a passive upgrade.
   *
   * @param {string} id
   * @param {number} duration
   * @param {"levels"|"food"} [durationUnit="levels"]
   */
  addPassive(id, duration, durationUnit = 'levels') {
    const existing = this.passives.find((p) => p.id === id);
    if (durationUnit === 'food') {
      if (existing) {
        existing.remainingFood = duration;
        delete existing.remainingLevels;
      } else {
        this.passives.push({ id, remainingFood: duration });
      }
    } else if (existing) {
      existing.remainingLevels = duration;
      delete existing.remainingFood;
    } else {
      this.passives.push({ id, remainingLevels: duration });
    }
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  hasPassive(id) {
    return this.passives.some((p) => p.id === id);
  }

  /** Decrements level-based passives and removes expired ones. */
  tickPassives() {
    for (let i = this.passives.length - 1; i >= 0; i--) {
      if (this.passives[i].remainingLevels === undefined) continue;
      this.passives[i].remainingLevels--;
      if (this.passives[i].remainingLevels <= 0) {
        this.passives.splice(i, 1);
      }
    }
  }

  /** Decrements food-based passives and removes expired ones. */
  tickFoodPassives() {
    for (let i = this.passives.length - 1; i >= 0; i--) {
      if (this.passives[i].remainingFood === undefined) continue;
      this.passives[i].remainingFood--;
      if (this.passives[i].remainingFood <= 0) {
        this.passives.splice(i, 1);
      }
    }
  }

  /**
   * Adds charges to a consumable, stacking if already held.
   *
   * @param {string} id
   * @param {number} charges
   */
  addConsumable(id, charges) {
    const existing = this.consumables.find((c) => c.id === id);
    if (existing) {
      existing.charges += charges;
    } else {
      this.consumables.push({ id, charges });
    }
  }

  /**
   * @param {string} id
   * @returns {{ id: string, charges: number }|null}
   */
  getConsumable(id) {
    return this.consumables.find((c) => c.id === id) || null;
  }

  /**
   * Spends one charge. Returns false if unavailable. Removes the entry at zero charges.
   *
   * @param {string} id
   * @returns {boolean}
   */
  useConsumable(id) {
    const c = this.consumables.find((entry) => entry.id === id);
    if (!c || c.charges <= 0) {
      return false;
    }
    c.charges--;
    if (c.charges <= 0) {
      this.consumables.splice(this.consumables.indexOf(c), 1);
    }
    return true;
  }

  /**
   * @param {"crystalline"|"wildlands"} mode
   */
  setWorldMode(mode) {
    this.worldMode = mode;
  }
}
