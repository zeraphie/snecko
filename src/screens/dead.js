// dead.js — Game over screen

export const deadScreen = {
  draw(renderer, game) {
    renderer.clear();
    const cause = game.snake.deathCause || "unknown";
    renderer.drawScreen("dead", [
      "G A M E   O V E R",
      "",
      "Cause: " + cause,
      "Score: " + game.score,
      "Level: " + game.level,
      "Time: " + game.constructor.formatTime(game.runTime),
      "",
      "Press Space or Enter to restart",
    ]);
    renderer.flush();
  },
};
