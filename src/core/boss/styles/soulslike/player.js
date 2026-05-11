// player.js — Soulslike snake fighter: movement, facing, damage.
//
// The snake re-interpretation per D3: 1×1 single-cell fighter, no
// body. Movement is held-direction (no auto-advance) at the
// movement sub-tick rate (~30 Hz). Facing tracks the last input
// direction. HP lives on `_soulslike.snakeHp`; takeDamage is the
// shared gate that downstream steps will extend with iframe and
// parry handling.

import {
  SOULSLIKE_MOVE_MS,
  STAGGER_TICKS,
  BOSS_SIZE,
  ATTACK_DAMAGE,
  ARENA_INNER_X0,
  ARENA_INNER_Y0,
  ARENA_INNER_SIZE,
} from "./constants.js";

/**
 * Tries to move the snake one cell in the given direction. Bounded
 * by walls and grid edges. Returns true on a successful move, false
 * if blocked. In-place head update on the snake's ring buffer —
 * for length-1 snakes (soulslike's case, per D3) headIndex stays
 * fixed and only the head cell's coordinates change.
 *
 * @param {import('../../../game/index.js').Game} game
 * @param {number} dx
 * @param {number} dy
 * @returns {boolean}
 */
export function tryMoveSnake(game, dx, dy) {
  if (dx === 0 && dy === 0) {
    return false;
  }
  const grid = game.grid;
  const head = game.snake.headIndex;
  const x = game.snake.snakeX[head];
  const y = game.snake.snakeY[head];
  const nx = x + dx;
  const ny = y + dy;

  if (!grid.isInBounds(nx, ny)) {
    return false;
  }
  if (grid.isWallCell(nx, ny)) {
    return false;
  }

  // The boss is solid — walking into its 2×2 footprint hurts and
  // doesn't advance the snake (un-parryable). Iframes still gate
  // damage through `takeDamage`, so a dodge into the boss stops at
  // the edge without taking damage.
  const sl = game._soulslike;
  if (sl && isInsideBossFootprint(sl, nx, ny)) {
    takeDamage(game, ATTACK_DAMAGE, "boss_body", false);
    return false;
  }

  game.snake.snakeX[head] = nx;
  game.snake.snakeY[head] = ny;
  grid.clearCell("snake", x, y);
  grid.setCell("snake", nx, ny);
  // Keep snake.dirX/Y in sync so other readers (renderer, future
  // hit-detection) see a consistent facing.
  game.snake.dirX = dx;
  game.snake.dirY = dy;
  return true;
}

/** True if (x, y) is inside the boss's 2×2 footprint. */
function isInsideBossFootprint(sl, x, y) {
  return x >= sl.bossX && x < sl.bossX + BOSS_SIZE && y >= sl.bossY && y < sl.bossY + BOSS_SIZE;
}

/**
 * If the snake's head currently sits inside the boss footprint, push
 * it out by one valid cell. Tries the preferred direction first (the
 * direction the boss is pushing toward — e.g. its dash or move
 * direction), then cardinal alternatives. Falls back silently if no
 * valid exit exists (boundary + walls block every side). Caller
 * decides whether to also apply damage — push semantics are kept
 * pure here.
 *
 * @param {import('../../../game/index.js').Game} game
 * @param {{dx:number,dy:number}|null} [preferredDir]
 * @returns {boolean} true if the snake moved
 */
