// chars.js — Cell-type → ANSI glyph maps (bright + dim variants)

import {
  CELL_EMPTY,
  CELL_WALL,
  CELL_WALL_LOW,
  CELL_SNAKE,
  CELL_SNAKE_HEAD,
  CELL_FOOD,
  CELL_CURRENT_RIGHT,
  CELL_CURRENT_LEFT,
  CELL_CURRENT_DOWN,
  CELL_CURRENT_UP,
  CELL_TELEGRAPH,
  CELL_WORMHOLE_A,
  CELL_WORMHOLE_B,
  CELL_RED_FOOD,
  CELL_BOSS_BODY,
  CELL_BOSS_WEAK,
  CELL_PROJECTILE,
  CELL_PLAYER_INVUL,
  CELL_BOSS_HIT,
  CELL_WALL_ARENA,
  CELL_ANCHOR_LOCK,
  CELL_DANGER_TRAIL,
  CELL_ECHO_ZONE,
  CELL_PLAYER_BULLET,
  CELL_BOSS_DAMAGED,
  CELL_EXHAUST,
  CELL_WALL_HIGH,
  CELL_WALL_LOW_EDIBLE,
  CELL_BLOB,
} from "../renderer.js";

import {
  GREEN,
  CYAN,
  BROWN,
  DARK_BROWN,
  BRIGHT_AMBER,
  RED,
  YELLOW,
  DIM,
  RESET,
  MAGENTA,
  WHITE,
  DIM_CYAN,
  ORANGE,
  BLUE,
  DARK_RED,
} from "./palette.js";

// ── Bright cell glyphs (default) ─────────────────────────────────

export const CELL_CHARS = {};
CELL_CHARS[CELL_EMPTY] = DIM + "\u2591\u2591" + RESET; // ░░
CELL_CHARS[CELL_WALL] = BROWN + "\u2588\u2588" + RESET; // ██
CELL_CHARS[CELL_WALL_LOW] = BROWN + "\u2592\u2592" + RESET; // ▒▒
CELL_CHARS[CELL_WALL_HIGH] = DARK_BROWN + "\u2588\u2588" + RESET; // wildlands high (darker)
CELL_CHARS[CELL_WALL_LOW_EDIBLE] = BRIGHT_AMBER + "\u2592\u2592" + RESET; // edible low wall (Iron Jaw active)
CELL_CHARS[CELL_SNAKE] = GREEN + "\u2593\u2593" + RESET; // ▓▓
CELL_CHARS[CELL_SNAKE_HEAD] = GREEN + "\u25C6\u25C6" + RESET; // ◆◆ (fallback)
CELL_CHARS[CELL_FOOD] = YELLOW + "\u25CE\u25CE" + RESET; // ◎◎
CELL_CHARS[CELL_CURRENT_RIGHT] = CYAN + "\u00BB\u00BB" + RESET; // »» right (bright)
CELL_CHARS[CELL_CURRENT_LEFT] = CYAN + "\u00AB\u00AB" + RESET; // «« left (bright)
CELL_CHARS[CELL_CURRENT_DOWN] = CYAN + "\u2193\u2193" + RESET; // ↓↓ down (bright)
CELL_CHARS[CELL_CURRENT_UP] = CYAN + "\u2191\u2191" + RESET; // ↑↑ up (bright)
CELL_CHARS[CELL_RED_FOOD] = RED + "\u25CE\u25CE" + RESET; // ◎◎ bright red
CELL_CHARS[CELL_TELEGRAPH] = DIM + "\u2591\u2591" + RESET; // ░░ telegraph
CELL_CHARS[CELL_WORMHOLE_A] = ORANGE + "\u25C9\u25C9" + RESET; // ◉◉ portal A
CELL_CHARS[CELL_WORMHOLE_B] = BLUE + "\u25C9\u25C9" + RESET; // ◉◉ portal B
CELL_CHARS[CELL_BOSS_BODY] = MAGENTA + "\u2588\u2588" + RESET; // ██ boss body
CELL_CHARS[CELL_BOSS_WEAK] = YELLOW + "\u25C8\u25C8" + RESET; // ◈◈ boss weak point
CELL_CHARS[CELL_PROJECTILE] = RED + "\u2022\u2022" + RESET; // •• projectile
CELL_CHARS[CELL_PLAYER_INVUL] = CYAN + "\u2593\u2593" + RESET; // ▓▓ invul body (bright)
CELL_CHARS[CELL_BOSS_HIT] = WHITE + "\u2588\u2588" + RESET; // ██ boss stagger (bright)
CELL_CHARS[CELL_WALL_ARENA] = DARK_RED + "\u2592\u2592" + RESET; // ▒▒ arena wall
CELL_CHARS[CELL_ANCHOR_LOCK] = ORANGE + "\u2593\u2593" + RESET; // ▓▓ lock (bright amber)
CELL_CHARS[CELL_DANGER_TRAIL] = "\x1b[38;5;208m" + "\u2592\u2592" + RESET; // ▒▒ trail (bright)
CELL_CHARS[CELL_ECHO_ZONE] = "\x1b[38;5;34m" + "\u2592\u2592" + RESET; // ▒▒ echo (bright)
CELL_CHARS[CELL_PLAYER_BULLET] = CYAN + "\u2219\u2219" + RESET; // ∙∙ player bullet (bright)
CELL_CHARS[CELL_BOSS_DAMAGED] = MAGENTA + "\u2592\u2592" + RESET; // ▒▒ damaged boss body
CELL_CHARS[CELL_EXHAUST] = ORANGE + "\u2592\u2592" + RESET; // ▒▒ exhaust flame

