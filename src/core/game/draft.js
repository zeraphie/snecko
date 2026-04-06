// draft.js — Draft screen methods (selection, mutation, confirm)

import { TYPE_PASSIVE, TYPE_CONSUMABLE, TYPE_MUTATION } from "../upgrades/defs.js";
import {
  generateBoard as crystallineGenerate,
  advanceBoard as crystallineAdvance,
} from "../generation/index.js";
import {
  generateWildlandsBoard,
  advanceWildlandsBoard,
} from "../generation/wildlands/generator.js";
import {
  STATE_DRAFT,
  STATE_PLAYING,
  FOOD_REQUIRED_BASE,
  FOOD_REQUIRED_PER_LEVEL,
  INITIAL_SNAKE_LENGTH,
} from "./constants.js";

const GENERATORS = {
  crystalline: { generate: crystallineGenerate, advance: crystallineAdvance },
  wildlands: { generate: generateWildlandsBoard, advance: advanceWildlandsBoard },
};

export function selectDraft(index) {
  if (this.state !== STATE_DRAFT) return;
  if (this._draftPool && index >= 0 && index < this._draftPool.choices.length) {
    this._draftSelection = index;
  }
}

export function toggleMutation() {
  if (this.state !== STATE_DRAFT) return;
  if (this._draftPool && this._draftPool.mutation) {
    this._draftMutationAccepted = !this._draftMutationAccepted;
  }
}

export function _applyUpgrade(def) {
  if (def.type === TYPE_PASSIVE) {
    this.upgrades.addPassive(def.id, def.duration, def.durationUnit);
  } else if (def.type === TYPE_CONSUMABLE) {
    this.upgrades.addConsumable(def.id, def.charges);
  } else if (def.type === TYPE_MUTATION) {
    this.upgrades.setWorldMode(def.id);
    const gen = GENERATORS[def.id];
    if (gen) {
      this.generateBoard = gen.generate;
      this.advanceBoard = gen.advance;
    }
  }
}

export function confirmDraft() {
  if (this.state !== STATE_DRAFT) return;

  // Apply selected upgrade(s)
  if (this._draftPool) {
    this._applyUpgrade(this._draftPool.choices[this._draftSelection]);
    if (this._draftMutationAccepted && this._draftPool.mutation) {
      this._applyUpgrade(this._draftPool.mutation);
    }
  }

  // Apply level-up
  this.level++;
  this.boardIndex++;
  this.foodEaten = 0;
  this.mechanic = null;
  this._wormholeA = null;
  this._wormholeB = null;
  this.foodRequired = FOOD_REQUIRED_BASE + this.level * FOOD_REQUIRED_PER_LEVEL;
  this._recalcTickMs();
  this.snake.snakeLength = INITIAL_SNAKE_LENGTH;

  if (this.generateBoard) {
    this.generateBoard(this);
  } else {
    this._resetBoardSimple();
  }

  this._draftPool = null;
  this.state = STATE_PLAYING;
  this.lastTickTime = Date.now();
}
