// palette.js — ANSI escape codes and colour constants for the terminal renderer

// ── ANSI primitives ──────────────────────────────────────────────
export const GREEN = "\x1b[38;5;35m";
export const CYAN = "\x1b[96m";
export const BROWN = "\x1b[38;5;94m";
export const RED = "\x1b[91m";
export const YELLOW = "\x1b[93m";
export const DIM = "\x1b[2m";
export const RESET = "\x1b[0m";
export const MAGENTA = "\x1b[95m";
export const WHITE = "\x1b[97m";
export const DIM_CYAN = "\x1b[36m";
export const ORANGE = "\x1b[38;5;208m";
export const BLUE = "\x1b[38;5;39m";
export const DARK_RED = "\x1b[38;5;88m";

// ── Cursor / screen control ──────────────────────────────────────
export const ESC_HOME = "\x1b[H";
export const ESC_HIDE_CURSOR = "\x1b[?25l";
export const ESC_SHOW_CURSOR = "\x1b[?25h";
