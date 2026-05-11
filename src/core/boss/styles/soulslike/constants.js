// constants.js — Soulslike v1 starting numbers from PLAN.soulslike-adr.md.
//
// These are starting values for playtesting, not final. Tune through
// play. Each constant should be cheap to change here without touching
// the rest of the module.

// ── Arena ─────────────────────────────────────────────────────────

/**
 * Inner playable area is a SIZE × SIZE square inside the 31×31 grid,
 * surrounded by a 1-cell wall ring (matches the .arena Box layout).
 */
export const ARENA_INNER_SIZE = 29;
/** Top-left x of the inner playable area on the 31×31 grid. */
export const ARENA_INNER_X0 = 1;
/** Top-left y of the inner playable area on the 31×31 grid. */
export const ARENA_INNER_Y0 = 1;

/**
 * Snake (1×1 fighter) spawns at the south, centred horizontally. Y
 * is hardcoded (rather than `ARENA_INNER_Y0 + ARENA_INNER_SIZE - 1`)
 * so the spawn sits a couple cells inside the south wall — gives the
 * scenery on the southern row room to breathe.
 */
export const SNAKE_SPAWN_X = ARENA_INNER_X0 + Math.floor(ARENA_INNER_SIZE / 2);
export const SNAKE_SPAWN_Y = 24;
/** Snake initial facing — north, looking toward the boss. */
export const SNAKE_SPAWN_DX = 0;
export const SNAKE_SPAWN_DY = -1;

/**
 * Boss footprint is 2×2; spawns near the north, centred horizontally.
 * Hardcoded Y (rather than `ARENA_INNER_Y0`) to keep room above for
 * the tree and other top-row scenery.
 */
export const BOSS_SIZE = 2;
export const BOSS_SPAWN_X = ARENA_INNER_X0 + Math.floor(ARENA_INNER_SIZE / 2) - 1;
export const BOSS_SPAWN_Y = 5;

/** Initial boss facing — south, toward the snake's south spawn. */
export const BOSS_INITIAL_FACING_DX = 0;
export const BOSS_INITIAL_FACING_DY = 1;

// ── Attack reach (cells of glaive extension during execute) ─────
//
// The glaive is 1 cell longer than the snake's knife. Reach values are
// the cell offset from the boss in the facing direction at the swing's
// max extension. Hit detection compares the moving tip cell to the
// snake each execute tick.
export const SWEEP_REACH = 1; // arcs across 3 cells in front of boss
export const REGULAR_REACH = 2; // straight thrust
export const OVERHEAD_REACH = 3; // heaviest, longest reach
export const KICK_REACH = 1; // adjacent shove

// ── Snake fighter ─────────────────────────────────────────────────

export const SNAKE_HP_MAX = 5;

// ── Stamina ───────────────────────────────────────────────────────

export const STAMINA_MAX = 5;
/** Boss sub-ticks (120 ms each) per +1 stamina once regen is active. */
export const STAMINA_REGEN_TICKS = 10;
/** Boss sub-ticks of "no regen" after any action consumes stamina. */
export const STAMINA_REGEN_DELAY_TICKS = 6;

// ── Dodge ─────────────────────────────────────────────────────────

/** Stamina consumed per dodge — heaviest player action (matches Souls priority). */
export const DODGE_COST = 2;
/** Cells the snake travels per dodge in the held / facing direction. */
export const DODGE_DISTANCE = 2;
/** Boss sub-ticks of damage immunity at the start of the dodge animation. */
export const DODGE_IFRAMES = 4;
/** Boss sub-ticks of action lockout after iframes (no stab/dodge/parry). */
export const DODGE_RECOVERY_TICKS = 4;

// ── Parry / stagger ───────────────────────────────────────────────

/** Stamina consumed per parry attempt. Cheap to attempt, costly when whiffed. */
export const PARRY_COST = 1;
/** Boss sub-ticks the parry window stays open after L is pressed (D5 locked). */
export const PARRY_WINDOW_TICKS = 2;
/** Boss sub-ticks the boss is frozen + vulnerable to amplified hits after a parry. */
export const STAGGER_TICKS = 12;
/** Damage multiplier on player hits while the boss is staggered. */
export const STAGGER_MULTIPLIER = 3;

// ── Boss attacks ──────────────────────────────────────────────────

// D7's 90/10 split: 90% of the time boss plays the distance-matched
// attack; 10% it rolls a different bracket for unpredictability.
export const ATTACK_ALTERNATE_PROBABILITY = 0.1;

// D17 kick gating: kick fires only if a recent attack just finished.
// Threshold is in boss sub-ticks since the last attack ended.
export const KICK_RECENT_THRESHOLD = 18; // ~2 s at 120 ms/tick

// Per-attack timings (windup → execute → recovery).
export const SWEEP_WINDUP_TICKS = 6;
export const SWEEP_EXECUTE_TICKS = 3;
export const SWEEP_RECOVERY_TICKS = 3;

export const REGULAR_WINDUP_TICKS = 8;
export const REGULAR_EXECUTE_TICKS = 3;
export const REGULAR_RECOVERY_TICKS = 3;

