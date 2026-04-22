// boss.js — Boss fight arena screen

import { BOSS_PHASE_INTRO, BOSS_INTRO_TICKS } from "../core/game/constants.js";
import { drawHUD } from "./shared.js";

export const bossScreen = {
  draw(renderer, game) {
    renderer.clear();
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
    renderer.flush();
  },
};
