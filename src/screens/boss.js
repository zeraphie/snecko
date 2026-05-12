// boss.js — Boss fight arena screen (style-aware dispatch)

import {
  BOSS_PHASE_INTRO,
  BOSS_INTRO_TICKS,
  SURVIVAL_WIN_TICKS,
  SURVIVAL_BLOB_SIZE,
} from "../core/game/constants.js";
import {
  CELL_BLOB,
  CELL_WALL_ARENA,
  CELL_HISSALIA,
  CELL_HALBERD_HANDLE,
  CELL_HALBERD_TIP,
  CELL_KNIFE_TIP,
  CELL_FLOWER,
  CELL_TREE,
  CELL_GRAVESTONE,
  CELL_WATER,
} from "../render/renderer.js";
import { drawCell } from "../core/grid/cell/index.js";
import { fighterCellByAnim, glaivePose } from "../core/boss/styles/soulslike/animation.js";
import { knifePosition } from "../core/boss/styles/soulslike/combat.js";
import { drawHUD } from "./shared.js";

// Maps the arena parser's scenery `type` string to the registered
// cell-adapter id. Keep keys in sync with `SCENERY_CHARS` in
// `core/boss/arena.js`.
const SCENERY_CELL_BY_TYPE = {
  tree: CELL_TREE,
  gravestone: CELL_GRAVESTONE,
  flower: CELL_FLOWER,
  water: CELL_WATER,
};

function drawBulletHellScreen(renderer, game) {
  game._drawBossArena();
  drawHUD(renderer, game);
  if (game._boss) {
    renderer.drawBossInfo(
      game._boss.name,
      game._boss.hp,
      game._boss.maxHp,
      game._fight ? game._fight.phase : 0
    );
  }
  if (game._fight && game._fight.phase === BOSS_PHASE_INTRO) {
    renderer.drawBossIntroOverlay(game._boss.name, game._fight._introTicks, BOSS_INTRO_TICKS);
  }
}

function drawSurvivalScreen(renderer, game) {
  game._drawGrid();
  const sv = game._bossSurvival;
  if (sv) {
    // 2×2 chasing blob over the regular grid.
    const blob = sv.blob;
    for (let dy = 0; dy < SURVIVAL_BLOB_SIZE; dy++) {
      for (let dx = 0; dx < SURVIVAL_BLOB_SIZE; dx++) {
        const x = blob.x + dx;
        const y = blob.y + dy;
        if (game.grid.isInBounds(x, y)) {
          drawCell(x, y, CELL_BLOB);
        }
      }
    }
  }
  drawHUD(renderer, game);
  if (!sv) {
    return;
  }
  const name = game._boss?.name ?? "Survival";
  renderer.drawSurvivalInfo(name, sv.ticksLeft, SURVIVAL_WIN_TICKS);
  if (sv.introTicks > 0) {
    renderer.drawBossIntroOverlay(name, sv.introTicks, BOSS_INTRO_TICKS);
  }
}

