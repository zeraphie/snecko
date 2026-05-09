// bullet-hell.js — Bullet-hell boss style.
//
// Player Y-locked, auto-fires upward; boss has body cells + weak point + HP,
// fires projectiles down, drifts horizontally. Win = boss HP zero; lose =
// touch boss / wall / projectile. Hosts: Anchor, Algorithm, Absolute Unit.

import { applyArena } from "../arena.js";
import { BossEntity } from "../entity.js";
import { getBossDef } from "../bosses/index.js";
import { FLOW_TICKS as ALGORITHM_FLOW_TICKS } from "../bosses/the-algorithm.js";
import { getPlayerCells } from "../player.js";
import { updateProjectiles, checkProjectileCollision } from "../projectiles.js";
import {
  spawnPlayerBullet,
  updatePlayerBullets,
  checkPlayerBulletCollision,
  removeHitBullets,
} from "../player-bullets.js";
import { FightController } from "../fight.js";
import {
  BOSS_TICK_MS,
  BOSS_MOVE_MS,
  PLAYER_FIRE_INTERVAL,
  PLAYER_BULLET_INTERVAL,
  BOSS_INVUL_TICKS,
  BOSS_PHASE_INTRO,
  BOSS_SPECIAL_INTERVAL,
  GOMU_STAGGER_TICKS,
  JAIL_FREE_COOLDOWN,
  HUNGRY_RANGE,
  HUNGRY_VERTICAL_RANGE,
  DANGER_TRAIL_TICKS,
  ECHO_ZONE_TICKS,
  ECHO_ZONE_MAX,
  GRID_W,
  DEATH_WALL,
  DEATH_BOSS,
  DEATH_PROJECTILE,
} from "../../game/constants.js";

// ── Modifier helpers ───────────────────────────────────────────────

/**
 * Advances every active arena modifier by one tick.
 * Expired anchor-lock modifiers have their wall cells removed from the grid.
 *
 * @param {import('../../game/index.js').Game} game
 */
function _updateBossModifiers(game) {
  for (let i = game._bossModifiers.length - 1; i >= 0; i--) {
    const mod = game._bossModifiers[i];
    mod.ticksLeft--;

    // algorithm_current runs telegraph → flow → expire. Once the
    // remaining ticks fall to FLOW_TICKS, switch on the drift.
    if (mod.type === "algorithm_current" && mod.state === "telegraph") {
      if (mod.ticksLeft <= ALGORITHM_FLOW_TICKS) {
        mod.state = "flow";
        mod.driftActive = true;
      }
    }

    if (mod.ticksLeft <= 0) {
      if (mod.type === "anchor_lock") {
        for (const cell of mod.cells) {
          game.grid.clearCell("wall", cell.x, cell.y);
        }
      }
      game._bossModifiers.splice(i, 1);
    }
  }
}

/**
 * Clears all active modifiers and removes any lock walls they placed.
 * Called on boss exit (victory or death) to leave the grid clean.
 *
 * @param {import('../../game/index.js').Game} game
 */
function _clearBossModifiers(game) {
  for (const mod of game._bossModifiers) {
    if (mod.type === "anchor_lock") {
      for (const cell of mod.cells) {
        game.grid.clearCell("wall", cell.x, cell.y);
      }
    }
  }
  game._bossModifiers = [];
  game._bossSpecialCounter = 0;
}

// ── Player movement helper ─────────────────────────────────────────

/**
 * Attempts one step of player movement in the held direction.
 * Handles all collision outcomes (wall, lock, weak-point, boss body, open).
 * Returns 'exit' if the tick should abort (player died or boss defeated),
 * 'blocked' if the player didn't move, or 'moved' if the player advanced.
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {'exit' | 'blocked' | 'moved'}
 */
