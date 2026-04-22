// screens.js — Full-screen overlays (draft, contraband, generic)

import { GREEN, RED, DIM, RESET } from "./palette.js";
import { ESC_HOME } from "./palette.js";

/**
 * Stores a generic screen overlay for rendering during flush.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {string} name — Screen identifier ("dead", "title", etc.)
 * @param {string[]} lines — Text lines to display centred
 */
export function drawScreen(r, name, lines) {
  r._screenOverlay = { name, lines };
}

/**
 * Renders the upgrade draft screen.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {object[]} choices
 * @param {object|null} mutation
 * @param {number} selectedIndex
 * @param {boolean} mutationAccepted
 */
export function drawDraftScreen(r, choices, mutation, selectedIndex, mutationAccepted) {
  const fullWidth = r._w * 2;
  const lines = [];

  lines.push("");
  lines.push("  L E V E L   U P");
  lines.push("");

  for (let i = 0; i < choices.length; i++) {
    const def = choices[i];
    const sel = i === selectedIndex;
    const badge = def.type === "passive" ? "+" + def.duration + " Rounds" : "x" + def.charges;
    if (sel) {
      lines.push(`  ${GREEN}> [${i + 1}] ${def.name}${RESET}  ${DIM}${badge}${RESET}`);
    } else {
      lines.push(`  [${i + 1}] ${def.name}  ${DIM}${badge}${RESET}`);
    }
    lines.push(`      ${DIM}${def.desc}${RESET}`);
  }

  if (mutation) {
    lines.push("");
    const mSel = mutationAccepted;
    const mColor = mSel ? RED : DIM;
    lines.push(
      `  ${mColor}[4] MUTATION: ${mutation.name}${RESET}${mSel ? RED + " *" + RESET : ""}`
    );
    lines.push(`      ${DIM}${mutation.desc}${RESET}`);
  }

  lines.push("");
  lines.push(
    `  ${DIM}\u2191\u2193 select${mutation ? ", \u2190\u2192 mutation" : ""}, Enter confirm${RESET}`
  );

  // Build output, padded to board height
  r._screenOverlay = null;
  let buf = ESC_HOME;
  const padTop = Math.max(0, Math.floor((r._h - lines.length) / 2));
  for (let y = 0; y < r._h; y++) {
    const li = y - padTop;
    let line = "";
    let visLen = 0;
    if (li >= 0 && li < lines.length) {
      line = lines[li];
      visLen = line.replace(/\x1b\[[0-9;]*m/g, "").length;
    }
    if (visLen < fullWidth) {
      line += " ".repeat(fullWidth - visLen);
    }
    buf += line + "\n";
  }

  // Blank HUD lines (2 lines to clear stale upgrade info)
  const hudWidth = Math.max(fullWidth, r._maxHudLen);
  buf += " ".repeat(hudWidth) + "\n";
  buf += " ".repeat(hudWidth) + "\n";
  r._stdout.write(buf);
}

/**
 * Renders the Contraband pick screen after a boss victory.
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {Array<{id:string, name:string, desc:string}>} choices
 * @param {number} selectedIndex
 * @param {Array<{id:string, name:string}>} collected
 */
export function drawContrabandScreen(r, choices, selectedIndex, collected) {
  const fullWidth = r._w * 2;
  const lines = [];

  lines.push("");
  lines.push(`  ${RED}C O N T R A B A N D${RESET}`);
  lines.push(`  ${DIM}These upgrades are not on the flight manifest.${RESET}`);
  lines.push("");

  if (!choices || choices.length === 0) {
    lines.push("  No items available.");
  } else {
    for (let i = 0; i < choices.length; i++) {
      const item = choices[i];
      const sel = i === selectedIndex;
      if (sel) {
        lines.push(`  ${RED}> [${i + 1}] ${item.name}${RESET}`);
      } else {
        lines.push(`  ${DIM}  [${i + 1}]${RESET} ${item.name}`);
      }
      lines.push(`        ${DIM}${item.desc}${RESET}`);
    }
  }

  lines.push("");
  const holdCount = collected ? collected.length : 0;
  lines.push(`  ${DIM}In the hold: ${holdCount} item${holdCount !== 1 ? "s" : ""}${RESET}`);
  lines.push("");
  lines.push(`  ${DIM}\u2191\u2193 select, Enter confirm${RESET}`);

  r._screenOverlay = null;
  let buf = ESC_HOME;
  const padTop = Math.max(0, Math.floor((r._h - lines.length) / 2));
  for (let y = 0; y < r._h; y++) {
    const li = y - padTop;
    let line = "";
    let visLen = 0;
    if (li >= 0 && li < lines.length) {
      line = lines[li];
      visLen = line.replace(/\x1b\[[0-9;]*m/g, "").length;
    }
    if (visLen < fullWidth) {
      line += " ".repeat(fullWidth - visLen);
    }
    buf += line + "\n";
  }

  const hudWidth = Math.max(fullWidth, r._maxHudLen);
  buf += " ".repeat(hudWidth) + "\n";
  buf += " ".repeat(hudWidth) + "\n";
  r._stdout.write(buf);
}