export function pushSnakeOutOfBoss(game, preferredDir = null) {
  const sl = game._soulslike;
  if (!sl) {
    return false;
  }
  const grid = game.grid;
  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  if (!isInsideBossFootprint(sl, sx, sy)) {
    return false;
  }

  const tries = [];
  if (preferredDir && (preferredDir.dx !== 0 || preferredDir.dy !== 0)) {
    tries.push(preferredDir);
    // Perpendiculars next, then reverse.
    tries.push({ dx: -preferredDir.dy, dy: preferredDir.dx });
    tries.push({ dx: preferredDir.dy, dy: -preferredDir.dx });
    tries.push({ dx: -preferredDir.dx, dy: -preferredDir.dy });
  } else {
    tries.push({ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 });
  }

  for (const dir of tries) {
    let px = sx;
    let py = sy;
    // Walk along `dir` until the cell leaves the footprint.
    while (isInsideBossFootprint(sl, px, py)) {
      px += dir.dx;
      py += dir.dy;
    }
    if (
      px < ARENA_INNER_X0 ||
      px >= ARENA_INNER_X0 + ARENA_INNER_SIZE ||
      py < ARENA_INNER_Y0 ||
      py >= ARENA_INNER_Y0 + ARENA_INNER_SIZE
    ) {
      continue;
    }
    if (grid.isWallCell(px, py)) {
      continue;
    }
    grid.clearCell("snake", sx, sy);
    game.snake.snakeX[headIdx] = px;
    game.snake.snakeY[headIdx] = py;
    grid.setCell("snake", px, py);
    return true;
  }
  return false;
}

/**
 * Movement sub-tick — called from soulslike.tick. Gated on
 * SOULSLIKE_MOVE_MS (~8 Hz, deliberately slow vs. bullet-hell's 30 Hz
 * to keep souls combat positional rather than twitchy). When
 * `_heldDirection` is set, attempts one cell of movement in that
 * direction. Soulslike has no auto-advance: with no held direction,
 * the snake stays put.
 *
 * Dodge bypasses this (it does its own multi-cell move on the input
 * frame), and movement is locked out during iframes + dodge recovery.
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function tickMovement(game) {
  const now = Date.now();
  if (now - game._lastBossMoveTime < SOULSLIKE_MOVE_MS) {
    return;
  }
  game._lastBossMoveTime = now;

  if (!game._heldDirection) {
    return;
  }
  // Movement is locked out for the duration of a dodge (iframes
  // through recovery). The dodge does its own multi-cell move.
  const sl = game._soulslike;
  if (sl && (sl.dodgeIframes > 0 || sl.dodgeRecovery > 0)) {
    return;
  }
  tryMoveSnake(game, game._heldDirection.dx, game._heldDirection.dy);
}

/**
 * Damage gate. Routes incoming boss-attack damage through the
 * defensive stack:
 *
 *   1. **Iframes** (dodge) — full immunity, no damage, no parry.
 *   2. **Parry** — if the attack is parryable AND the parry window
 *      is open, converts to a boss stagger instead of damage. The
 *      parry window is consumed and snake animation reverts to idle.
 *   3. **Damage** — decrement HP, record death cause at zero (D15).
 *
 * Step 8 calls this from the boss-attack hit-resolution path with
 * the attack node's parryable flag from D21's node registry.
 *
 * @param {import('../../../game/index.js').Game} game
 * @param {number} amount
 * @param {string} [attackName] — for the death-cause carry (D15)
 * @param {boolean} [parryable] — from the attack node (D21)
 */
export function takeDamage(game, amount, attackName, parryable = false) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  // 1. Iframe immunity. Recovery does NOT grant immunity — only
  //    the iframe phase.
  if (sl.dodgeIframes > 0) {
    return;
  }
  // 2. Parry conversion. Trigger boss stagger; consume the window.
  if (parryable && sl.parryWindow > 0) {
    sl.staggerTicks = STAGGER_TICKS;
    sl.bossAnim = { state: "stagger", framesIn: 0 };
    sl.parryWindow = 0;
    if (sl.snakeAnim.state === "parry_active") {
      sl.snakeAnim = { state: "idle", framesIn: 0 };
    }
    return;
  }
  // 3. Apply damage.
  sl.snakeHp = Math.max(0, sl.snakeHp - amount);
  if (sl.snakeHp === 0) {
    // Step 13 wires the dedicated YOU DIED screen + state
    // transition. For now just stash the cause for the
    // existing snake.deathCause field.
    game.snake.deathCause = attackName ?? "boss";
  }
}
