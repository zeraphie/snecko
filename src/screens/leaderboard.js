// leaderboard.js — Top-5 leaderboard view (reachable from the menu).

import { LABELS } from "../text/labels.js";

function fmtTime(secs) {
  const total = Math.max(0, Math.floor(secs));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtEntry(rank, e) {
  return [
    `${rank}.`,
    e.name ?? "Anonymous",
    `Act ${e.act}`,
    `${e.progress}/${e.foodRequired ?? "?"}`,
    `${e.bites} ${LABELS.hud.bites}`,
    fmtTime(e.time),
  ].join(" — ");
}

export const leaderboardScreen = {
  draw(renderer, game) {
    renderer.clear();
    const lines = [LABELS.leaderboard.title, ""];
    const entries = game._leaderboardEntries ?? [];
    if (entries.length === 0) {
      lines.push(LABELS.leaderboard.empty);
    } else {
      for (let i = 0; i < entries.length; i++) {
        lines.push(fmtEntry(i + 1, entries[i]));
      }
    }
    lines.push("", LABELS.leaderboard.hint);
    renderer.drawScreen("leaderboard", lines);
    renderer.flush();
  },
};