function _tryMovePlayer(game) {
  const grid = game.grid;
  const { dx, dy } = game._heldDirection;
  const nx = grid.playerX + dx;
  const ny = grid.playerY + dy;

  // Y position lock — block vertical movement outside allowed range
  if (dy !== 0) {
    const hasHungry = game._contraband.some((c) => c.id === "snake_hungry");
    const range = hasHungry ? HUNGRY_VERTICAL_RANGE : 0;
    if (ny < game._playerSpawnY - range || ny > game._playerSpawnY + range) {
      return "blocked";
    }
  }

  // Out-of-bounds — always lethal
  if (!grid.isInBounds(nx, ny)) {
    game._exitBossDeath(DEATH_WALL);
    return "exit";
  }

  if (grid.isWallCell(nx, ny)) {
    // Anchor lock cell — charging clears it
    let clearedLock = false;
    for (let i = game._bossModifiers.length - 1; i >= 0; i--) {
      const mod = game._bossModifiers[i];
      if (mod.type !== "anchor_lock") {
        continue;
      }
      const cellIdx = mod.cells.findIndex((c) => c.x === nx && c.y === ny);
      if (cellIdx >= 0) {
        grid.clearCell("wall", nx, ny);
        mod.cells.splice(cellIdx, 1);
        if (mod.cells.length === 0) {
          game._bossModifiers.splice(i, 1);
        }
        clearedLock = true;
        break;
      }
    }
    if (!clearedLock) {
      game._exitBossDeath(DEATH_WALL);
      return "exit";
    }
    return "blocked";
  }

  if (game._boss.isWeakCell(nx, ny)) {
    // Weak point — pass through (damage dealt by bullets, not ram)
    grid.playerX = nx;
    grid.playerY = ny;
    return "moved";
  }

  if (game._boss.isBodyCell(nx, ny)) {
    if (game._gomuShieldActive) {
      game._gomuShieldActive = false;
      game._playerStaggerTicks = GOMU_STAGGER_TICKS;
      game._playerInvulTicks = GOMU_STAGGER_TICKS;
      return "blocked";
    }
    game._exitBossDeath(DEATH_BOSS);
    return "exit";
  }

  // Open cell — move player
  grid.playerX = nx;
  grid.playerY = ny;
  return "moved";
}

// ── Echo zone helper ───────────────────────────────────────────────

/**
 * Pushes an echo_zone modifier at (x, y). Skips duplicates at same position.
 * Evicts the oldest echo if the cap is hit.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} x
 * @param {number} y
 */
function _pushEchoZone(game, x, y) {
  const mods = game._bossModifiers;

  for (let i = mods.length - 1; i >= 0; i--) {
    if (mods[i].type === "echo_zone") {
      if (mods[i].x === x && mods[i].y === y) {
        return;
      }
      break;
    }
  }

  let count = 0;
  for (let i = 0; i < mods.length; i++) {
    if (mods[i].type === "echo_zone") {
      count++;
      if (count > ECHO_ZONE_MAX - 1) {
        mods.splice(i, 1);
        break;
      }
    }
  }

  mods.push({ type: "echo_zone", x, y, ticksLeft: ECHO_ZONE_TICKS });
}

// ── Drift cells helper ────────────────────────────────────────────

/**
 * Collects cells from any active drift modifier (e.g. The Algorithm's
 * `algorithm_current` while in flow phase). Used by both projectile and
 * player-bullet update passes to bend trajectories that pass through.
 *
 * Returns null when no drift is active so the consumers skip the lookup.
 *
 * @param {Array<object>} modifiers
 * @returns {Array<{x:number, y:number, flowDx:number, flowDy:number}> | null}
 */
function _collectDriftCells(modifiers) {
  let result = null;
  for (const mod of modifiers) {
    if (!mod.driftActive || !mod.cells) {
      continue;
    }
    if (!result) {
      result = [];
    }
    for (const cell of mod.cells) {
      result.push(cell);
    }
  }
  return result;
}

// ── Style contract ─────────────────────────────────────────────────

/**
 * Sets up the bullet-hell arena, spawns the boss entity and player, and
 * primes the dual-timer state. Called from the dispatcher's `_enterBossFight`.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {import('../bosses/index.js').BossDef} def
 */
