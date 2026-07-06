// cull/index.js — Cull mechanic entry point.
//
// Sir Reginald Caw hurls things at the player's brood on a wall-clock
// cadence; this module owns the predator state, AI targeting, shield
// handling, and voice surfacing. See PLAN.brood-adr.md for the full
// design.
//
// Step 10: real-time tick + throw cycle. The cull is the engine's first
// wall-clock-driven mechanic — `tickCull` runs every frame (not on the
// food-bite cadence) and advances an accumulated predator clock. Every
// THROW_INTERVAL_MS Reginald picks a target, telegraphs it for
// TELEGRAPH_FUSE_MS, then resolves the impact: an alive kin at the
// target cell turns to memorial; an empty cell is a miss.
//
// Step 11: search/hunt AI + pity timer. Target selection moved to
// `./targeting.js`; impact resolution drives the persistent mode (kill
// → hunt; miss in hunt → search; miss in search → bump missStreak).
// Shields land in Step 13.

import {
  TERRAIN_KIN_HEAD,
  TERRAIN_KIN_BODY,
  TERRAIN_MEMORIAL_HEAD,
  TERRAIN_MEMORIAL_BODY,
} from "../../grid/constants.js";
import {
  SHIELDS_PER_ACT,
  THROW_INTERVAL_MS,
  TELEGRAPH_FUSE_MS,
  PLUS_TELEGRAPH_FUSE_MS,
  LINE_TELEGRAPH_FUSE_MS,
  IMPACT_FLASH_MS,
  MAX_CULL_DT_MS,
  IDLE_TAUNT_MIN_MS,
  SCORE_PER_KIN,
  SCORE_PER_UNUSED_SHIELD,
  MINE_STUN_MS,
} from "./constants.js";
import { pickTarget } from "./targeting.js";
import {
  pushDeathToast,
  pushIdleTaunt,
  pushPityTaunt,
  pushBlockTaunt,
  pushStunTaunt,
  tickVoice,
  rollIdleTauntInterval,
} from "./voice.js";
import { STATE_DEAD_BROOD, DEATH_BOMB } from "../../game/constants.js";
import { GAME_OVER_TAUNTS } from "../../../text/cull/index.js";

