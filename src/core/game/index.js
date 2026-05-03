// game.js — Game class: state machine, orchestrates tick/draft/render

import { Grid } from "../grid/index.js";
import { Snake } from "../snake/index.js";
import { UpgradeState } from "../upgrades/state.js";
import { mixSeeds, hashString, splitmix32 } from "../rng.js";
import { SUBSEED_FOOD } from "../seed-streams.js";
import { moveCursor, confirmBomb } from "../upgrades/consumables/bomb.js";
import { moveWormholeCursor, confirmWormholePlacement } from "../upgrades/consumables/wormhole.js";
import {
  generateGrid as crystallineGenerate,
  advanceGrid as crystallineAdvance,
} from "../generation/index.js";
import { MUTATIONS, getMutationGenerator } from "../generation/registry.js";
import {
  recordScore,
  loadLeaderboard,
  loadPlayerName,
  savePlayerName,
  MAX_NAME_LENGTH,
} from "../leaderboard/index.js";
import {
  STATE_START,
  STATE_PLAYING,
  STATE_DRAFT,
  STATE_TARGETING,
  STATE_WORMHOLE,
  STATE_DEAD,
  STATE_BOSS,
  STATE_CONTRABAND,
  STATE_SEED_INPUT,
  STATE_MENU,
  STATE_MUTATION_PICKER,
  STATE_LEADERBOARD,
  STATE_NAME_INPUT,
  DEATH_GIVE_UP,
  GRID_W,
  GRID_H,
  INITIAL_SNAKE_LENGTH,
  BASE_TICK_MS,
  FOOD_REQUIRED_BASE,
  FOOD_REQUIRED_PER_ACT,
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

/** Maximum length of the custom-seed input buffer. */
const MAX_SEED_INPUT_LENGTH = 48;

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
import { _drawGrid, _drawBossArena, renderFrame } from "./render.js";
import { _bossTick, _enterBossFight, _exitBossVictory, _exitBossDeath } from "./boss-tick.js";

// ── Game class ────────────────────────────────────────────────────

/**
 * Game state machine: orchestrates tick loop, draft, rendering, and input dispatch.
 */
export class Game {
  constructor() {
    this.state = STATE_START;
    this.grid = new Grid(GRID_W, GRID_H);
    this.snake = new Snake();
    this.score = 0;
    this.actIndex = 1;
    this.foodEaten = 0;
    this.foodRequired = FOOD_REQUIRED_BASE + FOOD_REQUIRED_PER_ACT;
    this.runTime = 0;
    this.tickMs = BASE_TICK_MS;
    this.lastTickTime = 0;
    this.startTime = 0;
    /** 32-bit deterministic seed for the run; rolled at startRun. */
    this.runSeed = 0;
    /** Per-act seed derived from runSeed + actIndex via mixSeeds. */
    this.actSeed = 0;
    /** Stateful PRNG for food placement; re-seeded each act from actSeed. */
    this.foodRand = null;
    /** Optional override for runSeed — used by the custom-seed input path.
     *  Set externally before calling startRun(); cleared after consumption. */
    this._pendingRunSeed = null;
    /** Buffer for the custom-seed input UI (STATE_SEED_INPUT). */
    this._seedInput = "";
    /** Menu items shown in STATE_MENU — array of `{ id }` objects. Labels
     *  resolved at render time from `LABELS.menu[id]`. */
    this._menuItems = [];
    /** Highlighted index in `_menuItems`. */
    this._menuSelection = 0;
    /** State to return to when the menu is dismissed (Esc). */
    this._menuFrom = null;
    /** Wall-clock timestamp the pause menu was opened (null when not paused).
     *  Used to compensate `startTime` / `lastTickTime` on resume so the
     *  pause duration doesn't inflate the run timer. */
    this._pauseStartTime = null;
    /** Mutation the next run will start under. Persists across runs.
     *  Cycled by the menu's mutation picker. Default crystalline. */
    this._selectedMutation = "crystalline";
    /** Highlighted index in the mutation picker. */
    this._mutationPickerSelection = 0;
    /** Snapshot of the leaderboard for the current view (set on open). */
    this._leaderboardEntries = [];
    /** State to return to when the leaderboard view is dismissed. */
    this._leaderboardFrom = null;
    /** True once the current run has been recorded — prevents double-counting. */
    this._runRecorded = false;
    /** Snapshot of the just-finished run, awaiting the player's name. */
    this._pendingRunRecord = null;
    /** Buffer for the post-run name-input UI (STATE_NAME_INPUT). */
    this._nameInput = "";
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
    this.generateGrid = null;
    this.advanceGrid = null;
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
    this.manifest = { arenas: [], bossShapes: {}, crystals: [] };
  }

  /** Resets all state and begins a new run from act 1. */
  startRun() {
    this.state = STATE_PLAYING;
    this.score = 0;
    this.actIndex = 1;
    this.foodEaten = 0;
    this.foodRequired = FOOD_REQUIRED_BASE + FOOD_REQUIRED_PER_ACT;
    // Roll a fresh runSeed unless the custom-seed path stashed one.
    // Stored unsigned so the value matches hashString / mixSeeds output.
    if (this._pendingRunSeed !== null) {
      this.runSeed = this._pendingRunSeed >>> 0;
      this._pendingRunSeed = null;
    } else {
      this.runSeed = ((Math.random() * 0x100000000) | 0) >>> 0;
    }
    this.actSeed = mixSeeds(this.runSeed, this.actIndex);
    this.foodRand = splitmix32(mixSeeds(this.actSeed, SUBSEED_FOOD));
    this.upgrades.reset();
    // Only install the default crystalline generators when none have been pre-set.
    // Tests that stub these before calling startRun() will have their stubs preserved.
    // confirm() always resets them to crystalline first, so real-game restarts still
    // get a fresh crystalline grid.
    if (!this.generateGrid) {
      this.generateGrid = crystallineGenerate;
    }
    if (!this.advanceGrid) {
      this.advanceGrid = crystallineAdvance;
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
    this._runRecorded = false;
    this._pendingRunRecord = null;
    this._nameInput = "";

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
    this.grid.bossFoodX = -1;
    this.grid.bossFoodY = -1;

    if (this.generateGrid) {
      this.generateGrid(this);
    } else {
      this._resetGridSimple();
    }
  }

  /** Fallback grid reset when no generator is assigned. */
  _resetGridSimple() {
    this.grid.clearMasks("wall");
    this.grid.clearMasks("snake");
    this.grid.clearMasks("reserved");
    this.grid.terrain.fill(0);

    const cx = Math.floor(GRID_W / 2);
    const cy = Math.floor(GRID_H / 2);
    this.snake.init(this.grid, cx, cy, this.snake.snakeLength, 1, 0);

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

  /**
   * Opens the in-game menu from the start or dead screen. The menu items
   * shown vary by context; future expansions (resume, language, keybindings)
   * just add entries here.
   */
  openMenu() {
    if (this.state !== STATE_START && this.state !== STATE_DEAD && this.state !== STATE_PLAYING) {
      return;
    }
    this._menuFrom = this.state;
    if (this.state === STATE_PLAYING) {
      // Pause-menu variant: resume the run or give up. Practice / custom
      // seed stay on the start/dead menus to keep the pause UI minimal.
      this._pauseStartTime = Date.now();
      this._menuItems = [{ id: "resume" }, { id: "give_up" }];
    } else if (this.state === STATE_DEAD) {
      this._menuItems = [
        { id: "restart" },
        { id: "practice" },
        { id: "leaderboard" },
        { id: "seed" },
      ];
    } else {
      this._menuItems = [
        { id: "begin" },
        { id: "practice" },
        { id: "leaderboard" },
        { id: "seed" },
      ];
    }
    this._menuSelection = 0;
    this.state = STATE_MENU;
  }

  /** Closes the menu and returns to the screen it was opened from. */
  closeMenu() {
    if (this.state !== STATE_MENU) {
      return;
    }
    const returnTo = this._menuFrom ?? STATE_START;
    if (returnTo === STATE_PLAYING && this._pauseStartTime !== null) {
      // Compensate for pause duration so runtime / lastTickTime aren't
      // skewed by wall-clock time spent in the menu.
      const pauseMs = Date.now() - this._pauseStartTime;
      this.startTime += pauseMs;
      this.lastTickTime = Date.now();
      this._pauseStartTime = null;
    }
    this.state = returnTo;
    this._menuFrom = null;
  }

  /**
   * Sets the highlighted menu index, clamped to the items array.
   *
   * @param {number} index
   */
  selectMenu(index) {
    if (this.state !== STATE_MENU) {
      return;
    }
    if (this._menuItems.length === 0) {
      return;
    }
    this._menuSelection = Math.max(0, Math.min(index, this._menuItems.length - 1));
  }

  /** Activates the highlighted menu item. */
  confirmMenu() {
    if (this.state !== STATE_MENU) {
      return;
    }
    const item = this._menuItems[this._menuSelection];
    if (!item) {
      return;
    }
    switch (item.id) {
      case "begin":
      case "restart":
        // Reset generators to crystalline (matches confirm() behaviour
        // when starting from start/dead screens).
        this.generateGrid = crystallineGenerate;
        this.advanceGrid = crystallineAdvance;
        this.startRun();
        break;
      case "resume":
        this.closeMenu();
        break;
      case "give_up":
        this.snake.alive = false;
        this.snake.deathCause = DEATH_GIVE_UP;
        this._pauseStartTime = null;
        this._menuFrom = null;
        this._endRun();
        break;
      case "practice":
        this.openMutationPicker();
        break;
      case "leaderboard":
        this.openLeaderboard();
        break;
      case "seed":
        this._seedInput = "";
        this.state = STATE_SEED_INPUT;
        break;
    }
  }

  // ── Run end → name input → leaderboard ───────────────────────────

  /**
   * End-of-run handler called from every death path (snake, boss, give-up).
   * Snapshots the run's stats, prefills the name input with the player's
   * last-used name, and routes to STATE_NAME_INPUT. The actual record
   * happens after the player confirms the name (`confirmNameInput`).
   *
   * Idempotent: runs that are already recorded or already pending a
   * name-input are no-ops.
   */
  _endRun() {
    if (this._runRecorded || this._pendingRunRecord) {
      return;
    }
    this.runTime = (Date.now() - this.startTime) / 1000;
    this._pendingRunRecord = {
      act: this.actIndex,
      progress: this.foodEaten,
      foodRequired: this.foodRequired,
      bites: this.score,
      time: this.runTime,
    };
    this._nameInput = loadPlayerName();
    this.state = STATE_NAME_INPUT;
  }

  /** Appends a character to the name buffer (length-capped). */
  appendNameInput(ch) {
    if (this.state !== STATE_NAME_INPUT) {
      return;
    }
    if (this._nameInput.length >= MAX_NAME_LENGTH) {
      return;
    }
    this._nameInput += ch;
  }

  /** Removes the last character from the name buffer. */
  backspaceNameInput() {
    if (this.state !== STATE_NAME_INPUT) {
      return;
    }
    this._nameInput = this._nameInput.slice(0, -1);
  }

  /**
   * Confirms the entered name, saves it as the persistent default,
   * records the pending run with the name, and transitions to
   * STATE_DEAD. Empty name records as "Anonymous".
   */
  confirmNameInput() {
    if (this.state !== STATE_NAME_INPUT) {
      return;
    }
    const trimmed = this._nameInput.trim();
    const name = trimmed.length > 0 ? trimmed.slice(0, MAX_NAME_LENGTH) : "Anonymous";
    if (trimmed.length > 0) {
      savePlayerName(name);
    }
    this._finalizeRunRecord(name);
    this.state = STATE_DEAD;
  }

  /** Cancel the name input — record as "Anonymous" and proceed to dead. */
  cancelNameInput() {
    if (this.state !== STATE_NAME_INPUT) {
      return;
    }
    this._finalizeRunRecord("Anonymous");
    this.state = STATE_DEAD;
  }

  _finalizeRunRecord(name) {
    if (!this._pendingRunRecord) {
      return;
    }
    recordScore({ name, ...this._pendingRunRecord });
    this._pendingRunRecord = null;
    this._runRecorded = true;
    this._nameInput = "";
  }

  // ── Leaderboard screen ────────────────────────────────────────────

  /** Opens the leaderboard view from the menu. */
  openLeaderboard() {
    if (this.state !== STATE_MENU) {
      return;
    }
    this._leaderboardFrom = STATE_MENU;
    this._leaderboardEntries = loadLeaderboard();
    this.state = STATE_LEADERBOARD;
  }

  /** Returns from the leaderboard back to the menu. */
  closeLeaderboard() {
    if (this.state !== STATE_LEADERBOARD) {
      return;
    }
    this.state = this._leaderboardFrom ?? STATE_MENU;
    this._leaderboardFrom = null;
  }

  // ── Mutation picker (practice screen, reachable from the menu) ────
  //
  // The mutation picker is a one-off action: picking a mutation starts a
  // fresh practice run in that mutation. It does NOT change the default
  // run that `confirm()` starts from the start/dead screens — those stay
  // on crystalline. `_selectedMutation` is a UX hint (which row the picker
  // pre-highlights when reopened); it has no effect on normal runs.

  /**
   * Opens the mutation picker. Reachable from the menu's "Practice"
   * item.
   */
  openMutationPicker() {
    if (this.state !== STATE_MENU) {
      return;
    }
    // Highlight the currently-selected mutation by default.
    const ids = Object.keys(MUTATIONS);
    const idx = ids.indexOf(this._selectedMutation);
    this._mutationPickerSelection = idx >= 0 ? idx : 0;
    this.state = STATE_MUTATION_PICKER;
  }

  /**
   * Sets the highlighted mutation-picker index, clamped to the registry.
   *
   * @param {number} index
   */
  selectMutationPicker(index) {
    if (this.state !== STATE_MUTATION_PICKER) {
      return;
    }
    const ids = Object.keys(MUTATIONS);
    if (ids.length === 0) {
      return;
    }
    this._mutationPickerSelection = Math.max(0, Math.min(index, ids.length - 1));
  }

  /**
   * Starts a fresh practice run in the highlighted mutation. Rolls a new
   * runSeed so the practice doesn't share state with the player's normal
   * progression. After death, the dead screen's Enter key returns to the
   * default crystalline run — practice is one-off.
   */
  confirmMutationPicker() {
    if (this.state !== STATE_MUTATION_PICKER) {
      return;
    }
    const ids = Object.keys(MUTATIONS);
    const id = ids[this._mutationPickerSelection];
    if (!id) {
      return;
    }
    this._selectedMutation = id; // remember last pick for next picker open
    const gen = getMutationGenerator(id) ?? MUTATIONS.crystalline;
    this.generateGrid = gen.generate;
    this.advanceGrid = gen.advance;
    // Fresh seed so practice runs don't share runSeed with anything else.
    this._pendingRunSeed = ((Math.random() * 0x100000000) | 0) >>> 0;
    this.startRun();
    if (id !== "crystalline") {
      this.upgrades.mutation = id;
    }
  }

  /** Returns to the menu without changing the selection. */
  closeMutationPicker() {
    if (this.state !== STATE_MUTATION_PICKER) {
      return;
    }
    this.state = STATE_MENU;
  }

  /**
   * Enters the custom-seed input mode directly. Used by the menu's
   * "Custom seed" action; not normally bound to a key.
   */
  enterSeedInput() {
    if (this.state !== STATE_START && this.state !== STATE_DEAD && this.state !== STATE_MENU) {
      return;
    }
    this._seedInput = "";
    this.state = STATE_SEED_INPUT;
  }

  /** Cancels seed input and returns to the start screen. */
  cancelSeedInput() {
    if (this.state !== STATE_SEED_INPUT) {
      return;
    }
    this._seedInput = "";
    this.state = STATE_START;
  }

  /**
   * Confirms the typed seed and starts the run. An empty buffer is treated
   * as "no custom seed" (rolls a random one); a non-empty buffer is hashed
   * via FNV-1a into a 32-bit runSeed.
   */
  confirmSeedInput() {
    if (this.state !== STATE_SEED_INPUT) {
      return;
    }
    if (this._seedInput.length > 0) {
      this._pendingRunSeed = hashString(this._seedInput);
    }
    this._seedInput = "";
    this.confirm();
  }

  /**
   * Appends a single printable character to the seed buffer. Capped at
   * MAX_SEED_INPUT_LENGTH to keep the rendered string within screen width.
   *
   * @param {string} ch — single ASCII printable character
   */
  appendSeedChar(ch) {
    if (this.state !== STATE_SEED_INPUT) {
      return;
    }
    if (typeof ch !== "string" || ch.length !== 1) {
      return;
    }
    if (this._seedInput.length >= MAX_SEED_INPUT_LENGTH) {
      return;
    }
    this._seedInput += ch;
  }

  /** Removes the last character from the seed buffer. */
  backspaceSeedInput() {
    if (this.state !== STATE_SEED_INPUT) {
      return;
    }
    this._seedInput = this._seedInput.slice(0, -1);
  }

  /** Handles confirm action (start game, restart, confirm bomb/wormhole). */
  confirm() {
    if (
      this.state === STATE_START ||
      this.state === STATE_DEAD ||
      this.state === STATE_SEED_INPUT
    ) {
      // Always start a fresh crystalline run when the player confirms
      // from the start screen, after death, or from the custom-seed
      // input. The menu's mutation picker is a separate practice mode;
      // it doesn't change the default run.
      this.generateGrid = crystallineGenerate;
      this.advanceGrid = crystallineAdvance;
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
Game.prototype._drawGrid = _drawGrid;
Game.prototype._drawBossArena = _drawBossArena;
Game.prototype.renderFrame = renderFrame;
Game.prototype._bossTick = _bossTick;
Game.prototype._enterBossFight = _enterBossFight;
Game.prototype._exitBossVictory = _exitBossVictory;
Game.prototype._exitBossDeath = _exitBossDeath;

// ── Static constants ──────────────────────────────────────────────

Game.GRID_W = GRID_W;
Game.GRID_H = GRID_H;
Game.INITIAL_SNAKE_LENGTH = INITIAL_SNAKE_LENGTH;
Game.FOOD_REQUIRED_BASE = FOOD_REQUIRED_BASE;
Game.FOOD_REQUIRED_PER_ACT = FOOD_REQUIRED_PER_ACT;
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
Game.STATE_MUTATION_PICKER = STATE_MUTATION_PICKER;
Game.STATE_LEADERBOARD = STATE_LEADERBOARD;
Game.STATE_NAME_INPUT = STATE_NAME_INPUT;
