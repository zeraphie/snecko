// draft.js — Draft screen methods (selection, mutation, confirm)

import { TYPE_PASSIVE, TYPE_CONSUMABLE, TYPE_BITES, TYPE_MUTATION } from "../upgrades/defs.js";
import {
  generateGrid as crystallineGenerate,
  advanceGrid as crystallineAdvance,
} from "../generation/index.js";
import { generateWildlandsGrid, advanceWildlandsGrid } from "../generation/wildlands/generator.js";
import {
  STATE_DRAFT,
  STATE_PLAYING,
  FOOD_REQUIRED_BASE,
  FOOD_REQUIRED_PER_ACT,
  INITIAL_SNAKE_LENGTH,
} from "./constants.js";
import { mixSeeds, splitmix32 } from "../rng.js";
import { SUBSEED_FOOD } from "../seed-streams.js";

const GENERATORS = {
  crystalline: { generate: crystallineGenerate, advance: crystallineAdvance },
  wildlands: {
    generate: generateWildlandsGrid,
    advance: advanceWildlandsGrid,
  },
};

/**
 * Selects a draft choice by index.
 *
 * @param {number} index
 */
export function selectDraft(index) {
  if (this.state !== STATE_DRAFT) {
    return;
  }
  if (this._draftPool && index >= 0 && index < this._draftPool.choices.length) {
    this._draftSelection = index;
  }
}

/** Toggles acceptance of the bonus mutation slot. */
export function toggleMutation() {
  if (this.state !== STATE_DRAFT) {
    return;
  }
  if (this._draftPool && this._draftPool.mutation) {
    this._draftMutationAccepted = !this._draftMutationAccepted;
  }
}

/**
 * Applies an upgrade definition to the game's upgrade state.
 *
 * @param {object} def — upgrade definition from defs.js
 */
export function _applyUpgrade(def) {
  if (def.type === TYPE_PASSIVE) {
    this.upgrades.addPassive(def.id, def.duration);
  } else if (def.type === TYPE_CONSUMABLE) {
    this.upgrades.addConsumable(def.id, def.charges);
  } else if (def.type === TYPE_BITES) {
    this.upgrades.addBites(def.id, def.charges);
  } else if (def.type === TYPE_MUTATION) {
    this.upgrades.setMutation(def.id);
    const gen = GENERATORS[def.id];
    if (gen) {
      this.generateGrid = gen.generate;
      this.advanceGrid = gen.advance;
    }
  }
}

/** Confirms the draft selection, applies upgrades, advances the act, and regenerates the grid. */
export function confirmDraft() {
  if (this.state !== STATE_DRAFT) {
    return;
  }

  // Apply selected upgrade(s)
  if (this._draftPool) {
    this._applyUpgrade(this._draftPool.choices[this._draftSelection]);
    if (this._draftMutationAccepted && this._draftPool.mutation) {
      this._applyUpgrade(this._draftPool.mutation);
    }
  }

  // Advance to next act
  this.actIndex++;
  this.actSeed = mixSeeds(this.runSeed, this.actIndex);
  this.foodRand = splitmix32(mixSeeds(this.actSeed, SUBSEED_FOOD));
  this.foodEaten = 0;
  this.mechanic = null;
  this._wormholeA = null;
  this._wormholeB = null;
  this.foodRequired = FOOD_REQUIRED_BASE + this.actIndex * FOOD_REQUIRED_PER_ACT;
  this._recalcTickMs();
  this.snake.snakeLength = INITIAL_SNAKE_LENGTH;

  if (this.generateGrid) {
    this.generateGrid(this);
  } else {
    this._resetGridSimple();
  }

  this._draftPool = null;
  this.state = STATE_PLAYING;
  this.lastTickTime = Date.now();
}