/**
 * Initialises the cull mechanic state on `game.mechanic`. Called from
 * `generateBroodGrid` at act start; overwrites any previous mechanic
 * state (mutation switch is a clean transition — no teardown).
 *
 * State shape:
 *   type           — "cull" discriminator
 *   state          — predator phase: "idle" | "telegraph" | "impact"
 *                    ("windup" / "recovery" are reserved for future
 *                    pose work — the v1 cycle is idle→telegraph→impact)
 *   throwTimer     — ms accumulated toward the next throw (runs
 *                    continuously, including during telegraph/impact)
 *   phaseTimer     — ms accumulated within the current non-idle phase
 *   lastTickAt     — wall-clock ms of the previous tick; null until the
 *                    first `tickCull` reads the clock. Drives the dt the
 *                    predator clock advances by (clamped, see MAX_CULL_DT_MS)
 *   targetX/Y      — selected throw target (-1 when no throw is queued)
 *   targetingMode  — "search" (default) | "hunt" (entered on any cell
 *                    hit). Hunt persists through misses — Reginald keeps
 *                    probing cardinals of ANY previously-hit cell in the
 *                    current sequence until every eligible neighbour has
 *                    been tried, then reverts to search.
 *   huntHitCells   — Set of "x,y" keys of every hit landed in the current
 *                    hunt sequence. Multi-pivot: the picker probes
 *                    cardinals of every cell in this set, so hitting the
 *                    middle of a T doesn't lose track of the other arms
 *                    when a subsequent hit shifts `lastKill`.
 *   huntTriedCells — Set of "x,y" keys already targeted (hits + misses).
 *                    Accumulates across the whole hunt; cleared with
 *                    `huntHitCells` when hunt exhausts or a kin is sunk.
 *   missStreak     — consecutive misses in SEARCH mode (for pity timer).
 *                    Hunt misses don't bump it — hunt isn't a "miss" in
 *                    the streak sense, it's a probe with prior info.
 *                    Reset on any cell hit.
 *   pityThreshold  — rolled per-throw uniformly in [PITY_MIN, PITY_MAX].
 *                    If `missStreak >= pityThreshold` at throw start, the
 *                    picker forces a hit on a random alive kin.
 *   forcedPity     — flag set by the picker when this throw is a pity-
 *                    forced hit. Step 12 reads it to queue the pity taunt
 *                    before the telegraph fires.
 *   lastKillX/Y    — cell of the most recent kill (drives hunt mode)
 *   kin            — placed kin list; populated during placement
 *   shields        — shield count for the current act
 *   voiceQueue     — pending speech-bubble lines (Step 12).
 *   activeLine     — currently displayed line {text, category, dwellMs}.
 *   activeLineDwellMs — ms the active line has dwelled.
 *   idleTauntElapsedMs — ms since the last idle-taunt push.
 *   nextIdleTauntAt — ms cadence target for the next idle push. First
 *                    interval is fixed at IDLE_TAUNT_MIN_MS (so the
 *                    real-time tick doesn't consume an RNG call before
 *                    any throw fires); subsequent intervals re-roll in
 *                    [MIN, MAX] after each fire.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function initCull(game) {
  game.mechanic = {
    type: "cull",

    // Predator state machine
    state: "idle",
    throwTimer: 0,
    phaseTimer: 0,
    lastTickAt: null,
    targetX: -1,
    targetY: -1,
    // Throw shape currently in flight. "normal" is the default single
    // cell driven by the AI picker; "plus" / "line_h" / "line_v" are
    // food-triggered specials with random placement, longer telegraph,
    // and multi-cell impact.
    throwType: "normal",
    // Set by `onFoodEaten` when the food counter crosses a special
    // threshold; consumed by `tickCull` on the next idle beat.
    pendingSpecial: null,

    // AI targeting
    targetingMode: "search",
    huntHitCells: new Set(),
    huntTriedCells: new Set(),
    missStreak: 0,
    pityThreshold: 0,
    forcedPity: false,
    lastKillX: -1,
    lastKillY: -1,

    // Brood side
    kin: [],
    mines: new Set(),
    // Wall-clock ms remaining on the mine-detonation stun. While
    // positive, `tickCull` doesn't advance `throwTimer` and doesn't
    // consume pending specials — Reginald is frozen. Counts down each
    // tick until it hits 0.
    stunRemaining: 0,
    shields: SHIELDS_PER_ACT,

    // Voice surfacing (Step 12)
    voiceQueue: [],
    activeLine: null,
    activeLineDwellMs: 0,
    idleTauntElapsedMs: 0,
    nextIdleTauntAt: IDLE_TAUNT_MIN_MS,
  };
}

/**
 * Advances the cull mechanic by one food-bite tick. No-op: the cull is
 * real-time-driven (see `tickCull`), so the food-bite hook exists only
 * to satisfy the mutation contract.
 *
 * @param {import('../../game/index.js').Game} _game
 */
export function advanceCull(_game) {
  // Real-time mechanic — nothing to do on the food-bite cadence.
}

/**
 * Routes the game into the brood game-over screen. Picks a random
 * headline taunt from `GAME_OVER_TAUNTS` and stashes it on the game so
 * the screen can render it; flips state to `STATE_DEAD_BROOD`. Called
 * from `tickCull` on the impact→idle transition when no kin remain.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {() => number} rand
 */
function triggerBroodGameOver(game, rand) {
  const taunt = GAME_OVER_TAUNTS[Math.floor(rand() * GAME_OVER_TAUNTS.length)];
  game._broodGameOverTaunt = taunt;
  game.state = STATE_DEAD_BROOD;
}

