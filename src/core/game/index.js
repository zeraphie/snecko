// game.js — Game class: state machine, orchestrates tick/draft/render

import { Board } from "../board/index.js";
import { Snake } from "../snake/index.js";
import { UpgradeState } from "../upgrades/state.js";
import { moveCursor, confirmBomb } from "../upgrades/consumables/bomb.js";
import { moveWormholeCursor, confirmWormholePlacement } from "../upgrades/consumables/wormhole.js";
import {
  generateBoard as crystallineGenerate,
  advanceBoard as crystallineAdvance,
} from "../generation/index.js";
import {
  STATE_START,
  STATE_PLAYING,
  STATE_DRAFT,
  STATE_TARGETING,
  STATE_WORMHOLE,
  STATE_DEAD,
  BOARD_W,
  BOARD_H,
  INITIAL_SNAKE_LENGTH,
  BASE_TICK_MS,
  FOOD_REQUIRED_BASE,
  FOOD_REQUIRED_PER_LEVEL,
} from "./constants.js";

// Method imports — attached to prototype below
import { tick, _handleFoodEaten, _peekNextCell, _recalcTickMs, _placeRandomFood } from "./tick.js";
import { selectDraft, toggleMutation, _applyUpgrade, confirmDraft } from "./draft.js";
import { cycleConsumable, useConsumable, cancelTargeting } from "./consumables.js";
import { _drawBoard, renderFrame } from "./render.js";

export class Game {
  constructor() {
    this.state = STATE_START;
    this.board = new Board(BOARD_W, BOARD_H);
    this.snake = new Snake();
    this.score = 0;
    this.boardIndex = 1;
    this.level = 1;
    this.foodEaten = 0;
    this.foodRequired = FOOD_REQUIRED_BASE + FOOD_REQUIRED_PER_LEVEL;
    this.runTime = 0;
    this.tickMs = BASE_TICK_MS;
    this.lastTickTime = 0;
    this.startTime = 0;
    this.upgrades = new UpgradeState();
    this._draftPool = null;
    this._draftSelection = 0;
    this._draftMutationAccepted = false;
    this._draftsSinceMutation = 0;
    this._selectedConsumable = 0;
    this._bombCursor = null;
    this._wormholeCursor = null;
    this._wormholePhase = 0;
    this._wormholeA = null;
    this._wormholeB = null;
    this.mechanic = null;
    this.renderer = null;
    this.generateBoard = null;
    this.advanceBoard = null;
  }

  startRun() {
    this.state = STATE_PLAYING;
    this.score = 0;
    this.boardIndex = 1;
    this.level = 1;
    this.foodEaten = 0;
    this.foodRequired = FOOD_REQUIRED_BASE + FOOD_REQUIRED_PER_LEVEL;
    this.upgrades.reset();
    this.generateBoard = crystallineGenerate;
    this.advanceBoard = crystallineAdvance;
    this._selectedConsumable = 0;
    this._draftsSinceMutation = 0;
    this._bombCursor = null;
    this._wormholeCursor = null;
    this._wormholePhase = 0;
    this._wormholeA = null;
    this._wormholeB = null;
    this.mechanic = null;
    this.runTime = 0;
    this._recalcTickMs();
    this.startTime = Date.now();
    this.lastTickTime = Date.now();
    this.snake.snakeLength = INITIAL_SNAKE_LENGTH;

    if (this.generateBoard) {
      this.generateBoard(this);
    } else {
      this._resetBoardSimple();
    }
  }

  _resetBoardSimple() {
    this.board.clearMasks("wall");
    this.board.clearMasks("snake");
    this.board.clearMasks("reserved");
    this.board.terrain.fill(0);

    const cx = Math.floor(BOARD_W / 2);
    const cy = Math.floor(BOARD_H / 2);
    this.snake.init(this.board, cx, cy, this.snake.snakeLength, 1, 0);

    this._placeRandomFood();
  }

  onInput(dx, dy) {
    if (this.state === STATE_PLAYING) {
      this.snake.setNextDirection(dx, dy);
    } else if (this.state === STATE_TARGETING) {
      moveCursor(this, dx, dy);
    } else if (this.state === STATE_WORMHOLE) {
      moveWormholeCursor(this, dx, dy);
    }
  }

  confirm() {
    if (this.state === STATE_START || this.state === STATE_DEAD) {
      this.startRun();
    } else if (this.state === STATE_TARGETING) {
      confirmBomb(this);
    } else if (this.state === STATE_WORMHOLE) {
      confirmWormholePlacement(this);
    }
  }

  static formatTime(secs) {
    const m = String(Math.floor(secs / 60)).padStart(2, "0");
    const s = String(Math.floor(secs % 60)).padStart(2, "0");
    return m + ":" + s;
  }
}

// Attach methods from split files
Game.prototype.tick = tick;
Game.prototype._handleFoodEaten = _handleFoodEaten;
Game.prototype._peekNextCell = _peekNextCell;
Game.prototype._recalcTickMs = _recalcTickMs;
Game.prototype._placeRandomFood = _placeRandomFood;
Game.prototype.selectDraft = selectDraft;
Game.prototype.toggleMutation = toggleMutation;
Game.prototype._applyUpgrade = _applyUpgrade;
Game.prototype.confirmDraft = confirmDraft;
Game.prototype.cycleConsumable = cycleConsumable;
Game.prototype.useConsumable = useConsumable;
Game.prototype.cancelTargeting = cancelTargeting;
Game.prototype._drawBoard = _drawBoard;
Game.prototype.renderFrame = renderFrame;

// Static constants
Game.BOARD_W = BOARD_W;
Game.BOARD_H = BOARD_H;
Game.INITIAL_SNAKE_LENGTH = INITIAL_SNAKE_LENGTH;
Game.FOOD_REQUIRED_BASE = FOOD_REQUIRED_BASE;
Game.FOOD_REQUIRED_PER_LEVEL = FOOD_REQUIRED_PER_LEVEL;
Game.STATE_START = STATE_START;
Game.STATE_PLAYING = STATE_PLAYING;
Game.STATE_DRAFT = STATE_DRAFT;
Game.STATE_TARGETING = STATE_TARGETING;
Game.STATE_WORMHOLE = STATE_WORMHOLE;
Game.STATE_DEAD = STATE_DEAD;
