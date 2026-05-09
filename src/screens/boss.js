// boss.js — Boss fight arena screen (style-aware dispatch)

import { BOSS_PHASE_INTRO, BOSS_INTRO_TICKS, SURVIVAL_WIN_TICKS } from "../core/game/constants.js";
import { drawHUD } from "./shared.js";

function drawBulletHellScreen(renderer, game) {
  game._drawBossArena();
  drawHUD(renderer, game);
  if (game._boss) {
    renderer.drawBossInfo(
      game._boss.name,
      game._boss.hp,
      game._boss.maxHp,
      game._fight ? game._fight.phase : 0
    );
  }
  if (game._fight && game._fight.phase === BOSS_PHASE_INTRO) {
    renderer.drawBossIntroOverlay(game._boss.name, game._fight._introTicks, BOSS_INTRO_TICKS);
  }
}

function drawSurvivalScreen(renderer, game) {
  game._drawSurvivalArena();
  drawHUD(renderer, game);
  const sv = game._bossSurvival;
  if (!sv) {
    return;
  }
  const name = game._boss?.name ?? "Survival";
  renderer.drawSurvivalInfo(name, sv.ticksLeft, SURVIVAL_WIN_TICKS);
  if (sv.introTicks > 0) {
    renderer.drawBossIntroOverlay(name, sv.introTicks, BOSS_INTRO_TICKS);
  }
}

export const bossScreen = {
  draw(renderer, game) {
    renderer.clear();
    if (game._bossDef?.style === "survival") {
      drawSurvivalScreen(renderer, game);
    } else {
      drawBulletHellScreen(renderer, game);
    }
    renderer.flush();
  },
};