/**
 * Computes the brood-specific bonuses for an act-clear: per surviving
 * kin and per unused shield. Returns `{ kin, shields, total }` in score
 * points. Does not mutate game state — `tick.js` adds the total to
 * `totalScore` and stashes the breakdown on `_lastActBonuses` for the
 * draft-screen breakdown render.
 *
 * @param {import('../../game/index.js').Game} game
 * @returns {{ kin: number, shields: number, total: number }}
 */
export function computeBroodActClearBonus(game) {
  const m = game.mechanic;
  if (!m || m.type !== "cull") {
    return { kin: 0, shields: 0, total: 0 };
  }
  const survivingKin = m.kin.filter((k) => k.alive).length;
  const unusedShields = game.upgrades?.getConsumable?.("shield")?.charges ?? 0;
  const kin = survivingKin * SCORE_PER_KIN;
  const shields = unusedShields * SCORE_PER_UNUSED_SHIELD;
  return { kin, shields, total: kin + shields };
}

/**
 * Real-time predator tick. Called every frame from `game.tick` (only
 * while STATE_PLAYING) with the current wall-clock time. Advances the
 * accumulated predator clock and steps the throw state machine; a no-op
 * for any non-cull mechanic so the dispatcher can call it blindly.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} now — wall-clock ms (`Date.now()`)
 * @param {() => number} [rand] — RNG for target selection (injectable
 *   for tests; defaults to `Math.random` since the cull is real-time and
 *   not part of the deterministic food/seed streams)
 */
export function tickCull(game, now, rand = Math.random) {
  const m = game.mechanic;
  if (!m || m.type !== "cull") {
    return;
  }

  // First tick just anchors the clock — no dt to spend yet. This also
  // re-anchors after any stretch where `tickCull` wasn't called (e.g.
  // placement / draft), so resuming play never spends a stale gap.
  if (m.lastTickAt === null) {
    m.lastTickAt = now;
    return;
  }
  let dt = now - m.lastTickAt;
  m.lastTickAt = now;
  if (dt < 0) {
    dt = 0;
  } else if (dt > MAX_CULL_DT_MS) {
    // Pause / hidden-tab gap — absorb it instead of bursting throws.
    dt = MAX_CULL_DT_MS;
  }

  // Advance the active non-idle phase first.
  if (m.state === "telegraph") {
    m.phaseTimer += dt;
    if (m.phaseTimer >= telegraphFuseFor(m.throwType)) {
      resolveThrow(game, rand);
      m.state = "impact";
      m.phaseTimer = 0;
    }
  } else if (m.state === "impact") {
    m.phaseTimer += dt;
    if (m.phaseTimer >= IMPACT_FLASH_MS) {
      m.state = "idle";
      m.phaseTimer = 0;
      m.targetX = -1;
      m.targetY = -1;
      m.throwType = "normal";
      // All kin dead → game-over. The impact flash that just finished
      // covers the final kin's death frame, so transitioning to the
      // game-over overlay here lands right after the visual beat.
      if (m.kin.length > 0 && m.kin.every((k) => !k.alive)) {
        triggerBroodGameOver(game, rand);
        return;
      }
    }
  }

  // Idle → next throw. Mine detonation stun takes precedence: no
  // throws (regular or special) while Reginald is stunned; the timer
  // just runs down. After that, specials fire first (they "consume"
  // the regular slot — throwTimer resets so the normal cadence resumes
  // after). Timer only advances while idle so specials effectively
  // pause regular throws for their telegraph + impact window.
  if (m.state === "idle") {
    if (m.stunRemaining > 0) {
      m.stunRemaining = Math.max(0, m.stunRemaining - dt);
    } else if (m.pendingSpecial) {
      beginSpecialThrow(game, m.pendingSpecial, rand);
      m.pendingSpecial = null;
      m.throwTimer = 0;
    } else {
      m.throwTimer += dt;
      if (m.throwTimer >= THROW_INTERVAL_MS) {
        m.throwTimer -= THROW_INTERVAL_MS;
        beginThrow(game, rand);
      }
    }
  }

  // Idle taunt cadence — Reginald talking to himself between throws on
  // a wall-clock `[10, 20] s` interval. Pushed to the voice queue and
  // subject to the normal preemption rules (death/pity take precedence
  // when they fire).
  m.idleTauntElapsedMs += dt;
  if (m.idleTauntElapsedMs >= m.nextIdleTauntAt) {
    pushIdleTaunt(m, rand);
    m.idleTauntElapsedMs = 0;
    m.nextIdleTauntAt = rollIdleTauntInterval(rand);
  }

  // Voice queue — dwell active lines, promote queued lines, preempt
  // when applicable. Runs after the cadence pushes so a same-tick push
  // can be promoted to active immediately.
  tickVoice(m, dt);
}

