// constants.js — Shared game constants and state names

export const STATE_START = "start";
export const STATE_PLAYING = "playing";
export const STATE_DRAFT = "draft";
export const STATE_TARGETING = "targeting";
export const STATE_WORMHOLE = "wormhole";
export const STATE_DEAD = "dead";
export const STATE_BOSS = "boss";
export const STATE_CONTRABAND = "contraband";
export const STATE_SEED_INPUT = "seed_input";
export const STATE_MENU = "menu";
export const STATE_MUTATION_PICKER = "mutation_picker";
export const STATE_LEADERBOARD = "leaderboard";
export const STATE_NAME_INPUT = "name_input";
export const STATE_PRACTICE_HUB = "practice_hub";
export const STATE_BOSS_PICKER = "boss_picker";
export const STATE_BOSS_RUSH_COMPLETE = "boss_rush_complete";
export const STATE_DEAD_SOULSLIKE = "dead_soulslike";

// ── Death causes ──────────────────────────────────────────────────
export const DEATH_WALL = "wall";
export const DEATH_SELF = "self";
export const DEATH_BOSS = "boss";
export const DEATH_PROJECTILE = "projectile";
export const DEATH_BOMB = "bomb";
export const DEATH_GIVE_UP = "give_up";
export const DEATH_BLOB = "blob";

export const GRID_W = 31;
export const GRID_H = 31;
export const INITIAL_SNAKE_LENGTH = 3;
export const BASE_TICK_MS = 150;
export const MIN_TICK_MS = 70;
export const TICK_DECREASE_PER_ACT = 8;
export const FOOD_REQUIRED_BASE = 5;
export const FOOD_REQUIRED_PER_ACT = 2;
export const BOSS_FOOD_INTERVAL = 10;
export const BOSS_TICK_MS = 120;
export const BOSS_MOVE_MS = 33; // movement sub-tick interval (~30 Hz)
export const PLAYER_FIRE_INTERVAL = 8; // movement sub-ticks between auto-fire shots
export const PLAYER_BULLET_INTERVAL = 2; // movement sub-ticks per bullet step (1 = full speed, 2 = half)
export const BOSS_HP = 12;
export const BOSS_BODY_HP = 3; // HP per destructible body cell
export const BOSS_FOOD_REWARD = 3;
export const BOSS_INVUL_TICKS = 8; // player invulnerability ticks after landing a hit

// ── Boss fire intervals (ticks between shots, per phase) ──────────
export const BOSS_FIRE_INTERVAL = 5; // phase 1 baseline
export const BOSS_FIRE_INTERVAL_P2 = 4; // phase 2 — tighter
export const BOSS_FIRE_INTERVAL_P3 = 3; // phase 3 — relentless

// ── Boss phase identifiers ────────────────────────────────────────
export const BOSS_PHASE_INTRO = 0; // safe window — no firing
export const BOSS_PHASE_1 = 1; // single aimed shot
export const BOSS_PHASE_2 = 2; // triple spread ±45°
export const BOSS_PHASE_3 = 3; // triple spread ±90°

// ── Boss phase thresholds (HP at or below → escalate) ────────────
export const BOSS_INTRO_TICKS = 25; // ~3 s at 120 ms/tick — room for a spawn animation
export const BOSS_PHASE2_HP = 8; // enter phase 2 when HP drops to this
export const BOSS_PHASE3_HP = 4; // enter phase 3 when HP drops to this

// ── Boss special abilities ────────────────────────────────────────
export const BOSS_SPECIAL_INTERVAL = 18; // boss ticks between special ability triggers

// ── Survival style tuning ────────────────────────────────────────
// Survival uses BOSS_TICK_MS (120 ms) as its tick rate — same cadence as
// bullet-hell so HUD timers and chase movement stay in sync.
export const SURVIVAL_WIN_TICKS = 750; // ~1.5 min at 120 ms/tick — full fight duration
export const SURVIVAL_BLOB_SIZE = 2; // 2×2 footprint — matches catacombs corridor width
export const SURVIVAL_BOSS_TICK_INTERVAL = 1; // boss steps per player tick — 1 = match player speed; raise to slow blob
export const SURVIVAL_BOSS_PATH_RECOMPUTE_TICKS = 1; // boss steps per BFS recompute — raise to enable player baiting
export const SURVIVAL_PATH_SHIFT_TICKS = 80; // ~10 s at 120 ms/tick — total cycle length per corridor flip
// Rift cycle = 5 bite-equivalents (3 lingers + telegraph + apply). Driving advanceRifts once
// every SURVIVAL_PATH_SHIFT_TICKS / 5 ticks keeps the flip cadence at SURVIVAL_PATH_SHIFT_TICKS.
export const SURVIVAL_RIFT_INTERVAL_TICKS = 16;
export const SURVIVAL_BOSS_STUN_TICKS = 8; // ~1 s at 120 ms/tick — blob freeze after a flip closes on it

// ── Contraband tuning ─────────────────────────────────────────────
export const GOMU_STAGGER_TICKS = 3; // player stagger after gomu shield absorbs a hit
export const JAIL_FREE_COOLDOWN = 8; // ticks between jail-free projectile absorptions
export const HUNGRY_RANGE = 8; // Chebyshev distance for snake-hungry fire-rate boost
export const HUNGRY_VERTICAL_RANGE = 3; // ±cells vertical movement with snake-hungry
export const DANGER_TRAIL_TICKS = 3; // how long danger trail cells persist
export const ECHO_ZONE_TICKS = 4; // how long echo damage zones persist
export const ECHO_ZONE_MAX = 3; // max active echo zones at once
