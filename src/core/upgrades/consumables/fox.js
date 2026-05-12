// fox.js — Wizard-fox cutscene (consumable + contraband shared core)
//
// Triggers a real-time freeze: the game / boss tick early-returns
// while `_foxAnim` is set. When the animation duration elapses,
// `tickFoxAnim` clears it and fires the mode-specific effect
// callback (wired in later steps — Step 3 eats food, Step 4 damages
// the boss). Step 2 only lays the timer + freeze + dispatch shape.

import { PHASE_POUNCE_END } from "../../animation/fox-phase.js";

export const FOX_DURATION_MS = 3000;

/**
 * Kicks off a fox cutscene. No-op if one is already running or if
 * there's no valid target (e.g. no food on the grid for "eat" mode).
 *
 * @param {import('../../game/index.js').Game} game
 * @param {"eat"|"pounce"} mode
 */
export function triggerFox(game, mode) {
  if (game._foxAnim) {
    return;
  }
  const target = pickFoxTarget(game, mode);
  if (!target) {
    return;
  }
  game._foxAnim = {
    mode,
    startTime: Date.now(),
    targetX: target.x,
    targetY: target.y,
    edge: pickFurthestEdge(game.grid, target.x, target.y),
  };
}

/**
 * Returns the screen edge furthest from the target cell. Ties prefer
 * top > bottom > left > right (deterministic for tests; cosmetic).
 *
 * @param {{ width: number, height: number }} grid
 * @param {number} tx
 * @param {number} ty
 * @returns {"top"|"bottom"|"left"|"right"}
 */
function pickFurthestEdge(grid, tx, ty) {
  const dTop = ty;
  const dBottom = grid.height - 1 - ty;
  const dLeft = tx;
  const dRight = grid.width - 1 - tx;
  const max = Math.max(dTop, dBottom, dLeft, dRight);
  if (max === dTop) {
    return "top";
  }
  if (max === dBottom) {
    return "bottom";
  }
  if (max === dLeft) {
    return "left";
  }
  return "right";
}

/**
 * Resolves the cell the fox will pounce on for the given mode.
 * Returns null if no valid target exists.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {"eat"|"pounce"} mode
 */
function pickFoxTarget(game, mode) {
  if (mode === "eat") {
    if (game.grid.foodX < 0 || game.grid.foodY < 0) {
      return null;
    }
    return { x: game.grid.foodX, y: game.grid.foodY };
  }
  if (mode === "pounce") {
    // Soulslike: 2×2 boss at sl.bossX/Y (top-left anchor).
    const sl = game._soulslike;
    if (sl && sl.bossHp > 0) {
      return { x: sl.bossX, y: sl.bossY };
    }
    // Bullet-hell: boss entity with hp + top-left anchor on `_boss`.
    if (game._boss && typeof game._boss.hp === "number" && game._boss.hp > 0) {
      return { x: game._boss.x, y: game._boss.y };
    }
    return null;
  }
  return null;
}

const POUNCE_DAMAGE = 5;

/**
 * Advances the cutscene. Called from the game's main tick and the
 * boss-style ticks. Returns true while the freeze is active so the
 * caller can early-return its own logic. When the duration elapses,
 * applies the mode-specific effect (step 3/4) and compensates the
 * game/boss timers so the freeze doesn't count as game time.
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {boolean} true while the freeze is active
 */
export function tickFoxAnim(game) {
  if (!game._foxAnim) {
    return false;
  }
  const now = Date.now();
  const elapsed = now - game._foxAnim.startTime;

  // Pounce damage fires on contact (chew-phase boundary) so the boss's
  // HP bar visibly drops mid-animation rather than after the fox has
  // already left. Any lethal-hit victory transition is deferred until
  // the cutscene ends — letting the death-hold / victory screen take
  // over mid-arc would cut off the fox's exit.
  if (
    game._foxAnim.mode === "pounce" &&
    !game._foxAnim.effectApplied &&
    elapsed >= FOX_DURATION_MS * PHASE_POUNCE_END
  ) {
    game._foxAnim.pendingVictoryExit = applyPounceDamage(game);
    game._foxAnim.effectApplied = true;
  }

  if (elapsed < FOX_DURATION_MS) {
    return true;
  }

  const mode = game._foxAnim.mode;
  const pendingVictoryExit = game._foxAnim.pendingVictoryExit;
  game._foxAnim = null;

  // Compensate timers so the pause doesn't burn runtime or queue a
  // burst of catch-up ticks the moment the freeze ends.
  game.startTime += elapsed;
  game.lastTickTime = now;
  game._lastBossTickTime = now;
  game._lastBossMoveTime = now;

  if (mode === "eat") {
    // The fox snacks the food — same payoff as a natural eat: score,
    // act progress, boss-charge, and a queued grow on next move.
    game.snake.growing = true;
    game._handleFoodEaten();
  } else if (mode === "pounce" && pendingVictoryExit) {
    game._exitBossVictory();
  }
  return false;
}

/**
 * Subtracts POUNCE_DAMAGE from whichever boss is active. Returns true
 * if the hit was lethal for bullet-hell (caller defers `_exitBossVictory`
 * until cutscene end). Soulslike's own tick watches `bossHp === 0` and
 * runs its death-hold there, so it doesn't need the defer flag.
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {boolean} true if a deferred victory exit is pending
 */
function applyPounceDamage(game) {
  const sl = game._soulslike;
  if (sl) {
    sl.bossHp = Math.max(0, sl.bossHp - POUNCE_DAMAGE);
    return false;
  }
  if (game._boss && typeof game._boss.hp === "number") {
    game._boss.hp = Math.max(0, game._boss.hp - POUNCE_DAMAGE);
    return game._boss.hp === 0;
  }
  return false;
}