export function setup(game, def) {
  // Hydrate shape from manifest (idempotent — boss defs are mutated once and reused)
  if (!def.shape) {
    const shape = game.manifest.bossShapes[def.shapeFile];
    def.shape = shape;
    def.width = shape.width;
    def.height = shape.height;
  }

  const arena = game.manifest.arenas.find((a) => a.name === def.arena) ?? game.manifest.arenas[0];
  applyArena(game.grid, arena);

  const innerWidth = GRID_W - 2;
  const spawnX = 1 + Math.floor((innerWidth - def.width) / 2);

  const boss = new BossEntity(spawnX, arena.bossSpawn.y, def);

  game.grid.playerX = arena.snakeSpawn.x;
  game.grid.playerY = arena.snakeSpawn.y;
  game._playerSpawnY = arena.snakeSpawn.y;

  game.grid.clearMasks("snake");

  game._boss = boss;
  game._fight = new FightController();
  game._heldDirection = null;
  game._playerFacing = { dx: 0, dy: -1 };
  game._projectiles = [];
  game._playerBullets = [];
  game._playerFireCounter = 0;
  game._playerBulletMoveCounter = 0;
  game._playerInvulTicks = 0;
  game._playerStaggerTicks = 0;
  game._gomuShieldActive = game._contraband.some((c) => c.id === "gomu_gomu");
  const hasJailFree = game._contraband.some((c) => c.id === "get_out_of_jail_free");
  game._jailFreeReady = hasJailFree;
  game._jailFreeCooldown = 0;
  game._bossModifiers = [];
  game._bossSpecialCounter = 0;
  game._lastBossTickTime = Date.now();
  game._lastBossMoveTime = Date.now();
}