export const OVERHEAD_WINDUP_TICKS = 12;
export const OVERHEAD_EXECUTE_TICKS = 4;
export const OVERHEAD_RECOVERY_TICKS = 6;

export const KICK_WINDUP_TICKS = 10;
export const KICK_EXECUTE_TICKS = 3;
export const KICK_RECOVERY_TICKS = 4;

/** Damage each boss attack deals to the snake on a clean hit. */
export const ATTACK_DAMAGE = 1;

// ── Phases ────────────────────────────────────────────────────────

/** HP ratio at which the boss escalates to phase 2. */
export const PHASE_2_HP_RATIO = 0.6;
/** HP ratio at which the boss escalates to phase 3. */
export const PHASE_3_HP_RATIO = 0.3;
/** Boss sub-ticks the boss is paused + immune at each phase transition (D10). */
export const PHASE_PAUSE_TICKS = 12;

// ── Death sequence (D15 / Step 13) ─────────────────────────────────

/** Boss sub-ticks the death pose holds before the YOU DIED overlay shows. */
export const DEATH_HOLD_TICKS = 16;
/**
 * Boss sub-ticks the boss-death pose holds after `bossHp` reaches 0,
 * before victory transitions out of the fight. Lets the killing-blow
 * frame breathe so the player can read it as "I won".
 */
export const BOSS_DEATH_HOLD_TICKS = 16;

// ── Player movement ───────────────────────────────────────────────

/**
 * Held-direction snake movement cadence in real ms. Roughly a fifth
 * of `BOSS_MOVE_MS` (~33 ms) so the soulslike fighter moves
 * deliberately. Dodge isn't affected: it does its own multi-cell
 * move in one frame.
 */
export const SOULSLIKE_MOVE_MS = 150;

// ── Boss movement ─────────────────────────────────────────────────
//
// The boss has three movement modes:
//   - "idle":       strafes perpendicular to the snake-boss vector,
//                   holding distance. Skips the strafe if the snake is
//                   actively closing the gap (boss doesn't run away
//                   from a committed approach in idle).
//   - "aggressive": closes the distance — charges 1 cell toward the
//                   snake on each move tick. Triggered when the player
//                   stays far for `FARNESS_TRIGGER_TICKS`.
//   - "defensive":  retreats 1 cell away from the snake. Triggered
//                   when the player has been close for
//                   `CLOSENESS_TRIGGER_TICKS`, OR when the boss has
//                   taken `HITS_FOR_DEFENSIVE` hits within the decay
//                   window.

/** Boss sub-ticks between movement attempts (one move every ~480 ms). */
export const MOVE_INTERVAL_TICKS = 4;
/** Manhattan distance considered "close" — triggers defensive mode if sustained. */
export const CLOSENESS_THRESHOLD = 1;
/** Manhattan distance considered "far" — triggers aggressive mode if sustained. */
export const FARNESS_THRESHOLD = 4;
/** Sustained close ticks needed to flip boss to defensive. */
export const CLOSENESS_TRIGGER_TICKS = 18;
/** Sustained far ticks needed to flip boss to aggressive. */
export const FARNESS_TRIGGER_TICKS = 30;
/** Recent hits count needed to flip boss to defensive. */
export const HITS_FOR_DEFENSIVE = 3;
/** Boss sub-ticks before the hit counter resets (sliding window). */
export const HIT_DECAY_TICKS = 60;
/** How long the boss stays defensive after triggering. */
export const DEFENSIVE_DURATION_TICKS = 24;
/** How long the boss stays aggressive after triggering. */
export const AGGRESSIVE_DURATION_TICKS = 24;

// ── Waterfowl special (D9) ────────────────────────────────────────

/** Boss sub-ticks the boss locks aim before each jump. The bait window. */
export const WATERFOWL_LOCK_TICKS = 8;
/**
 * Boss sub-ticks the dash phase takes — boss linearly interpolates
 * from its current position to the locked target across these ticks
 * instead of teleporting in 1 frame.
 */
export const WATERFOWL_DASH_TICKS = 3;
/** Boss sub-ticks of pause between consecutive jumps. */
export const WATERFOWL_PAUSE_TICKS = 6;
/**
 * Boss sub-ticks the 360° swipe takes after landing — one tick per cell
 * in the 12-cell ring around the 2×2 boss footprint. The sword is at a
 * different ring position each tick; both handle and tip are
 * damage-active to the snake.
 */
export const WATERFOWL_SWIPE_TICKS = 12;
/** Cell radius of the circle attack on landing (jumps 1, 2, 3 primary). */
export const WATERFOWL_RADIUS = 3;
/** Cell radius of the secondary circle attack one beat after jump 3. */
export const WATERFOWL_RADIUS_FINAL = 4;
/** Boss sub-ticks without a special before one is force-fired. */
export const SPECIAL_FORCE_TICKS = 360;

// ── Boss ──────────────────────────────────────────────────────────

export const BOSS_HP_MAX = 30;
