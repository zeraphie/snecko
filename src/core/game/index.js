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
import { ALL_BOSS_DEFS } from "../boss/bosses/index.js";
import { PRACTICE_HUB_ITEMS } from "./practice.js";
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
  STATE_PRACTICE_HUB,
  STATE_BOSS_PICKER,
  STATE_BOSS_RUSH_COMPLETE,
  STATE_DEAD_SOULSLIKE,
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
import {
  _bossTick,
  _bossOnInput,
  _bossOnAction,
  _enterBossFight,
  _exitBossVictory,
  _exitBossDeath,
} from "./boss-tick.js";

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
    /** State to return to when the mutation picker closes. */
    this._mutationPickerFrom = null;
    /** Highlighted index in the practice hub. */
    this._practiceHubSelection = 0;
    /** Highlighted index in the boss picker. */
    this._bossPickerSelection = 0;
    /**
     * Active practice mode, or null when not in a practice run.
     *
     *   null    — normal run (regular game flow)
     *   'single'— picker / random boss: victory returns to practice hub
     *   'rush'  — boss rush: victory chains contraband draft → next boss,
     *             completion shows the rush-complete screen
     */
    this._practiceMode = null;
    /** Boss IDs remaining in the current rush, in spawn order. */
    this._bossRushQueue = [];
    /** Total bosses in the rush (set on start) — used for rush HUD progress. */
    this._bossRushTotal = 0;
    /**
     * Boss id to spawn on the NEXT call to `_enterBossFight`. Cleared once
     * consumed. Practice flows set this to override the mutation-based
     * lookup; null means "use the mutation-keyed boss" (the normal flow).
     */
    this._practiceBossId = null;
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
    this._heldDirections = [];
    this._foxAnim = null;
    this._foxEggUsedThisAct = false;

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
    this.manifest = { arenas: [], bossShapes: {}, crystals: [], animations: {} };
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
    this._heldDirections = [];
    this._foxAnim = null;
    this._foxEggUsedThisAct = false;
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
    // Soulslike tracks a stack of held directions so a release falls
    // back to the previously-held direction (e.g. hold W, tap A, release
    // A → keep going up). Other styles keep last-pressed-wins.
    if (this._soulslike && (dx !== 0 || dy !== 0)) {
      this._heldDirections = this._heldDirections.filter((d) => !(d.dx === dx && d.dy === dy));
      this._heldDirections.push({ dx, dy });
    }
    if (this.state === STATE_PLAYING) {
      this.snake.setNextDirection(dx, dy);
    } else if (this.state === STATE_BOSS) {
      this._bossOnInput(dx, dy);
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
    if (this._soulslike) {
      this._heldDirections = this._heldDirections.filter((d) => !(d.dx === dx && d.dy === dy));
      if (this._heldDirections.length > 0) {
        const top = this._heldDirections[this._heldDirections.length - 1];
        this._bossOnInput(top.dx, top.dy);
        return;
      }
    }
    if (this._heldDirection && this._heldDirection.dx === dx && this._heldDirection.dy === dy) {
      this._heldDirection = null;
      this._heldDirections = [];
    }
  }

  /**
   * Dispatches a discrete action input (stab / dodge / parry) to the
   * active boss style. Distinct from `onInput` (directional). Used
   * by soulslike; other styles ignore.
   *
   * @param {string} action — "stab" / "dodge" / "parry"
   */
  onPlayerAction(action) {
    if (this.state !== STATE_BOSS) {
      return;
    }
    // Fox cutscene freezes player input — J/K/L mash mid-freeze should
    // not queue dodges/stabs/parries that fire the moment it ends.
    if (this._foxAnim) {
      return;
    }
    this._bossOnAction(action);
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
        this.openPracticeHub();
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

  // ── Soulslike YOU DIED screen ─────────────────────────────────────

  /**
   * Dismisses the soulslike YOU DIED overlay. Routes through
   * `_exitBossDeath` (teardown + practice-hub transition) so the death
   * cleanup matches the rest of the boss-death path.
   */
  dismissYouDied() {
    if (this.state !== STATE_DEAD_SOULSLIKE) {
      return;
    }
    this._exitBossDeath(this.snake.deathCause || "boss");
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
    if (this.state !== STATE_MENU && this.state !== STATE_PRACTICE_HUB) {
      return;
    }
    // Remember where to return on close (Esc).
    this._mutationPickerFrom = this.state;
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

  /** Returns to the screen the picker was opened from. */
  closeMutationPicker() {
    if (this.state !== STATE_MUTATION_PICKER) {
      return;
    }
    this.state = this._mutationPickerFrom ?? STATE_MENU;
    this._mutationPickerFrom = null;
  }

  // ── Practice hub + boss picker + boss rush ───────────────────────
  //
  // The practice hub branches to four flows:
  //   mutations    — opens the existing mutation picker (one-off run)
  //   bossPicker   — picks a specific boss to fight, returns to hub on win
  //   randomBoss   — picks a random boss the same way
  //   bossRush     — fights all bosses back-to-back in shuffled order,
  //                  with a contraband draft between fights
  //
  // The boss-fight flow is the same as the normal in-run boss; what
  // changes is what happens on victory. `_practiceMode` is the switch:
  // 'single' returns to the hub; 'rush' continues into the next boss
  // (or the completion screen if the queue is empty).

  /** Opens the practice hub from the menu's "Practice" item. */
  openPracticeHub() {
    if (this.state !== STATE_MENU) {
      return;
    }
    this._practiceHubSelection = 0;
    this.state = STATE_PRACTICE_HUB;
  }

  /**
   * Sets the highlighted hub index, clamped to the items array.
   *
   * @param {number} index
   */
  selectPracticeHub(index) {
    if (this.state !== STATE_PRACTICE_HUB) {
      return;
    }
    const max = PRACTICE_HUB_ITEMS.length - 1;
    this._practiceHubSelection = Math.max(0, Math.min(index, max));
  }

  /** Activates the highlighted hub item. */
  confirmPracticeHub() {
    if (this.state !== STATE_PRACTICE_HUB) {
      return;
    }
    const item = PRACTICE_HUB_ITEMS[this._practiceHubSelection];
    if (!item) {
      return;
    }
    switch (item.id) {
      case "mutations":
        this.openMutationPicker();
        break;
      case "bossPicker":
        this.openBossPicker();
        break;
      case "randomBoss":
        this.startRandomPracticeBoss();
        break;
      case "bossRush":
        this.startBossRush();
        break;
    }
  }

  /** Returns to the menu from the practice hub. */
  closePracticeHub() {
    if (this.state !== STATE_PRACTICE_HUB) {
      return;
    }
    this.state = STATE_MENU;
  }

  /** Opens the boss picker from the practice hub. */
  openBossPicker() {
    if (this.state !== STATE_PRACTICE_HUB) {
      return;
    }
    this._bossPickerSelection = 0;
    this.state = STATE_BOSS_PICKER;
  }

  /**
   * Sets the highlighted boss-picker index.
   *
   * @param {number} index
   */
  selectBossPicker(index) {
    if (this.state !== STATE_BOSS_PICKER) {
      return;
    }
    const max = ALL_BOSS_DEFS.length - 1;
    this._bossPickerSelection = Math.max(0, Math.min(index, max));
  }

  /** Spawns the highlighted boss as a single-fight practice run. */
  confirmBossPicker() {
    if (this.state !== STATE_BOSS_PICKER) {
      return;
    }
    const def = ALL_BOSS_DEFS[this._bossPickerSelection];
    if (!def) {
      return;
    }
    this._startPracticeBoss(def.id);
  }

  /** Returns to the practice hub from the boss picker. */
  closeBossPicker() {
    if (this.state !== STATE_BOSS_PICKER) {
      return;
    }
    this.state = STATE_PRACTICE_HUB;
  }

  /** Picks a random boss and drops into a single-fight practice run. */
  startRandomPracticeBoss() {
    if (ALL_BOSS_DEFS.length === 0) {
      return;
    }
    const idx = Math.floor(Math.random() * ALL_BOSS_DEFS.length);
    this._startPracticeBoss(ALL_BOSS_DEFS[idx].id);
  }

  /**
   * Builds a shuffled queue of every boss and drops into the first fight.
   * Subsequent bosses are spawned by `confirmContraband` between fights.
   */
  startBossRush() {
    const queue = ALL_BOSS_DEFS.map((d) => d.id);
    // Fisher–Yates so the order varies each rush.
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    this._bossRushQueue = queue;
    this._bossRushTotal = queue.length;
    this._practiceMode = "rush";
    this._spawnNextRushBoss();
  }

  /**
   * Pops the next boss off the rush queue and enters its fight, or shows
   * the completion screen if the queue is empty.
   */
  _spawnNextRushBoss() {
    const next = this._bossRushQueue.shift();
    if (!next) {
      this._practiceMode = null;
      this._bossRushTotal = 0;
      this.state = STATE_BOSS_RUSH_COMPLETE;
      return;
    }
    this._practiceBossId = next;
    this._enterPracticeBossFight();
  }

  /**
   * Sets up a single-fight practice run against `bossId`, then enters the
   * fight. On victory, `_exitBossVictory` returns to the practice hub.
   *
   * @param {string} bossId
   */
  _startPracticeBoss(bossId) {
    this._practiceMode = "single";
    this._practiceBossId = bossId;
    this._enterPracticeBossFight();
  }

  /** Dismisses the rush-complete splash and returns to the practice hub. */
  closeBossRushComplete() {
    if (this.state !== STATE_BOSS_RUSH_COMPLETE) {
      return;
    }
    this.state = STATE_PRACTICE_HUB;
  }

  /**
   * Resets the run-state fields a boss fight depends on (contraband stash,
   * upgrades, snake) so practice fights start from a clean slate, then
   * delegates to `_enterBossFight`. `_enterBossFight` consumes
   * `_practiceBossId` to spawn the requested boss instead of the
   * mutation-keyed one.
   */
  _enterPracticeBossFight() {
    this._contraband = [];
    this.upgrades = new UpgradeState();
    this.snake = new Snake();
    this.runTime = 0;
    this.score = 0;
    this.lastTickTime = 0;
    this.startTime = Date.now();
    this._enterBossFight();
  }

  // ── End of practice helpers ─────────────────────────────────────

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
Game.prototype._bossOnInput = _bossOnInput;
Game.prototype._bossOnAction = _bossOnAction;
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
Game.STATE_DEAD_SOULSLIKE = STATE_DEAD_SOULSLIKE;
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
Game.STATE_PRACTICE_HUB = STATE_PRACTICE_HUB;
Game.STATE_BOSS_PICKER = STATE_BOSS_PICKER;
Game.STATE_BOSS_RUSH_COMPLETE = STATE_BOSS_RUSH_COMPLETE;
