// movement.js — Boss strafe / charge / retreat between attacks.
//
// The boss has three modes (see `constants.js` for the trigger
// thresholds):
//   - idle:       strafe perpendicular to the snake — but only if the
//                 snake isn't actively closing the gap.
//   - aggressive: 1 step toward the snake each move tick. The boss is
//                 trying to land an attack.
//   - defensive:  1 step away from the snake each move tick. The boss
//                 has been crowded or hit; create breathing room.
//
// Movement is gated off entirely during stagger, phase transitions,
// the Waterfowl special, death, and any active attack (the boss is
// committed to its swing — it can't reposition mid-strike).
//
// `recordBossHit(sl)` is the hook the stab path calls when the snake
// lands a hit. It feeds the defensive trigger.

import {
  ARENA_INNER_X0,
  ARENA_INNER_Y0,
  ARENA_INNER_SIZE,
  BOSS_SIZE,
  MOVE_INTERVAL_TICKS,
  CLOSENESS_THRESHOLD,
  FARNESS_THRESHOLD,
  CLOSENESS_TRIGGER_TICKS,
  FARNESS_TRIGGER_TICKS,
  HITS_FOR_DEFENSIVE,
  HIT_DECAY_TICKS,
  DEFENSIVE_DURATION_TICKS,
  AGGRESSIVE_DURATION_TICKS,
} from "./constants.js";
import { computeBossFacing } from "./attacks.js";

export const MOVEMENT_MODE_IDLE = "idle";
export const MOVEMENT_MODE_AGGRESSIVE = "aggressive";
export const MOVEMENT_MODE_DEFENSIVE = "defensive";

/**
 * Boss sub-tick callback: updates mode triggers + counters and steps
 * the boss when the per-move timer hits zero. Always re-snaps the
 * boss facing toward the snake so the next attack telegraph reads
 * correctly.
 *
 * @param {import('../../../game/index.js').Game} game
 */
export function tickBossMovement(game) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  // Hard freezes — boss can't reposition.
  if (sl.staggerTicks > 0) {
    return;
  }
  if (sl.phaseTransitionTicks > 0) {
    return;
  }
  if (sl.waterfowlPhase > 0) {
    return;
  }
  if (sl.bossHp <= 0) {
    return;
  }
  // Committed to an attack — no repositioning mid-swing.
  if (sl.bossAttackId !== null) {
    return;
  }

  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  const dist = manhattan(sx, sy, sl.bossX, sl.bossY);

  // Track the snake — keeps idle-state facing pointed the right way so
  // the next attack telegraph isn't off-axis.
  sl.bossFacing = computeBossFacing(sl.bossX, sl.bossY, sx, sy);

  updateCounters(sl, dist);
  updateMode(sl);

  sl.movementTimer--;
  if (sl.movementTimer > 0) {
    sl.prevPlayerDistance = dist;
    return;
  }
  sl.movementTimer = MOVE_INTERVAL_TICKS;

  performMove(game, sl, sx, sy, dist);
  sl.prevPlayerDistance = dist;
}

/**
 * Stab-path hook — call when the snake's knife lands on the boss.
 * Feeds the defensive trigger (the boss has been hit recently).
 *
 * @param {object} sl — `game._soulslike` slot
 */
export function recordBossHit(sl) {
  if (!sl) {
    return;
  }
  sl.hitsTaken++;
  sl.hitDecayCounter = 0;
}

// ── Internals ───────────────────────────────────────────────────