/**
 * Picks the next throw's target via the targeting module (which writes
 * `targetingMode`, `pityThreshold`, and `forcedPity` on the mechanic
 * state) and enters the telegraph phase.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {() => number} rand
 */
function beginThrow(game, rand) {
  const m = game.mechanic;
  m.throwType = "normal";
  const target = pickTarget(game, rand);
  m.targetX = target.x;
  m.targetY = target.y;
  // Pity taunt fires BEFORE the telegraph lights the cell — Reginald
  // gets his "found you" beat first. Bypass the queue: the line must
  // coincide with the fuse window for the effect to land.
  if (m.forcedPity) {
    pushPityTaunt(m, rand);
  }
  m.state = "telegraph";
  m.phaseTimer = 0;
}

/**
 * Fires a food-triggered special throw. Placement is uniformly random
 * (no AI targeting). Pity/streak state is untouched — specials aren't
 * regular throws.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {"plus" | "line"} kind
 * @param {() => number} rand
 */
function beginSpecialThrow(game, kind, rand) {
  const m = game.mechanic;
  const grid = game.grid;
  if (kind === "plus") {
    m.throwType = "plus";
    m.targetX = Math.floor(rand() * grid.width);
    m.targetY = Math.floor(rand() * grid.height);
  } else if (kind === "line") {
    const horizontal = rand() < 0.5;
    m.throwType = horizontal ? "line_h" : "line_v";
    if (horizontal) {
      m.targetX = Math.floor(grid.width / 2);
      m.targetY = Math.floor(rand() * grid.height);
    } else {
      m.targetX = Math.floor(rand() * grid.width);
      m.targetY = Math.floor(grid.height / 2);
    }
  }
  m.forcedPity = false;
  m.state = "telegraph";
  m.phaseTimer = 0;
}

/**
 * Returns the telegraph fuse (ms) for the given throw type. Specials
 * get slightly longer fuses so the player has real time to shield.
 */
function telegraphFuseFor(throwType) {
  if (throwType === "plus") {
    return PLUS_TELEGRAPH_FUSE_MS;
  }
  if (throwType === "line_h" || throwType === "line_v") {
    return LINE_TELEGRAPH_FUSE_MS;
  }
  return TELEGRAPH_FUSE_MS;
}

/**
 * Returns the list of grid cells affected by the current throw, based on
 * `mechanic.throwType` and target coords. Off-grid cells are omitted
 * (plus-bomb cardinals near the edge simply have fewer cells). Exposed
 * so the renderer can walk the same cells for the telegraph / impact
 * overlay.
 *
 * @param {object} m — cull mechanic
 * @param {{ width: number, height: number }} grid
 * @returns {Array<[number, number]>}
 */
export function getThrowCells(m, grid) {
  const cells = [];
  const w = grid.width;
  const h = grid.height;
  if (m.throwType === "plus") {
    const cx = m.targetX;
    const cy = m.targetY;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) {
        cells.push([x, y]);
      }
    }
  } else if (m.throwType === "line_h") {
    for (let x = 0; x < w; x++) {
      cells.push([x, m.targetY]);
    }
  } else if (m.throwType === "line_v") {
    for (let y = 0; y < h; y++) {
      cells.push([m.targetX, y]);
    }
  } else if (m.targetX >= 0 && m.targetX < w && m.targetY >= 0 && m.targetY < h) {
    cells.push([m.targetX, m.targetY]);
  }
  return cells;
}

