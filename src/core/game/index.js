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
  STATE_BOSS,
  STATE_CONTRABAND,
  BOARD_W,
  BOARD_H,
  INITIAL_SNAKE_LENGTH,
  BASE_TICK_MS,
  FOOD_REQUIRED_BASE,
  FOOD_REQUIRED_PER_LEVEL,
  BOSS_FOOD_INTERVAL,
  BOSS_TICK_MS,
  BOSS_HP,
  BOSS_BODY_HP,
  BOSS_FOOD_REWARD,
  BOSS_FIRE_INTERVAL,
  BOSS_FIRE_INTERVAL_P2,
  BOSS_FIRE_INTERVAL_P3,
  BOSS_INVUL_TICKS,
  BOSS_INTRO_TICKS,
  BOSS_PHASE_INTRO,
  BOSS_PHASE_1,
  BOSS_PHASE_2,
  BOSS_PHASE_3,
  BOSS_PHASE2_HP,
  BOSS_PHASE3_HP,
  BOSS_SPECIAL_INTERVAL,
} from "./constants.js";
import { selectContraband, confirmContraband } from "./contraband-draft.js";

// Method imports — attached to prototype below
import {
  tick,
  _handleFoodEaten,
  _peekNextCell,
  _recalcTickMs,
  _placeRandomFood,
  _placeBossFood,
} from "./tick.js";
import { selectDraft, toggleMutation, _applyUpgrade, confirmDraft } from "./draft.js";
import { cycleConsumable, useConsumable, cancelTargeting } from "./consumables.js";
import { _drawBoard, _drawBossArena, renderFrame } from "./render.js";
import { _bossTick, _enterBossFight, _exitBossVictory, _exitBossDeath } from "./boss-tick.js";

// ── Game class ────────────────────────────────────────────────────

/**
 * Game state machine: orchestrates tick loop, draft, rendering, and input dispatch.
 */
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
    this.bossFoodCharge = 0;
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
    this._heldDirection = null;

    this._playerFacing = { dx: 1, dy: 0 };
    this._playerSpawnY = 0;
    this._boss = null;
    this._fight = null;
    this._lastBossTickTime = 0;
    this._lastBossMoveTime = 0;
    this._projectiles = [];
    this._playerBullets = [];
    this._playerFireCounter = 0;
    this._playerInvulTicks = 0;
    this._playerStaggerTicks = 0;
    this._gomuShieldActive = false;
    this._jailFreeReady = false;
    this._jailFreeCooldown = 0;
    this._bossModifiers = [];
    this._bossSpecialCounter = 0;
    this._contraband = [];
    this._contrabandPool = null;
    this._contrabandSelection = 0;
    this.manifest = { arenas: [], bossShapes: {} };
  }

  /** Resets all state and begins a new run from level 1. */
  startRun() {
    this.state = STATE_PLAYING;
    this.score = 0;
    this.boardIndex = 1;
    this.level = 1;
    this.foodEaten = 0;
    this.foodRequired = FOOD_REQUIRED_BASE + FOOD_REQUIRED_PER_LEVEL;
    this.upgrades.reset();
    // Only install the default crystalline generators when none have been pre-set.
    // Tests that stub these before calling startRun() will have their stubs preserved.
    // confirm() always resets them to crystalline first, so real-game restarts still
    // get a fresh crystalline board.
    if (!this.generateBoard) {
      this.generateBoard = crystallineGenerate;
    }
    if (!this.advanceBoard) {
      this.advanceBoard = crystallineAdvance;
    }
    this._selectedConsumable = 0;
    this._draftsSinceMutation = 0;
    this.bossFoodCharge = 0;
    this._bombCursor = null;
    this._wormholeCursor = null;
    this._wormholePhase = 0;
    this._wormholeA = null;
    this._wormholeB = null;
    this.mechanic = null;
    this._heldDirection = null;

    this._playerFacing = { dx: 1, dy: 0 };
    this._playerSpawnY = 0;
    this._boss = null;
    this._fight = null;
    this._projectiles = [];
    this._playerInvulTicks = 0;
    this._playerStaggerTicks = 0;
    this._gomuShieldActive = false;
    this._jailFreeReady = false;
    this._jailFreeCooldown = 0;
    this._bossModifiers = [];
    this._bossSpecialCounter = 0;
    this._contraband = [];
    this._contrabandPool = null;
    this._contrabandSelection = 0;
    this.runTime = 0;
    this._recalcTickMs();
    this.startTime = Date.now();
    this.lastTickTime = Date.now();
    this.snake.snakeLength = INITIAL_SNAKE_LENGTH;
    this.board.bossFoodX = -1;
    this.board.bossFoodY = -1;

    if (this.generateBoard) {
      this.generateBoard(this);
    } else {
      this._resetBoardSimple();
    }
  }

  /** Fallback board reset when no generator is assigned. */
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

  /**
   * Dispatches directional input to the appropriate handler based on game state.
   *
   * @param {number} dx
   * @param {number} dy
   */
  onInput(dx, dy) {
    if (this.state === STATE_PLAYING) {
      this.snake.setNextDirection(dx, dy);
    } else if (this.state === STATE_BOSS) {
      // Left/right only — reject vertical unless snake_hungry is active
      if (dy !== 0 && !this._contraband.some((c) => c.id === "snake_hungry")) {
        return;
      }
      // Latest key wins — just set the held direction
      this._heldDirection = { dx, dy };
      this._playerFacing = { dx: 0, dy: -1 }; // always face up
    } else if (this.state === STATE_TARGETING) {
      moveCursor(this, dx, dy);
    } else if (this.state === STATE_WORMHOLE) {
      moveWormholeCursor(this, dx, dy);
    }
  }

  /**
   * Clears the held direction during boss fights when the matching key is released.
   * If the released direction doesn't match the current held direction, it's a no-op.
   *
   * @param {number} dx
   * @param {number} dy
   */
  onInputRelease(dx, dy) {
    if (this._heldDirection && this._heldDirection.dx === dx && this._heldDirection.dy === dy) {
      this._heldDirection = null;
    }
  }

  /** Handles confirm action (start game, restart, confirm bomb/wormhole). */
  confirm() {
    if (this.state === STATE_START || this.state === STATE_DEAD) {
      // Always start a fresh crystalline run when the player confirms from
      // the start screen or after death, regardless of any generators that
      // may have been set by a previous run's mutation draft.
      this.generateBoard = crystallineGenerate;
      this.advanceBoard = crystallineAdvance;
      this.startRun();
    } else if (this.state === STATE_TARGETING) {
      confirmBomb(this);
    } else if (this.state === STATE_WORMHOLE) {
      confirmWormholePlacement(this);
    }
  }

  /**
   * Formats seconds as MM:SS.
   *
   * @param {number} secs
   * @returns {string}
   */
  static formatTime(secs) {
    const m = String(Math.floor(secs / 60)).padStart(2, "0");
    const s = String(Math.floor(secs % 60)).padStart(2, "0");
    return m + ":" + s;
  }
}

