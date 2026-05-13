// cell/index.js — Cell registry + top-level drawCell adapter.
//
// Game render code (e.g. `_drawGrid`, `_drawBossArena`) calls
// `drawCell(x, y, type, context?)` instead of `renderer.drawCell(...)`.
// Each per-cell file (e.g. `empty.js`) registers itself via
// `defineCell(id, spec)`; the side-effect imports below make those
// registrations run at boot.

import { getCellSpec } from "./registry.js";

// Side-effect imports — each cell file calls `defineCell` at top level.
import "./empty.js";
import "./terrain/wall.js";
import "./terrain/wall-low.js";
import "./terrain/wall-high.js";
import "./terrain/wall-edible.js";
import "./terrain/wall-arena.js";
import "./terrain/wall-catacomb.js";
import "./terrain/wall-crystal.js";
import "./food/crystal-telegraph.js";
import "./food/food.js";
import "./food/red-food.js";
import "./food/telegraph.js";
import "./boss/body.js";
import "./boss/weak.js";
import "./boss/damaged.js";
import "./boss/hit.js";
import "./boss/projectile.js";
import "./boss/player-bullet.js";
import "./boss/exhaust.js";
import "./mechanics/current-right.js";
import "./mechanics/current-left.js";
import "./mechanics/current-down.js";
import "./mechanics/current-up.js";
import "./mechanics/danger-trail.js";
import "./mechanics/echo-zone.js";
import "./mechanics/anchor-lock.js";
import "./mechanics/wormhole-a.js";
import "./mechanics/wormhole-b.js";
import "./snake/body.js";
import "./snake/invul.js";
import "./snake/head.js";
import "./survival/blob.js";
import "./soulslike/fighter-idle.js";
import "./soulslike/fighter-stab.js";
import "./soulslike/fighter-dodge-active.js";
import "./soulslike/fighter-dodge-recovery.js";
import "./soulslike/fighter-parry.js";
import "./soulslike/hissalia.js";
import "./soulslike/halberd-handle.js";
import "./soulslike/halberd-tip.js";
import "./soulslike/knife-tip.js";
import "./soulslike/flower.js";
import "./soulslike/tree.js";
import "./soulslike/gravestone.js";
import "./soulslike/water.js";

export { defineCell } from "./registry.js";

/**
 * Adapter entry point. Routes to the registered cell's render method.
 * Cell types without a registered spec are silently skipped.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} type — `CELL_*` constant
 * @param {object} [context] — optional transient state (facing, hp ratio,
 *   staggered flag, etc.). Each cell consumes only what it reads.
 */
export function drawCell(x, y, type, context) {
  const spec = getCellSpec(type);
  if (spec) {
    spec.render(x, y, context);
  }
}