/**
 * Resolves the current throw. Dispatches by `throwType`:
 *   - "normal" → single-cell `resolveImpact` (existing behaviour).
 *   - "plus" / "line_*" → multi-cell resolver with per-kin shield
 *     grouping (a shield covers every cell of that kin in this bomb).
 *
 * @param {import('../../game/index.js').Game} game
 * @param {() => number} rand
 */
function resolveThrow(game, rand) {
  const m = game.mechanic;
  if (m.throwType === "normal") {
    resolveImpact(game, m.targetX, m.targetY);
    return;
  }
  const cells = getThrowCells(m, game.grid);
  // Snake dies if any bomb cell overlaps its body. Death cause piggybacks
  // on DEATH_BOMB — thematically it's still an incoming bomb, just from
  // Reginald instead of the player's own consumable.
  for (const [x, y] of cells) {
    if (game.grid.isSnakeCell(x, y)) {
      game.snake.alive = false;
      game.snake.deathCause = DEATH_BOMB;
      break;
    }
  }
  // Detonate every mine the bomb footprint covers before the kin pass —
  // each mine consumes independently (they're distinct cells) but the
  // stun timer doesn't stack (`triggerMineIfPresent` writes an absolute
  // value each call, so the last mine's stun window is what remains).
  let anyMine = false;
  for (const [x, y] of cells) {
    if (triggerMineIfPresent(game, x, y)) {
      anyMine = true;
    }
  }
  // Group hit cells by kin — one shield absorbs the whole group.
  const kinHitCells = new Map();
  for (const [x, y] of cells) {
    const kin = kinAt(game, x, y);
    if (kin) {
      let list = kinHitCells.get(kin);
      if (!list) {
        list = [];
        kinHitCells.set(kin, list);
      }
      list.push([x, y]);
    }
  }
  let anyHit = false;
  const sunkKin = [];
  for (const [kin, cellList] of kinHitCells) {
    anyHit = true;
    m.lastKillX = cellList[0][0];
    m.lastKillY = cellList[0][1];
    if (kin.shielded) {
      kin.shielded = false;
      pushBlockTaunt(m);
      // Blocked cells tell Reginald the kin sits here — add to hits so
      // hunt pivots off them. Also DELETE from `huntTriedCells` (the
      // picker added the cell there when it chose this target): the cell
      // is still alive kin, so `pickHuntTarget` may re-target it on a
      // future throw.
      for (const [x, y] of cellList) {
        m.huntHitCells.add(cellKey(x, y));
        m.huntTriedCells.delete(cellKey(x, y));
      }
    } else {
      for (const [x, y] of cellList) {
        const sunk = markCellMemorial(game, kin, x, y);
        m.huntHitCells.add(cellKey(x, y));
        m.huntTriedCells.add(cellKey(x, y));
        if (sunk && !sunkKin.includes(kin)) {
          sunkKin.push(kin);
        }
      }
    }
  }
  // A special that connects — even via a shield or a mine — resets the
  // miss streak and enters hunt mode. A special that misses everything
  // is treated as a non-event for the streak: it's not a regular
  // throw, so it doesn't drive the pity timer.
  if (anyHit || anyMine) {
    m.missStreak = 0;
    m.targetingMode = "hunt";
  }
  for (const kin of sunkKin) {
    pushDeathToast(m, kin.name);
  }
}

/**
 * Called from `game/tick.js` after every food-bite in a brood act.
 * Marks a plus-bomb pending on every 3rd food, a line-bomb on every 6th
 * (which supersedes the plus at that count). `tickCull` consumes the
 * pending flag on the next idle beat.
 *
 * @param {import('../../game/index.js').Game} game
 */