/**
 * Dual-timer tick for bullet-hell.
 *
 * Two independent sub-loops run at different rates:
 *
 * **Movement sub-tick** (~30 Hz / BOSS_MOVE_MS):
 *   Player movement, current push, trail/echo damage, auto-fire,
 *   player bullet advance + collision, boss projectile advance + collision.
 *
 * **Boss sub-tick** (BOSS_TICK_MS / 120ms):
 *   Status countdowns, phase advance + boss fires, boss drift,
 *   special ability, modifier countdown.
 *
 * Player input (movement + auto-fire) is gated on phase != INTRO so the
 * intro overlay window is non-interactive. Boss firing and specials are
 * already intro-gated by FightController / the special-counter check.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function tick(game) {
  const now = Date.now();
  const grid = game.grid;
  const inIntro = game._fight.phase === BOSS_PHASE_INTRO;

  // ── Boss sub-tick (120ms) — runs first so countdowns resolve before movement ─
  if (now - game._lastBossTickTime >= BOSS_TICK_MS) {
    game._lastBossTickTime = now;

    // 1. Status countdowns
    if (game._playerInvulTicks > 0) {
      game._playerInvulTicks--;
    }
    if (game._playerStaggerTicks > 0) {
      game._playerStaggerTicks--;
    }
    if (game._jailFreeCooldown > 0) {
      game._jailFreeCooldown--;
      if (game._jailFreeCooldown === 0) {
        game._jailFreeReady = true;
      }
    }

    // 2. Phase advance + boss fires
    game._fight.advancePhase(game._boss.hp);
    if (game._fight.shouldFire(game._boss._staggerTicks > 0)) {
      const fireX = game._boss.x + Math.floor(game._boss.width / 2);
      const fireY = game._boss.y + game._boss.height - 1;
      const shots = game._fight.buildShots(fireX, fireY, grid.playerX, grid.playerY);
      for (const shot of shots) {
        game._projectiles.push(shot);
      }
    }

    // 3. Boss drift
    game._boss.update(grid.width);

    // 4. Special ability (after intro ends)
    if (game._fight.phase !== BOSS_PHASE_INTRO) {
      game._bossSpecialCounter++;
      if (game._bossSpecialCounter >= BOSS_SPECIAL_INTERVAL) {
        game._bossSpecialCounter = 0;
        const def = getBossDef(game.upgrades.mutation);
        if (def.special) {
          def.special(game);
        }
      }
    }

    // 5. Modifier countdown
    _updateBossModifiers(game);
  }

  // ── Movement sub-tick (~30 Hz) ────────────────────────────────
  if (now - game._lastBossMoveTime >= BOSS_MOVE_MS) {
    game._lastBossMoveTime = now;

    // 1. Player movement (skipped during intro and while staggered)
    const hasDangerTrail = game._contraband.some((c) => c.id === "danger_noodle");
    const hasEchoZone = game._contraband.some((c) => c.id === "double_snake");
    if (!inIntro && game._playerStaggerTicks === 0 && game._heldDirection) {
      const prevX = grid.playerX;
      const prevY = grid.playerY;

      const result = _tryMovePlayer(game);
      if (result === "exit") {
        return;
      }

      if (result === "moved" && hasDangerTrail) {
        game._bossModifiers.push({
          type: "danger_trail",
          x: prevX,
          y: prevY,
          ticksLeft: DANGER_TRAIL_TICKS,
        });
      }

      if (result === "moved" && hasEchoZone) {
        _pushEchoZone(game, grid.playerX, grid.playerY);
      }
    }

    // 2. Algorithm current push — only during the flow phase, only when
    //    the player is standing on one of the river's cells. Per-cell
    //    `flowDx/flowDy` lets the river curve.
    for (const mod of game._bossModifiers) {
      if (mod.type !== "algorithm_current" || !mod.driftActive) {
        continue;
      }
      const cell = mod.cells.find((c) => c.x === grid.playerX && c.y === grid.playerY);
      if (cell) {
        const px = grid.playerX + cell.flowDx;
        const py = grid.playerY + cell.flowDy;
        const hasHungry = game._contraband.some((c) => c.id === "snake_hungry");
        const vRange = hasHungry ? HUNGRY_VERTICAL_RANGE : 0;
        if (
          grid.isInBounds(px, py) &&
          !grid.isWallCell(px, py) &&
          !game._boss.isBodyCell(px, py) &&
          !game._boss.isWeakCell(px, py) &&
          py >= game._playerSpawnY - vRange &&
          py <= game._playerSpawnY + vRange
        ) {
          grid.playerX = px;
          grid.playerY = py;
        }
        break;
      }
    }

    // 3. Trail & echo zone damage vs boss
    if (hasDangerTrail && game._boss._staggerTicks === 0) {
      for (const mod of game._bossModifiers) {
        if (mod.type !== "danger_trail") {
          continue;
        }
        if (game._boss.isWeakCell(mod.x, mod.y)) {
          const { defeated } = game._boss.hit();
          if (defeated) {
            game._exitBossVictory();
            return;
          }
          break;
        } else if (game._boss.isBodyCell(mod.x, mod.y)) {
          game._boss.hitBodyCell(mod.x, mod.y);
          break;
        }
      }
    }

    if (hasEchoZone && game._boss._staggerTicks === 0) {
      for (const mod of game._bossModifiers) {
        if (mod.type !== "echo_zone") {
          continue;
        }
        if (game._boss.isWeakCell(mod.x, mod.y)) {
          const { defeated } = game._boss.hit();
          if (defeated) {
            game._exitBossVictory();
            return;
          }
          break;
        } else if (game._boss.isBodyCell(mod.x, mod.y)) {
          game._boss.hitBodyCell(mod.x, mod.y);
          break;
        }
      }
    }

    // 4. Player auto-fire (snake_hungry halves fire interval when close).
    //    Skipped during intro so the intro window stays non-interactive.
    if (!inIntro) {
      let fireInterval = PLAYER_FIRE_INTERVAL;
      if (game._contraband.some((c) => c.id === "snake_hungry")) {
        const bossCx = game._boss.x + Math.floor(game._boss.width / 2);
        const bossCy = game._boss.y + Math.floor(game._boss.height / 2);
        const dist = Math.max(Math.abs(grid.playerX - bossCx), Math.abs(grid.playerY - bossCy));
        if (dist <= HUNGRY_RANGE) {
          fireInterval = Math.max(1, Math.floor(PLAYER_FIRE_INTERVAL / 2));
        }
      }
      game._playerFireCounter++;
      if (game._playerFireCounter >= fireInterval) {
        game._playerFireCounter = 0;
        spawnPlayerBullet(game);
      }
    }

    // 5. Player bullet advance + collision vs boss (throttled by PLAYER_BULLET_INTERVAL)
    const driftCells = _collectDriftCells(game._bossModifiers);
    game._playerBulletMoveCounter++;
    const advanceBullets = game._playerBulletMoveCounter >= PLAYER_BULLET_INTERVAL;
    if (advanceBullets) {
      game._playerBulletMoveCounter = 0;
      updatePlayerBullets(game._playerBullets, grid, driftCells);
    }
    if (advanceBullets && game._playerBullets.length > 0 && game._boss._staggerTicks === 0) {
      const { weakHits, bodyHits, hitIndices } = checkPlayerBulletCollision(
        game._playerBullets,
        game._boss
      );
      if (hitIndices.length > 0) {
        removeHitBullets(game._playerBullets, hitIndices);
      }

      // Body cell damage
      for (const hit of bodyHits) {
        game._boss.hitBodyCell(hit.x, hit.y);
      }

      // Weak-point hits (boss HP damage)
      const hasCollateral = game._contraband.some((c) => c.id === "collateral_hissage");
      for (let i = 0; i < weakHits; i++) {
        let { defeated } = game._boss.hit();
        if (!defeated && hasCollateral) {
          ({ defeated } = game._boss.hit());
        }
        if (defeated) {
          game._exitBossVictory();
          return;
        }
      }
    }

    // 6. Boss projectile advance + collision vs player
    updateProjectiles(game._projectiles, grid, driftCells);
    const playerCells = getPlayerCells(
      grid.playerX,
      grid.playerY,
      game._playerFacing.dx,
      game._playerFacing.dy
    );
    if (game._playerInvulTicks === 0 && checkProjectileCollision(game._projectiles, playerCells)) {
      if (game._jailFreeReady) {
        game._jailFreeReady = false;
        game._jailFreeCooldown = JAIL_FREE_COOLDOWN;
        game._playerInvulTicks = BOSS_INVUL_TICKS;
        game._projectiles = game._projectiles.filter(
          (p) => !playerCells.some((c) => c.x === p.x && c.y === p.y)
        );
      } else if (game._gomuShieldActive) {
        game._gomuShieldActive = false;
        game._playerStaggerTicks = GOMU_STAGGER_TICKS;
        game._playerInvulTicks = GOMU_STAGGER_TICKS;
        game._projectiles = game._projectiles.filter(
          (p) => !playerCells.some((c) => c.x === p.x && c.y === p.y)
        );
      } else {
        game._exitBossDeath(DEATH_PROJECTILE);
      }
    }
  }
}

/**
 * Routes directional input into the held-direction model. Vertical input
 * is rejected unless `snake_hungry` is active (Y-lock with HUNGRY_VERTICAL_RANGE).
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} dx
 * @param {number} dy
 */
export function onInput(game, dx, dy) {
  if (dy !== 0 && !game._contraband.some((c) => c.id === "snake_hungry")) {
    return;
  }
  game._heldDirection = { dx, dy };
  game._playerFacing = { dx: 0, dy: -1 };
}

/**
 * Cleans up bullet-hell-specific state. Called from the dispatcher's
 * `_exitBossVictory` / `_exitBossDeath` before style-agnostic transitions.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function teardown(game) {
  game._boss = null;
  game._fight = null;
  game._heldDirection = null;
  game._playerBullets = [];
  _clearBossModifiers(game);
}
