// shield.js — Brood shield consumable.
//
// Five charges per brood act (auto-granted at act start, cleared on the
// next; not draftable). Activation pauses the cull tick, drops a cursor
// at the snake head, and lets the player pick a kin to protect. A
// shielded kin absorbs the next throw aimed at any of its cells — the
// shield is consumed instead of the kin transitioning to memorial
// (resolveImpact handles the absorption). One shield per kin maximum;
// re-targeting an already-shielded kin is blocked at confirm so the
// player doesn't accidentally waste a charge.
//
// Mirrors the bomb consumable's flow: enter / move / confirm / cancel.
// Cancel refunds the charge so cracking open the cursor for a look is
// not a commitment.

import { STATE_SHIELD_PLACEMENT, STATE_PLAYING } from "../../game/constants.js";
import { kinAt } from "../../mechanics/cull/index.js";

/**
 * Enters shield-placement mode. Cursor starts at the snake head.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function enterShieldPlacement(game) {
  game._shieldCursor = {
    x: game.snake.snakeX[game.snake.headIndex],
    y: game.snake.snakeY[game.snake.headIndex],
  };
  game.state = STATE_SHIELD_PLACEMENT;
}

/**
 * Moves the shield cursor by one cell. Wraps at edges like the bomb
 * cursor.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} dx
 * @param {number} dy
 */
export function moveShieldCursor(game, dx, dy) {
  if (game.state !== STATE_SHIELD_PLACEMENT || !game._shieldCursor) {
    return;
  }
  const w = game.grid.width;
  const h = game.grid.height;
  let nx = game._shieldCursor.x + dx;
  let ny = game._shieldCursor.y + dy;
  if (nx < 0) {
    nx = w - 1;
  } else if (nx >= w) {
    nx = 0;
  }
  if (ny < 0) {
    ny = h - 1;
  } else if (ny >= h) {
    ny = 0;
  }
  game._shieldCursor.x = nx;
  game._shieldCursor.y = ny;
}

/**
 * Confirms shield placement. Valid when the cursor sits on a live kin
 * cell whose kin is not already shielded — the kin becomes shielded
 * and play resumes. Invalid confirms (empty cell, memorial cell,
 * already-shielded kin) are a no-op: the cursor stays open so the
 * player can pick again without spending a charge.
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {boolean} true if a shield was placed
 */
export function confirmShieldPlacement(game) {
  if (game.state !== STATE_SHIELD_PLACEMENT || !game._shieldCursor) {
    return false;
  }
  const kin = shieldTargetKin(game);
  if (!kin) {
    return false;
  }
  kin.shielded = true;
  game._shieldCursor = null;
  game.state = STATE_PLAYING;
  // Wall-clock anchors that the cull/snake ticks use to compute dt
  // need a reset so the paused interval isn't replayed in a single
  // tick after resume.
  game.lastTickTime = Date.now();
  if (game.mechanic && game.mechanic.type === "cull") {
    game.mechanic.lastTickAt = null;
  }
  return true;
}

/**
 * Cancels shield placement. Refunds the spent charge and returns to
 * play. Use for "let me look around without committing".
 *
 * @param {import('../../game/index.js').Game} game
 */
export function cancelShieldPlacement(game) {
  if (game.state !== STATE_SHIELD_PLACEMENT) {
    return;
  }
  game._shieldCursor = null;
  game.upgrades.addConsumable("shield", 1);
  game.state = STATE_PLAYING;
  game.lastTickTime = Date.now();
  if (game.mechanic && game.mechanic.type === "cull") {
    game.mechanic.lastTickAt = null;
  }
}

/**
 * Returns the kin under the cursor that is eligible to receive a
 * shield — alive (terrain reads as a live kin cell), not already
 * shielded — or null. Renderers use this to highlight the whole kin
 * shape so the player knows what the throw will cover.
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {object | null}
 */
export function shieldTargetKin(game) {
  const cursor = game._shieldCursor;
  if (!cursor) {
    return null;
  }
  const kin = kinAt(game, cursor.x, cursor.y);
  if (!kin || kin.shielded) {
    return null;
  }
  return kin;
}