export function onFoodEaten(game) {
  const m = game.mechanic;
  if (!m || m.type !== "cull") {
    return;
  }
  const foodEaten = game.foodEaten ?? 0;
  if (foodEaten <= 0) {
    return;
  }
  if (foodEaten % 6 === 0) {
    m.pendingSpecial = "line";
  } else if (foodEaten % 3 === 0) {
    m.pendingSpecial = "plus";
  }
}

/**
 * If a mine sits at `(x, y)`, detonate it: consume the mine, stun
 * Reginald's throw timer for `MINE_STUN_MS`, and register the cell in
 * the hunt sets so his AI now hunts around the (empty) mine spot —
 * exactly what a battleship-player would do watching a hit register.
 * Returns true iff a mine was there.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function triggerMineIfPresent(game, x, y) {
  const m = game.mechanic;
  if (!m || m.type !== "cull") {
    return false;
  }
  const key = cellKey(x, y);
  if (!m.mines || !m.mines.has(key)) {
    return false;
  }
  m.mines.delete(key);
  m.stunRemaining = MINE_STUN_MS;
  m.targetingMode = "hunt";
  m.lastKillX = x;
  m.lastKillY = y;
  m.missStreak = 0;
  m.huntHitCells.add(key);
  m.huntTriedCells.add(key);
  // Reginald yelps immediately — the stun taunt bypasses the queue so
  // the reaction beat coincides with the impact flash.
  pushStunTaunt(m);
  return true;
}

/**
 * Resolves a throw landing on (x, y) and drives the targeting state:
 *
 *   - Hit on a shielded kin → shield consumed, kin is unhurt; block
 *     taunt queued. Treated as a hit for mode purposes (enter hunt
 *     around the blocked cell, reset miss streak) — Reginald now knows
 *     exactly where the kin is even though this throw didn't connect.
 *   - Hit on an unshielded kin → just that cell becomes memorial
 *     (battleship semantics: the kin only fully dies once every one of
 *     its cells is hit). If the kin survives, predator enters/stays in
 *     hunt mode anchored to this cell as `lastKill`; the hunt-tried set
 *     is re-anchored around the new pivot. If the kin is fully sunk by
 *     this hit, Reginald knows the kill is done and reverts to search —
 *     probing a corpse's neighbourhood would be wasted throws.
 *   - Miss while in hunt mode → stays in hunt. Hunt's whole point is
 *     "I know something is here, keep probing" — only when every
 *     cardinal of `lastKill` has been tried does the picker revert to
 *     search.
 *   - Miss while in search mode → bumps the miss streak; the picker
 *     compares it against next throw's pity threshold.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} x
 * @param {number} y
 * @returns {"hit" | "miss" | "block"}
 */
export function resolveImpact(game, x, y) {
  const m = game.mechanic;
  // Mines detonate before any kin check — a mine placed in a shielded
  // kin's cell still triggers on impact (the shield never got to
  // interpose because the mine was between Reginald and the kin).
  if (triggerMineIfPresent(game, x, y)) {
    return "mine";
  }
  const kin = kinAt(game, x, y);
  if (kin) {
    if (kin.shielded) {
      kin.shielded = false;
      pushBlockTaunt(m);
      // Block reads as a hit-event for the targeting AI: Reginald knows
      // the kin's position. Enter hunt around the blocked cell; reset
      // miss streak. Cell goes into `huntHitCells` (drives pivot) and
      // is deleted from `huntTriedCells` (the picker just added it) —
      // the cell is still alive kin, so `pickHuntTarget` may re-target
      // it directly on a future throw.
      m.targetingMode = "hunt";
      m.lastKillX = x;
      m.lastKillY = y;
      m.missStreak = 0;
      m.huntHitCells.add(cellKey(x, y));
      m.huntTriedCells.delete(cellKey(x, y));
      return "block";
    }
    const sunk = markCellMemorial(game, kin, x, y);
    m.missStreak = 0;
    if (sunk) {
      // Final cell of the kin — Reginald reads it as a confirmed kill
      // and breaks off the hunt entirely. Adjacents of this corpse cell
      // aren't worth probing; back to random search.
      pushDeathToast(m, kin.name);
      m.targetingMode = "search";
      m.huntHitCells = new Set();
      m.huntTriedCells = new Set();
      m.lastKillX = -1;
      m.lastKillY = -1;
      return "hit";
    }
    m.targetingMode = "hunt";
    m.lastKillX = x;
    m.lastKillY = y;
    // Accumulate this hit into the hunt sets — multi-pivot, so cardinals
    // of every previous hit stay probeable. Tried set gains this cell so
    // the picker never re-targets the freshly-memorialised pivot itself.
    m.huntHitCells.add(cellKey(x, y));
    m.huntTriedCells.add(cellKey(x, y));
    return "hit";
  }
  if (m.targetingMode !== "hunt") {
    m.missStreak += 1;
  }
  return "miss";
}

