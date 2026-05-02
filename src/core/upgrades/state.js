// state.js — Upgrade state tracking (passives, consumables, bites, mutation)

/** Tracks active passives, consumables, bites, and the current mutation. */
export class UpgradeState {
  constructor() {
    this.mutation = "crystalline";
    this.passives = [];
    this.consumables = [];
    this.bites = [];
  }

  /** Clears all upgrade state and resets mutation to crystalline. */
  reset() {
    this.mutation = "crystalline";
    this.passives = [];
    this.consumables = [];
    this.bites = [];
  }

  /**
   * Adds or refreshes a passive upgrade. Duration is measured in bites
   * (food-bites — see PLAN.terminology.md).
   *
   * @param {string} id
   * @param {number} duration — number of bites the passive lasts
   */
  addPassive(id, duration) {
    const existing = this.passives.find((p) => p.id === id);
    if (existing) {
      existing.remainingBites = duration;
    } else {
      this.passives.push({ id, remainingBites: duration });
    }
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  hasPassive(id) {
    return this.passives.some((p) => p.id === id);
  }

  /** Decrements food-based passives and removes expired ones. */
  tickBites() {
    for (let i = this.passives.length - 1; i >= 0; i--) {
      if (this.passives[i].remainingBites === undefined) {
        continue;
      }
      this.passives[i].remainingBites--;
      if (this.passives[i].remainingBites <= 0) {
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
   * Adds charges to a bites-type upgrade, stacking if already held.
   * Bites auto-trigger on a specific in-game event (e.g. eating a wall);
   * each fire consumes one charge.
   *
   * @param {string} id
   * @param {number} charges
   */
  addBites(id, charges) {
    const existing = this.bites.find((b) => b.id === id);
    if (existing) {
      existing.charges += charges;
    } else {
      this.bites.push({ id, charges });
    }
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  hasBites(id) {
    return this.bites.some((b) => b.id === id && b.charges > 0);
  }

  /**
   * Spends one bites charge. Returns false if unavailable. Removes the entry at zero charges.
   *
   * @param {string} id
   * @returns {boolean}
   */
  useBites(id) {
    const b = this.bites.find((entry) => entry.id === id);
    if (!b || b.charges <= 0) {
      return false;
    }
    b.charges--;
    if (b.charges <= 0) {
      this.bites.splice(this.bites.indexOf(b), 1);
    }
    return true;
  }

  /**
   * @param {"crystalline"|"wildlands"|"catacombs"} mutation
   */
  setMutation(mutation) {
    this.mutation = mutation;
  }
}