// Soulslike grid render — drives the cell adapter from the soulslike
// state machines. Draw order (back-to-front):
//   1. Arena walls
//   2. Hissalia (4 corners of the 2×2 boss footprint, with context)
//   3. Halberd (handle + tip; tip flashes during execute)
//   4. Snake fighter (cell type derived from `snakeAnim.state`)
//   5. Knife (handle + tip; tip highlights on `stab_active`)
//   6. HUD: snake HP + stamina pips + boss HP bar
// YOU DIED overlay lands in Step 13.
function drawSoulslikeScreen(renderer, game) {
  const sl = game._soulslike;
  if (!sl) {
    return;
  }
  const grid = game.grid;

  // 1. Arena walls + scenery. Scenery regions from the .arena parser
  //    take precedence over the generic wall render so each region
  //    type (tree, gravestone, flower) gets its own look. The cell
  //    adapters scale their drawing to the region's bounding box, so
  //    a 1×1 flower is a tight cluster while a 3×3 patch scatters
  //    petals across the whole area.
  const sceneryByCell = new Map();
  for (const region of game._arenaScenery ?? []) {
    for (const cell of region.cells) {
      sceneryByCell.set(cell.y * grid.width + cell.x, region);
    }
  }
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const region = sceneryByCell.get(y * grid.width + x);
      if (region) {
        const cellType = SCENERY_CELL_BY_TYPE[region.type];
        if (cellType !== undefined) {
          drawCell(x, y, cellType, { region });
          continue;
        }
      }
      if (grid.isWallCell(x, y)) {
        drawCell(x, y, CELL_WALL_ARENA);
      }
    }
  }

  // 2. Hissalia (2×2). Each of the 4 cells draws its quadrant of one
  //    body+arms silhouette centred on the boss centre. `bossX/Y` in
  //    the context tells each cell where the shared centre is so the
  //    quadrants line up.
  const hissaliaCtx = {
    staggered: sl.staggerTicks > 0,
    phase: sl.bossPhase,
    attackPhase: sl.bossAttackPhase,
    bossX: sl.bossX,
    bossY: sl.bossY,
    facing: sl.bossFacing,
  };
  drawCell(sl.bossX, sl.bossY, CELL_HISSALIA, hissaliaCtx);
  drawCell(sl.bossX + 1, sl.bossY, CELL_HISSALIA, hissaliaCtx);
  drawCell(sl.bossX, sl.bossY + 1, CELL_HISSALIA, hissaliaCtx);
  drawCell(sl.bossX + 1, sl.bossY + 1, CELL_HISSALIA, hissaliaCtx);

  // 3. Glaive — pose comes from the attack state machine:
  //    - idle / recovery: default forward pose.
  //    - windup: attack-specific telegraph pose; last tick flashes via
  //      `isSignifier` so the player gets a clear "strike incoming" cue.
  //    - execute: swing pose at the current execute tick. `tip` is the
  //      live hitbox — already used for hit resolution in attacks.js.
  // The rect inside each cell is drawn along the WEAPON axis (the
  // vector from handle to tip), NOT the boss facing — so a perp-held
  // telegraph reads as a perpendicular line, not as a parallel one.
  // Handles that fall inside the 2×2 boss footprint are skipped so
  // they don't paint over the body+arms render.
  const pose = glaivePose(sl);
  const weaponDir = poseAxis(pose.handle, pose.tip, sl.bossFacing);
  if (grid.isInBounds(pose.handle.x, pose.handle.y) && !insideBossFootprint(pose.handle, sl)) {
    drawCell(pose.handle.x, pose.handle.y, CELL_HALBERD_HANDLE, {
      isSignifier: pose.isSignifier,
      facing: weaponDir,
    });
  }
  if (grid.isInBounds(pose.tip.x, pose.tip.y) && !insideBossFootprint(pose.tip, sl)) {
    drawCell(pose.tip.x, pose.tip.y, CELL_HALBERD_TIP, {
      isSignifier: pose.isSignifier,
      attackPhase: sl.bossAttackPhase,
      facing: weaponDir,
    });
  }

  // 4. Snake fighter — single cell, type derived from anim state.
  const head = game.snake.headIndex;
  const sx = game.snake.snakeX[head];
  const sy = game.snake.snakeY[head];
  drawCell(sx, sy, fighterCellByAnim(sl.snakeAnim.state), { facing: game._playerFacing });

  // 5. Knife — single cell, right of player when idle, jumps 1 cell
  //    forward on the stab tick. Skip if it would clip into a wall.
  const facing = game._playerFacing;
  const stabActive = sl.snakeAnim.state === "stab_active";
  const knife = knifePosition(sx, sy, facing.dx, facing.dy, stabActive);
  if (grid.isInBounds(knife.x, knife.y) && !grid.isWallCell(knife.x, knife.y)) {
    drawCell(knife.x, knife.y, CELL_KNIFE_TIP, {
      snakeAnimState: sl.snakeAnim.state,
      facing,
    });
  }

  // 6. HUD.
  renderer.drawSoulslikeInfo(
    sl.snakeHp,
    sl.snakeHpMax,
    sl.stamina,
    sl.staminaMax,
    game._boss?.name ?? "",
    sl.bossHp,
    sl.bossHpMax
  );
}

/**
 * Compute the long-axis direction of a weapon from its handle and tip
 * cells. Falls back to the boss facing when handle and tip are the
 * same cell (zero-length vector — shouldn't happen in practice).
 */
function poseAxis(handle, tip, fallbackFacing) {
  const dx = Math.sign(tip.x - handle.x);
  const dy = Math.sign(tip.y - handle.y);
  if (dx === 0 && dy === 0) {
    return fallbackFacing;
  }
  // Diagonal vectors collapse to dominant axis — `drawThinRect` reads
  // `dx !== 0` as "weapon horizontal", so a diagonal (1, 1) renders
  // horizontal. Good enough for the current visual scale.
  return { dx, dy };
}

/** True iff (cell.x, cell.y) is inside the 2×2 boss footprint at (sl.bossX, sl.bossY). */
function insideBossFootprint(cell, sl) {
  return cell.x >= sl.bossX && cell.x < sl.bossX + 2 && cell.y >= sl.bossY && cell.y < sl.bossY + 2;
}

export const bossScreen = {
  /**
   * @param {object} renderer
   * @param {object} game
   * @param {{ skipFlush?: boolean }} [opts]
   */
  draw(renderer, game, opts) {
    renderer.clear();
    if (game._bossDef?.style === "survival") {
      drawSurvivalScreen(renderer, game);
    } else if (game._bossDef?.style === "soulslike") {
      drawSoulslikeScreen(renderer, game);
    } else {
      drawBulletHellScreen(renderer, game);
    }
    if (!opts?.skipFlush) {
      renderer.flush();
    }
  },
};