function manhattan(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function updateCounters(sl, dist) {
  // Closeness / farness counters — sustained presence in the range
  // flips the mode. Cells between the thresholds decay both counters
  // toward zero (no commitment yet).
  if (dist <= CLOSENESS_THRESHOLD) {
    sl.closenessCounter++;
    sl.farnessCounter = 0;
  } else if (dist >= FARNESS_THRESHOLD) {
    sl.farnessCounter++;
    sl.closenessCounter = 0;
  } else {
    sl.closenessCounter = Math.max(0, sl.closenessCounter - 1);
    sl.farnessCounter = Math.max(0, sl.farnessCounter - 1);
  }
  // Hit counter sliding-window decay — full reset once the window
  // elapses since the last hit.
  sl.hitDecayCounter++;
  if (sl.hitDecayCounter >= HIT_DECAY_TICKS) {
    sl.hitsTaken = 0;
    sl.hitDecayCounter = 0;
  }
}

function updateMode(sl) {
  if (sl.movementMode !== MOVEMENT_MODE_IDLE) {
    sl.movementModeLeft--;
    if (sl.movementModeLeft <= 0) {
      sl.movementMode = MOVEMENT_MODE_IDLE;
      sl.movementModeLeft = 0;
    }
    return;
  }
  // Idle — look for a trigger.
  if (sl.closenessCounter >= CLOSENESS_TRIGGER_TICKS || sl.hitsTaken >= HITS_FOR_DEFENSIVE) {
    sl.movementMode = MOVEMENT_MODE_DEFENSIVE;
    sl.movementModeLeft = DEFENSIVE_DURATION_TICKS;
    sl.closenessCounter = 0;
    sl.hitsTaken = 0;
    sl.hitDecayCounter = 0;
  } else if (sl.farnessCounter >= FARNESS_TRIGGER_TICKS) {
    sl.movementMode = MOVEMENT_MODE_AGGRESSIVE;
    sl.movementModeLeft = AGGRESSIVE_DURATION_TICKS;
    sl.farnessCounter = 0;
  }
}

function performMove(game, sl, sx, sy, dist) {
  if (sl.movementMode === MOVEMENT_MODE_AGGRESSIVE) {
    moveAlongAxis(game, sl, Math.sign(sx - sl.bossX), Math.sign(sy - sl.bossY));
    return;
  }
  if (sl.movementMode === MOVEMENT_MODE_DEFENSIVE) {
    moveAlongAxis(game, sl, Math.sign(sl.bossX - sx), Math.sign(sl.bossY - sy));
    return;
  }
  // Idle strafe. Two gates that keep the boss from making the wrong
  // call in non-strafe situations:
  //   - Snake is closing → hold ground (don't circle away from a
  //     committed approach).
  //   - Snake is within attack reach (dist ≤ 2) → hold (the boss
  //     wants to swing, not reposition; tickBossAttacks will fire).
  if (sl.prevPlayerDistance !== undefined && dist < sl.prevPlayerDistance) {
    return;
  }
  if (dist <= 2) {
    return;
  }
  strafe(game, sl, sx, sy);
}

/**
 * Tries to move 1 step along the dominant axis; falls back to the
 * other axis if the first is blocked. Used for both charge (toward
 * snake) and retreat (away from snake).
 */
function moveAlongAxis(game, sl, signX, signY) {
  // Dominant = the axis with the larger absolute delta. Tied → horizontal.
  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  const dx = Math.abs(sx - sl.bossX);
  const dy = Math.abs(sy - sl.bossY);
  const horizontalFirst = dx >= dy;

  const first = horizontalFirst ? [signX, 0] : [0, signY];
  const second = horizontalFirst ? [0, signY] : [signX, 0];

  if (first[0] !== 0 || first[1] !== 0) {
    if (tryMove(game, sl, first[0], first[1])) {
      return;
    }
  }
  if (second[0] !== 0 || second[1] !== 0) {
    tryMove(game, sl, second[0], second[1]);
  }
}

function strafe(game, sl, sx, sy) {
  // Strafe perpendicular to the snake-boss vector. If the boss is
  // mostly east/west of the snake, strafe N/S; otherwise strafe E/W.
  // Direction sign comes from `strafeDirection`; flips on a wall hit
  // so the boss zig-zags rather than getting pinned in a corner.
  const dx = Math.abs(sx - sl.bossX);
  const dy = Math.abs(sy - sl.bossY);
  const verticalStrafe = dx >= dy;
  let stepX = verticalStrafe ? 0 : sl.strafeDirection;
  let stepY = verticalStrafe ? sl.strafeDirection : 0;
  if (tryMove(game, sl, stepX, stepY)) {
    return;
  }
  sl.strafeDirection = -sl.strafeDirection;
  stepX = -stepX;
  stepY = -stepY;
  tryMove(game, sl, stepX, stepY);
}

function tryMove(game, sl, dx, dy) {
  if (dx === 0 && dy === 0) {
    return false;
  }
  const nx = sl.bossX + dx;
  const ny = sl.bossY + dy;
  if (!footprintFits(game, nx, ny)) {
    return false;
  }
  // Don't step the footprint onto the snake.
  const headIdx = game.snake.headIndex;
  const sx = game.snake.snakeX[headIdx];
  const sy = game.snake.snakeY[headIdx];
  if (sx >= nx && sx < nx + BOSS_SIZE && sy >= ny && sy < ny + BOSS_SIZE) {
    return false;
  }
  sl.bossX = nx;
  sl.bossY = ny;
  return true;
}

/** True iff the BOSS_SIZE×BOSS_SIZE footprint at (x, y) is fully inside
 * the arena and clear of walls. */
function footprintFits(game, x, y) {
  for (let dy = 0; dy < BOSS_SIZE; dy++) {
    for (let dx = 0; dx < BOSS_SIZE; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (
        cx < ARENA_INNER_X0 ||
        cx >= ARENA_INNER_X0 + ARENA_INNER_SIZE ||
        cy < ARENA_INNER_Y0 ||
        cy >= ARENA_INNER_Y0 + ARENA_INNER_SIZE
      ) {
        return false;
      }
      if (game.grid.isWallCell(cx, cy)) {
        return false;
      }
    }
  }
  return true;
}
