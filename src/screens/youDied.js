// youDied.js — Soulslike YOU DIED overlay screen.
//
// Reached after a snake-HP-zero death in a soulslike fight, once the
// brief death-pose hold expires (`_soulslike.deathScreenTicks`
// counter in `boss/styles/soulslike/index.js`). The screen is a
// full-bleed overlay; the live arena underneath is not redrawn so the
// last frame stays as a freeze-image. ESC dismisses via
// `game.dismissYouDied()` which routes through `_exitBossDeath` →
// STATE_PRACTICE_HUB.

export const youDiedScreen = {
  draw(renderer, game) {
    renderer.clear();
    const cause = game.snake.deathCause || "boss";
    renderer.drawYouDiedOverlay(cause);
    renderer.flush();
  },
};
