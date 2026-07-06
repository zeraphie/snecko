// deadBrood.js — Game-over overlay when every kin has been culled.
//
// Reached from `tickCull` once the final kin transitions to memorial
// (the impact flash dwells for IMPACT_FLASH_MS first, so the player
// sees the death frame before the overlay lands). Shows Reginald's
// headline taunt + the run's totalScore. ESC dismisses → routes
// through the standard name-input flow.

export const deadBroodScreen = {
  draw(renderer, game) {
    renderer.drawBroodGameOverOverlay?.(game._broodGameOverTaunt ?? "", game.totalScore ?? 0);
    renderer.flush();
  },
};
