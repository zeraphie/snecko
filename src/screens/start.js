// start.js — Start/title screen

export const startScreen = {
  draw(renderer, game) {
    renderer.clear();
    renderer.drawScreen("start", [
      "S N E C K O",
      "",
      "Arrow keys or WASD to move",
      "",
      "Press Space or Enter to start",
    ]);
    renderer.flush();
  },
};
