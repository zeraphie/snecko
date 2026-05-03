// boss-tick.js — Boss fight game loop: dual-timer tick, entry, victory, and death handlers

import { applyArena } from "../boss/arena.js";
import { BossEntity } from "../boss/entity.js";
import { getBossDef } from "../boss/bosses/index.js";
import { FLOW_TICKS as ALGORITHM_FLOW_TICKS } from "../boss/bosses/the-algorithm.js";
import { getPlayerCells } from "../boss/player.js";
import { updateProjectiles, checkProjectileCollision } from "../boss/projectiles.js";
import {
  spawnPlayerBullet,
  updatePlayerBullets,
  checkPlayerBulletCollision,
  removeHitBullets,
} from "../boss/player-bullets.js";
import { FightController } from "../boss/fight.js";
import { generateContrabandPool } from "../upgrades/contraband/index.js";
import {
  STATE_BOSS,
  STATE_CONTRABAND,
  STATE_DEAD,
  BOSS_TICK_MS,
  BOSS_MOVE_MS,
  PLAYER_FIRE_INTERVAL,
  PLAYER_BULLET_INTERVAL,
  BOSS_FOOD_REWARD,
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
} from "./constants.js";

// ── Modifier helpers ───────────────────────────────────────────────

/**
 * Advances every active arena modifier by one tick.
 * Expired anchor-lock modifiers have their wall cells removed from the grid.
 *
 * @param {import('./index.js').Game} game
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
 * @param {import('./index.js').Game} game
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
 * @param {import('./index.js').Game} game
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
 * @param {import('./index.js').Game} game
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

// ── Boss tick (dual timer) ─────────────────────────────────────────

/**
 * Dual-timer tick for STATE_BOSS.
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
 */