CELL_CHARS[CELL_BLOB] = MAGENTA + "██" + RESET; // ██ chasing blob (catacombs)

// ── Dim / pulse-low variants ─────────────────────────────────────

export const CURRENT_DIM = {};
CURRENT_DIM[CELL_CURRENT_RIGHT] = DIM_CYAN + "\u00BB\u00BB" + RESET;
CURRENT_DIM[CELL_CURRENT_LEFT] = DIM_CYAN + "\u00AB\u00AB" + RESET;
CURRENT_DIM[CELL_CURRENT_DOWN] = DIM_CYAN + "\u2193\u2193" + RESET;
CURRENT_DIM[CELL_CURRENT_UP] = DIM_CYAN + "\u2191\u2191" + RESET;

export const FOOD_DIM = "\x1b[33m" + "\u25CE\u25CE" + RESET; // ◎◎ dim yellow
export const RED_FOOD_DIM = "\x1b[31m" + "\u25CE\u25CE" + RESET; // ◎◎ dim red
export const BOSS_WEAK_DIM = "\x1b[33m" + "\u25C8\u25C8" + RESET; // ◈◈ dim (pulse low)
export const PLAYER_INVUL_DIM = "\x1b[36m" + "\u2593\u2593" + RESET; // ▓▓ invul body (dim)
export const BOSS_HIT_DIM = MAGENTA + "\u2588\u2588" + RESET; // ██ boss stagger (dim)
export const ANCHOR_LOCK_DIM = "\x1b[38;5;130m" + "\u2593\u2593" + RESET; // ▓▓ lock (dim amber)
export const DANGER_TRAIL_DIM = "\x1b[38;5;130m" + "\u2592\u2592" + RESET; // ▒▒ trail (dim)
export const ECHO_ZONE_DIM = "\x1b[38;5;22m" + "\u2592\u2592" + RESET; // ▒▒ echo (dim)
export const PLAYER_BULLET_DIM = DIM_CYAN + "\u2219\u2219" + RESET; // ∙∙ player bullet (dim)
export const BOSS_DAMAGED_DIM = "\x1b[35m" + "\u2592\u2592" + RESET; // ▒▒ damaged (dim)
export const EXHAUST_DIM = "\x1b[38;5;130m" + "\u2591\u2591" + RESET; // ░░ exhaust (dim)

// ── Directional head glyphs ──────────────────────────────────────

export const HEAD_CHARS = {};
HEAD_CHARS["0,-1"] = GREEN + "\u25B2\u25B2" + RESET; // ▲▲ up
HEAD_CHARS["0,1"] = GREEN + "\u25BC\u25BC" + RESET; // ▼▼ down
HEAD_CHARS["-1,0"] = GREEN + "\u25C0\u25C0" + RESET; // ◀◀ left
HEAD_CHARS["1,0"] = GREEN + "\u25B6\u25B6" + RESET; // ▶▶ right

// Invulnerable head: bright cyan (flicker high) / dim cyan (flicker low)
export const HEAD_CHARS_INVUL = {};
HEAD_CHARS_INVUL["0,-1"] = CYAN + "\u25B2\u25B2" + RESET;
HEAD_CHARS_INVUL["0,1"] = CYAN + "\u25BC\u25BC" + RESET;
HEAD_CHARS_INVUL["-1,0"] = CYAN + "\u25C0\u25C0" + RESET;
HEAD_CHARS_INVUL["1,0"] = CYAN + "\u25B6\u25B6" + RESET;

export const HEAD_CHARS_INVUL_DIM = {};
HEAD_CHARS_INVUL_DIM["0,-1"] = DIM_CYAN + "\u25B2\u25B2" + RESET;
HEAD_CHARS_INVUL_DIM["0,1"] = DIM_CYAN + "\u25BC\u25BC" + RESET;
HEAD_CHARS_INVUL_DIM["-1,0"] = DIM_CYAN + "\u25C0\u25C0" + RESET;
HEAD_CHARS_INVUL_DIM["1,0"] = DIM_CYAN + "\u25B6\u25B6" + RESET;