/**
 * Builds the `"x,y"` key used by `huntTriedCells`. Kept here so the
 * targeting picker and the impact resolver agree on the encoding.
 *
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
export function cellKey(x, y) {
  return x + "," + y;
}

/**
 * Finds a kin whose cell at (x, y) is still alive (terrain reads as
 * KIN_HEAD or KIN_BODY). Cells that have already been memorialised —
 * even on a kin that still has surviving cells elsewhere — return null:
 * a second throw on a gravestone is a miss.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {number} x
 * @param {number} y
 * @returns {object | null}
 */
export function kinAt(game, x, y) {
  const grid = game.grid;
  if (!grid) {
    return null;
  }
  const t = grid.terrain[y * grid.width + x];
  if (t !== TERRAIN_KIN_HEAD && t !== TERRAIN_KIN_BODY) {
    return null;
  }
  const kinList = game.mechanic?.kin ?? [];
  for (const k of kinList) {
    for (const [cx, cy] of k.cells) {
      if (cx === x && cy === y) {
        return k;
      }
    }
  }
  return null;
}

/**
 * Flips a single kin cell at (x, y) to its memorial terrain. If every
 * one of the kin's cells is now memorial, also marks the kin as fully
 * dead (drives game-over in Step 16 and the death toast in Step 12).
 * Wall mask is untouched — memorials still block the snake (D6, D7).
 *
 * @param {import('../../game/index.js').Game} game
 * @param {object} kin
 * @param {number} x
 * @param {number} y
 * @returns {boolean} true if this hit was the final cell (kin just died)
 */
export function markCellMemorial(game, kin, x, y) {
  const grid = game.grid;
  const w = grid.width;
  let cellIndex = -1;
  for (let i = 0; i < kin.cells.length; i++) {
    if (kin.cells[i][0] === x && kin.cells[i][1] === y) {
      cellIndex = i;
      break;
    }
  }
  if (cellIndex === -1) {
    return false;
  }
  // cells[0] is the head (placement anchors the shape there).
  grid.terrain[y * w + x] = cellIndex === 0 ? TERRAIN_MEMORIAL_HEAD : TERRAIN_MEMORIAL_BODY;

  for (const [cx, cy] of kin.cells) {
    const t = grid.terrain[cy * w + cx];
    if (t !== TERRAIN_MEMORIAL_HEAD && t !== TERRAIN_MEMORIAL_BODY) {
      return false;
    }
  }
  kin.alive = false;
  return true;
}

/**
 * Test helper / one-shot kill: marks every one of `kin`'s cells as
 * memorial in a single step. Real gameplay uses per-cell hits via
 * `markCellMemorial` (battleship semantics); this wrapper exists so
 * tests can put a kin into the fully-dead state without scripting every
 * intermediate impact.
 *
 * @param {import('../../game/index.js').Game} game
 * @param {object} kin
 */
export function transitionKinToMemorial(game, kin) {
  for (const [x, y] of kin.cells) {
    markCellMemorial(game, kin, x, y);
  }
}