export function _bossTick() {
  const now = Date.now();
  const grid = this.grid;

  // ── Boss sub-tick (120ms) — runs first so countdowns resolve before movement ─
  if (now - this._lastBossTickTime >= BOSS_TICK_MS) {
    this._lastBossTickTime = now;

    // 1. Status countdowns
    if (this._playerInvulTicks > 0) {
      this._playerInvulTicks--;
    }
    if (this._playerStaggerTicks > 0) {
      this._playerStaggerTicks--;
    }
    if (this._jailFreeCooldown > 0) {
      this._jailFreeCooldown--;
      if (this._jailFreeCooldown === 0) {
        this._jailFreeReady = true;
      }
    }

    // 2. Phase advance + boss fires
    this._fight.advancePhase(this._boss.hp);
    if (this._fight.shouldFire(this._boss._staggerTicks > 0)) {
      const fireX = this._boss.x + Math.floor(this._boss.width / 2);
      const fireY = this._boss.y + this._boss.height - 1;
      const shots = this._fight.buildShots(fireX, fireY, grid.playerX, grid.playerY);
      for (const shot of shots) {
        this._projectiles.push(shot);
      }
    }

    // 3. Boss drift
    this._boss.update(grid.width);

    // 4. Special ability (after intro ends)
    if (this._fight.phase !== BOSS_PHASE_INTRO) {
      this._bossSpecialCounter++;
      if (this._bossSpecialCounter >= BOSS_SPECIAL_INTERVAL) {
        this._bossSpecialCounter = 0;
        const def = getBossDef(this.upgrades.mutation);
        if (def.special) {
          def.special(this);
        }
      }
    }

    // 5. Modifier countdown
    _updateBossModifiers(this);
  }

  // ── Movement sub-tick (~30 Hz) ────────────────────────────────
  if (now - this._lastBossMoveTime >= BOSS_MOVE_MS) {
    this._lastBossMoveTime = now;

    // 1. Player movement (skipped while staggered)
    const hasDangerTrail = this._contraband.some((c) => c.id === "danger_noodle");
    const hasEchoZone = this._contraband.some((c) => c.id === "double_snake");
    if (this._playerStaggerTicks === 0 && this._heldDirection) {
      const prevX = grid.playerX;
      const prevY = grid.playerY;

      const result = _tryMovePlayer(this);
      if (result === "exit") {
        return;
      }

      if (result === "moved" && hasDangerTrail) {
        this._bossModifiers.push({
          type: "danger_trail",
          x: prevX,
          y: prevY,
          ticksLeft: DANGER_TRAIL_TICKS,
        });
      }

      if (result === "moved" && hasEchoZone) {
        _pushEchoZone(this, grid.playerX, grid.playerY);
      }
    }

    // 2. Algorithm current push — only during the flow phase, only when
    //    the player is standing on one of the river's cells. Per-cell
    //    `flowDx/flowDy` lets the river curve.
    for (const mod of this._bossModifiers) {
      if (mod.type !== "algorithm_current" || !mod.driftActive) {
        continue;
      }
      const cell = mod.cells.find((c) => c.x === grid.playerX && c.y === grid.playerY);
      if (cell) {
        const px = grid.playerX + cell.flowDx;
        const py = grid.playerY + cell.flowDy;
        const hasHungry = this._contraband.some((c) => c.id === "snake_hungry");
        const vRange = hasHungry ? HUNGRY_VERTICAL_RANGE : 0;
        if (
          grid.isInBounds(px, py) &&
          !grid.isWallCell(px, py) &&
          !this._boss.isBodyCell(px, py) &&
          !this._boss.isWeakCell(px, py) &&
          py >= this._playerSpawnY - vRange &&
          py <= this._playerSpawnY + vRange
        ) {
          grid.playerX = px;
          grid.playerY = py;
        }
        break;
      }
    }

    // 3. Trail & echo zone damage vs boss
    if (hasDangerTrail && this._boss._staggerTicks === 0) {
      for (const mod of this._bossModifiers) {
        if (mod.type !== "danger_trail") {
          continue;
        }
        if (this._boss.isWeakCell(mod.x, mod.y)) {
          const { defeated } = this._boss.hit();
          if (defeated) {
            this._exitBossVictory();
            return;
          }
          break;
        } else if (this._boss.isBodyCell(mod.x, mod.y)) {
          this._boss.hitBodyCell(mod.x, mod.y);
          break;
        }
      }
    }

    if (hasEchoZone && this._boss._staggerTicks === 0) {
      for (const mod of this._bossModifiers) {
        if (mod.type !== "echo_zone") {
          continue;
        }
        if (this._boss.isWeakCell(mod.x, mod.y)) {
          const { defeated } = this._boss.hit();
          if (defeated) {
            this._exitBossVictory();
            return;
          }
          break;
        } else if (this._boss.isBodyCell(mod.x, mod.y)) {
          this._boss.hitBodyCell(mod.x, mod.y);
          break;
        }
      }
    }

    // 4. Player auto-fire (snake_hungry halves fire interval when close)
    let fireInterval = PLAYER_FIRE_INTERVAL;
    if (this._contraband.some((c) => c.id === "snake_hungry")) {
      const bossCx = this._boss.x + Math.floor(this._boss.width / 2);
      const bossCy = this._boss.y + Math.floor(this._boss.height / 2);
      const dist = Math.max(Math.abs(grid.playerX - bossCx), Math.abs(grid.playerY - bossCy));
      if (dist <= HUNGRY_RANGE) {
        fireInterval = Math.max(1, Math.floor(PLAYER_FIRE_INTERVAL / 2));
      }
    }
    this._playerFireCounter++;
    if (this._playerFireCounter >= fireInterval) {
      this._playerFireCounter = 0;
      spawnPlayerBullet(this);
    }

    // 5. Player bullet advance + collision vs boss (throttled by PLAYER_BULLET_INTERVAL)
    const driftCells = _collectDriftCells(this._bossModifiers);
    this._playerBulletMoveCounter++;
    const advanceBullets = this._playerBulletMoveCounter >= PLAYER_BULLET_INTERVAL;
    if (advanceBullets) {
      this._playerBulletMoveCounter = 0;
      updatePlayerBullets(this._playerBullets, grid, driftCells);
    }
    if (advanceBullets && this._playerBullets.length > 0 && this._boss._staggerTicks === 0) {
      const { weakHits, bodyHits, hitIndices } = checkPlayerBulletCollision(
        this._playerBullets,
        this._boss
      );
      if (hitIndices.length > 0) {
        removeHitBullets(this._playerBullets, hitIndices);
      }

      // Body cell damage
      for (const hit of bodyHits) {
        this._boss.hitBodyCell(hit.x, hit.y);
      }

      // Weak-point hits (boss HP damage)
      const hasCollateral = this._contraband.some((c) => c.id === "collateral_hissage");
      for (let i = 0; i < weakHits; i++) {
        let { defeated } = this._boss.hit();
        if (!defeated && hasCollateral) {
          ({ defeated } = this._boss.hit());
        }
        if (defeated) {
          this._exitBossVictory();
          return;
        }
      }
    }

    // 6. Boss projectile advance + collision vs player
    updateProjectiles(this._projectiles, grid, driftCells);
    const playerCells = getPlayerCells(
      grid.playerX,
      grid.playerY,
      this._playerFacing.dx,
      this._playerFacing.dy
    );
    if (this._playerInvulTicks === 0 && checkProjectileCollision(this._projectiles, playerCells)) {
      if (this._jailFreeReady) {
        this._jailFreeReady = false;
        this._jailFreeCooldown = JAIL_FREE_COOLDOWN;
        this._playerInvulTicks = BOSS_INVUL_TICKS;
        this._projectiles = this._projectiles.filter(
          (p) => !playerCells.some((c) => c.x === p.x && c.y === p.y)
        );
      } else if (this._gomuShieldActive) {
        this._gomuShieldActive = false;
        this._playerStaggerTicks = GOMU_STAGGER_TICKS;
        this._playerInvulTicks = GOMU_STAGGER_TICKS;
        this._projectiles = this._projectiles.filter(
          (p) => !playerCells.some((c) => c.x === p.x && c.y === p.y)
        );
      } else {
        this._exitBossDeath(DEATH_PROJECTILE);
      }
    }
  }
}

