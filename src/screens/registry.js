// registry.js — Screen registry
//
// Maps game state strings to screen objects. Each screen exports a
// draw(renderer, game) function that renders the full frame for that state.

import { startScreen } from "./start.js";
import { deadScreen } from "./dead.js";
import { playingScreen } from "./playing.js";
import { draftScreen } from "./draft.js";
import { contrabandScreen } from "./contraband.js";
import { bossScreen } from "./boss.js";
import { targetingScreen } from "./targeting.js";
import { wormholeScreen } from "./wormhole.js";
import { seedInputScreen } from "./seedInput.js";
import { menuScreen } from "./menu.js";
import { mutationPickerScreen } from "./mutationPicker.js";
import { leaderboardScreen } from "./leaderboard.js";
import { nameInputScreen } from "./nameInput.js";
import { practiceHubScreen } from "./practiceHub.js";
import { bossPickerScreen } from "./bossPicker.js";
import { bossRushCompleteScreen } from "./bossRushComplete.js";
import { youDiedScreen } from "./youDied.js";
import { broodPlacementScreen } from "./broodPlacement.js";
import { shieldPlacementScreen } from "./shieldPlacement.js";
import { deadBroodScreen } from "./deadBrood.js";

/** @type {Map<string, { draw(renderer: object, game: object): void }>} */
const SCREENS = new Map();

/**
 * Registers a screen for a game state.
 *
 * @param {string} stateId
 * @param {{ draw(renderer: object, game: object): void }} screen
 */
export function registerScreen(stateId, screen) {
  SCREENS.set(stateId, screen);
}

/**
 * Returns the screen for a game state, or null if none registered.
 *
 * @param {string} stateId
 * @returns {{ draw(renderer: object, game: object): void } | null}
 */
export function getScreen(stateId) {
  return SCREENS.get(stateId) ?? null;
}

// ── Register built-in screens ─────────────────────────────────────

registerScreen("start", startScreen);
registerScreen("dead", deadScreen);
registerScreen("playing", playingScreen);
registerScreen("draft", draftScreen);
registerScreen("contraband", contrabandScreen);
registerScreen("boss", bossScreen);
registerScreen("targeting", targetingScreen);
registerScreen("wormhole", wormholeScreen);
registerScreen("seed_input", seedInputScreen);
registerScreen("menu", menuScreen);
registerScreen("mutation_picker", mutationPickerScreen);
registerScreen("leaderboard", leaderboardScreen);
registerScreen("name_input", nameInputScreen);
registerScreen("practice_hub", practiceHubScreen);
registerScreen("boss_picker", bossPickerScreen);
registerScreen("boss_rush_complete", bossRushCompleteScreen);
registerScreen("dead_soulslike", youDiedScreen);
registerScreen("brood_placement", broodPlacementScreen);
registerScreen("shield_placement", shieldPlacementScreen);
registerScreen("dead_brood", deadBroodScreen);
