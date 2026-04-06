// state.js — Upgrade state tracking (passives, consumables, world mode)

export class UpgradeState {
  constructor() {
    this.worldMode = "crystalline";
    this.passives = [];
    this.consumables = [];
  }

  reset() {
    this.worldMode = "crystalline";
    this.passives = [];
    this.consumables = [];
  }

  addPassive(id, duration, durationUnit = "levels") {
    const existing = this.passives.find((p) => p.id === id);
    if (durationUnit === "food") {
      if (existing) {
        existing.remainingFood = duration;
        delete existing.remainingLevels;
      } else {
        this.passives.push({ id, remainingFood: duration });
      }
    } else {
      if (existing) {
        existing.remainingLevels = duration;
        delete existing.remainingFood;
      } else {
        this.passives.push({ id, remainingLevels: duration });
      }
    }
  }

  hasPassive(id) {
    return this.passives.some((p) => p.id === id);
  }

  tickPassives() {
    for (let i = this.passives.length - 1; i >= 0; i--) {
      if (this.passives[i].remainingLevels === undefined) continue;
      this.passives[i].remainingLevels--;
      if (this.passives[i].remainingLevels <= 0) {
        this.passives.splice(i, 1);
      }
    }
  }

  tickFoodPassives() {
    for (let i = this.passives.length - 1; i >= 0; i--) {
      if (this.passives[i].remainingFood === undefined) continue;
      this.passives[i].remainingFood--;
      if (this.passives[i].remainingFood <= 0) {
        this.passives.splice(i, 1);
      }
    }
  }

  addConsumable(id, charges) {
    const existing = this.consumables.find((c) => c.id === id);
    if (existing) {
      existing.charges += charges;
    } else {
      this.consumables.push({ id, charges });
    }
  }

  getConsumable(id) {
    return this.consumables.find((c) => c.id === id) || null;
  }

  useConsumable(id) {
    const c = this.consumables.find((c) => c.id === id);
    if (!c || c.charges <= 0) return false;
    c.charges--;
    if (c.charges <= 0) {
      this.consumables.splice(this.consumables.indexOf(c), 1);
    }
    return true;
  }

  setWorldMode(mode) {
    this.worldMode = mode;
  }
}