// ── Prototype methods ─────────────────────────────────────────────

Game.prototype.tick = tick;
Game.prototype._handleFoodEaten = _handleFoodEaten;
Game.prototype._peekNextCell = _peekNextCell;
Game.prototype._recalcTickMs = _recalcTickMs;
Game.prototype._placeRandomFood = _placeRandomFood;
Game.prototype._placeBossFood = _placeBossFood;
Game.prototype.selectContraband = selectContraband;
Game.prototype.confirmContraband = confirmContraband;
Game.prototype.selectDraft = selectDraft;
Game.prototype.toggleMutation = toggleMutation;
Game.prototype._applyUpgrade = _applyUpgrade;
Game.prototype.confirmDraft = confirmDraft;
Game.prototype.cycleConsumable = cycleConsumable;
Game.prototype.useConsumable = useConsumable;
Game.prototype.cancelTargeting = cancelTargeting;
Game.prototype._drawBoard = _drawBoard;
Game.prototype._drawBossArena = _drawBossArena;
Game.prototype.renderFrame = renderFrame;
Game.prototype._bossTick = _bossTick;
Game.prototype._enterBossFight = _enterBossFight;
Game.prototype._exitBossVictory = _exitBossVictory;
Game.prototype._exitBossDeath = _exitBossDeath;

// ── Static constants ──────────────────────────────────────────────

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
Game.STATE_BOSS = STATE_BOSS;
Game.BOSS_FOOD_INTERVAL = BOSS_FOOD_INTERVAL;
Game.BOSS_TICK_MS = BOSS_TICK_MS;
Game.BOSS_HP = BOSS_HP;
Game.BOSS_BODY_HP = BOSS_BODY_HP;
Game.BOSS_FOOD_REWARD = BOSS_FOOD_REWARD;
Game.BOSS_FIRE_INTERVAL = BOSS_FIRE_INTERVAL;
Game.BOSS_FIRE_INTERVAL_P2 = BOSS_FIRE_INTERVAL_P2;
Game.BOSS_FIRE_INTERVAL_P3 = BOSS_FIRE_INTERVAL_P3;
Game.BOSS_INVUL_TICKS = BOSS_INVUL_TICKS;
Game.BOSS_INTRO_TICKS = BOSS_INTRO_TICKS;
Game.BOSS_PHASE_INTRO = BOSS_PHASE_INTRO;
Game.BOSS_PHASE_1 = BOSS_PHASE_1;
Game.BOSS_PHASE_2 = BOSS_PHASE_2;
Game.BOSS_PHASE_3 = BOSS_PHASE_3;
Game.BOSS_PHASE2_HP = BOSS_PHASE2_HP;
Game.BOSS_PHASE3_HP = BOSS_PHASE3_HP;
Game.BOSS_SPECIAL_INTERVAL = BOSS_SPECIAL_INTERVAL;
Game.STATE_CONTRABAND = STATE_CONTRABAND;
