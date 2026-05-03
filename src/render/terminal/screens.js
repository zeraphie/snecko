// screens.js — Full-screen overlays (draft, contraband, generic)

import { GREEN, RED, DIM, RESET } from "./palette.js";
import { ESC_HOME } from "./palette.js";
import { LABELS } from "../../text/labels.js";

/**
 * Builds the corner badge for an upgrade card. Passives/bites show duration
 * or charge count in bites; consumables show a charge count; mutations have
 * no badge.
 */
function upgradeBadge(def) {
  if (def.type === "passive") {
    return "+" + def.duration + " " + LABELS.hud.bites;
  }
  if (def.type === "bites") {
    return "x" + def.charges + " " + LABELS.hud.bites;
  }
  if (def.type === "consumable") {
    return "x" + def.charges;
  }
  return "";
}

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
  lines.push(`  ${LABELS.draft.title}`);
  lines.push("");

  for (let i = 0; i < choices.length; i++) {
    const def = choices[i];
    const labels = LABELS.upgrades[def.id] ?? {};
    const sel = i === selectedIndex;
    const badge = upgradeBadge(def);
    if (sel) {
      lines.push(`  ${GREEN}> [${i + 1}] ${labels.name}${RESET}  ${DIM}${badge}${RESET}`);
    } else {
      lines.push(`  [${i + 1}] ${labels.name}  ${DIM}${badge}${RESET}`);
    }
    lines.push(`      ${DIM}${labels.desc ?? ""}${RESET}`);
  }

  if (mutation) {
    const mLabels = LABELS.upgrades[mutation.id] ?? {};
    lines.push("");
    const mSel = mutationAccepted;
    const mColor = mSel ? RED : DIM;
    lines.push(
      `  ${mColor}[4] ${LABELS.draft.mutationPrefix}: ${mLabels.name}${RESET}${mSel ? RED + " *" + RESET : ""}`
    );
    lines.push(`      ${DIM}${mLabels.desc ?? ""}${RESET}`);
  }

  lines.push("");
  lines.push(
    `  ${DIM}${mutation ? LABELS.draft.selectInstrFull : LABELS.draft.selectInstr}${RESET}`
  );

  // Build output, padded to grid height
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
 * Renders the mutation picker (practice mode, reachable from the menu).
 *
 * @param {import('./terminal-renderer.js').TerminalRenderer} r
 * @param {string[]} mutationIds
 * @param {number} selectedIndex
 */
export function drawMutationPickerScreen(r, mutationIds, selectedIndex) {
  const fullWidth = r._w * 2;
  const lines = [];

  lines.push("");
  lines.push(`  ${RED}${LABELS.mutationPicker.title}${RESET}`);
  lines.push(`  ${DIM}${LABELS.mutationPicker.subtitle}${RESET}`);
  lines.push("");

  for (let i = 0; i < mutationIds.length; i++) {
    const id = mutationIds[i];
    const labels = LABELS.upgrades[id] ?? {};
    const sel = i === selectedIndex;
    if (sel) {
      lines.push(`  ${RED}> [${i + 1}] ${labels.name ?? id}${RESET}`);
    } else {
      lines.push(`  ${DIM}  [${i + 1}]${RESET} ${labels.name ?? id}`);
    }
    lines.push(`        ${DIM}${labels.desc ?? ""}${RESET}`);
  }

  lines.push("");
  lines.push(`  ${DIM}${LABELS.mutationPicker.hint}${RESET}`);

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
  lines.push(`  ${RED}${LABELS.contraband.title}${RESET}`);
  lines.push(`  ${DIM}${LABELS.contraband.subtitle}${RESET}`);
  lines.push("");

  if (!choices || choices.length === 0) {
    lines.push(`  ${LABELS.contraband.none}`);
  } else {
    for (let i = 0; i < choices.length; i++) {
      const item = choices[i];
      const labels = LABELS.upgrades[item.id] ?? {};
      const sel = i === selectedIndex;
      if (sel) {
        lines.push(`  ${RED}> [${i + 1}] ${labels.name}${RESET}`);
      } else {
        lines.push(`  ${DIM}  [${i + 1}]${RESET} ${labels.name}`);
      }
      lines.push(`        ${DIM}${labels.desc ?? ""}${RESET}`);
    }
  }

  lines.push("");
  const holdCount = collected ? collected.length : 0;
  lines.push(
    `  ${DIM}${LABELS.contraband.inHold}: ${holdCount} item${holdCount !== 1 ? "s" : ""}${RESET}`
  );
  lines.push("");
  lines.push(`  ${DIM}${LABELS.contraband.selectInstr}${RESET}`);

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