// ── Entry ──────────────────────────────────────────────────────────

/**
 * Sets up the boss arena, spawns the boss entity and player, and transitions
 * to STATE_BOSS.
 *
 * Called when the snake eats a red food cell.
 */
export function _enterBossFight() {
  const def = getBossDef(this.upgrades.mutation);

  // Hydrate shape from manifest (idempotent — boss defs are mutated once and reused)
  if (!def.shape) {
    const shape = this.manifest.bossShapes[def.shapeFile];
    def.shape = shape;
    def.width = shape.width;
    def.height = shape.height;
  }

  const arena = this.manifest.arenas.find((a) => a.name === def.arena) ?? this.manifest.arenas[0];
  applyArena(this.grid, arena);

  const innerWidth = GRID_W - 2;
  const spawnX = 1 + Math.floor((innerWidth - def.width) / 2);

  const boss = new BossEntity(spawnX, arena.bossSpawn.y, def);

  this.grid.playerX = arena.snakeSpawn.x;
  this.grid.playerY = arena.snakeSpawn.y;
  this._playerSpawnY = arena.snakeSpawn.y;

  this.grid.clearMasks("snake");

  this._boss = boss;
  this._fight = new FightController();
  this._heldDirection = null;
  this._playerFacing = { dx: 0, dy: -1 };
  this._projectiles = [];
  this._playerBullets = [];
  this._playerFireCounter = 0;
  this._playerBulletMoveCounter = 0;
  this._playerInvulTicks = 0;
  this._playerStaggerTicks = 0;
  this._gomuShieldActive = this._contraband.some((c) => c.id === "gomu_gomu");
  const hasJailFree = this._contraband.some((c) => c.id === "get_out_of_jail_free");
  this._jailFreeReady = hasJailFree;
  this._jailFreeCooldown = 0;
  this._bossModifiers = [];
  this._bossSpecialCounter = 0;
  this._lastBossTickTime = Date.now();
  this._lastBossMoveTime = Date.now();
  this.state = STATE_BOSS;
}

// ── Victory ────────────────────────────────────────────────────────

/**
 * Awards BOSS_FOOD_REWARD food-progress, then opens the Contraband draft.
 */
export function _exitBossVictory() {
  this.foodEaten += BOSS_FOOD_REWARD;
  this._boss = null;
  this._fight = null;
  this._heldDirection = null;

  this._playerBullets = [];
  _clearBossModifiers(this);

  this._contrabandPool = generateContrabandPool(Math.random);
  this._contrabandSelection = 0;
  this.state = STATE_CONTRABAND;
}

// ── Death ──────────────────────────────────────────────────────────

/**
 * Handles player death during a boss fight.
 *
 * @param {string} cause — 'wall' | 'boss' | 'projectile'
 */
export function _exitBossDeath(cause) {
  this.snake.deathCause = cause;
  this._boss = null;
  this._fight = null;
  this._heldDirection = null;

  this._playerBullets = [];
  _clearBossModifiers(this);
  this._endRun();
}
