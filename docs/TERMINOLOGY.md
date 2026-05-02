# Terminology

The canonical vocabulary for Snecko. Two audiences:

1. **Internal** — code, comments, ADRs, agent instructions. Words used here
   should be unambiguous and consistent so a fresh contributor (human or
   LLM) can read the codebase without inferring meaning from context.
2. **Player-facing** — anything the player reads in-game (HUD, tutorial,
   help text, README, screen titles). Should be evocative and short, but
   **map cleanly to the internal terms** so help text and code don't drift.

Player-facing strings live centrally in `src/text/labels.js` (`LABELS.*`)
so the vocabulary can be audited from a single place. Internal-only
strings (logs, error messages, dev-only text) stay inline.

## Progression / loop

Vocabulary loosely inspired by Slay the Spire: a run contains acts; each
act has its own generated grid; the seed for the run is set at the
start, and each act derives its own seed from it. We use **run** and
**grid** for both code and player audiences (no parallel terms).

| Term | Internal meaning | Player-facing |
|------|------------------|---------------|
| **Run** | One game from spawn to death/quit. The unit at which `runSeed` is fixed. | Run |
| **Act** | One progression unit within a run: generate a grid, eat `foodRequired` foods, trigger upgrade draft, advance. Counter is `actIndex`. | Act |
| **Grid** | The cell array the act is played on (`Grid` class), both as data structure and as the layout produced by a mutation. The instance is reused across acts (cells cleared and re-filled). | Grid |
| **Run seed** (`runSeed`) | Integer set once at run start. The deterministic root for everything procedural in the run. | — |
| **Act seed** (`actSeed`) | Derived from `runSeed` and `actIndex` (e.g. `splitmix32(runSeed ^ actIndex * 0x9e3779b9)`). Each act gets a fresh seed; same act number in the same run always produces the same layout. | — |
| **Food required** | Foods needed in the current act before the upgrade draft triggers (`game.foodRequired`). Scales with `actIndex`. | "Food to clear" |
| **Food eaten** | Counter for foods eaten in the current act (`game.foodEaten`). Displayed as `Progress: N/M` in the HUD. | "Progress" |
| **Boss food** | Red food that triggers a boss fight when eaten. The player opts into the fight by choosing to eat it. | "Boss food" / "red food" |

### Seeding pattern

```
runSeed     = randomU32()                 // once per run
actSeed(i)  = mix(runSeed, i)             // splitmix32-style mix
```

Each act's generator (crystalline / wildlands / catacombs) is initialised
with `actSeed(actIndex)`. Same mutation in two different acts produces
two different layouts because `actIndex` differs. Same run replayed at
the same act produces an identical layout — useful for testing and
future "share this seed" features.

## Bites

A **bite** is one consumption event — the snake takes something into
itself. Bites are the canonical sub-act unit of time: durations, charge
counts, and lifecycle ticks all measure in bites.

Two flavours, distinguished by *what's consumed*:

| Term | Internal meaning | Player-facing |
|------|------------------|---------------|
| **Bite** | One consumption event. The unit for all durations and charges in the upgrade system. | "Bite" |
| **Food-bite** | The snake eats a food. Advances run progression (`foodEaten++`, mechanic lifecycle steps, food-based upgrade durations tick, boss-food cadence advances). The canonical clock for an act. | "Bite" — players don't usually need the qualifier; food is the default. |
| **Wall-bite** | The snake eats a wall. Only possible when a **bites-type** upgrade allows it (e.g. Iron Jaw on wildlands low walls). Consumes one charge from that upgrade's allowance. | "Bite" / "wall bite" if disambiguation needed. |

### Cadence

Per food-bite (every time a food is eaten):

- `foodEaten++`, `bossFoodCharge++`
- The active mutation's lifecycle advances one step (subject to the
  mutation's own cadence — Catacombs may use a divisor, e.g. step every
  3 food-bites; see `PLAN.catacombs-adr.md` Q7).
- Every passive upgrade ticks down one bite of `remainingBites`.
- The snake grows by one cell.

Per wall-bite (when allowed and used):

- The triggering bites-type upgrade decrements its `charges` by one.
  The wall cell is cleared.
- Does **not** advance progression, lifecycle, or grow the snake.

### Duration unit

All upgrade durations and charge counts use the bite unit. There is no
"per-act" duration; "per-tick" / "per-frame" durations don't exist
either. If something has a counter, it's measured in bites.

## Mutations

A **mutation** is the method that generates a grid and the mechanic that
runs on it during an act. Today's mutations:

- **Crystalline** — open grid with dynamic crystal lifecycles.
- **Wildlands** — FBM-noise terrain with shifting current rivers.
- **Catacombs** — pre-generated maze with fixed corridors. (See
  `PLAN.catacombs-adr.md`. File currently named `PLAN.pacman-adr.md` —
  rename pending when that ADR is tackled.)

There is **one concept** here, not two. A mutation is something an act
runs under (the "active mutation"); a mutation can also appear as a
draft option, and accepting it changes the active mutation for
subsequent acts. Same word for both because it's the same thing —
"world mode" and "draft mutation" are not separate terms.

### Mutation structure

Every mutation has three parts:

1. **Generation method** — how the grid is built when the act starts
   (placing crystals; FBM noise; maze carving).
2. **Mechanic** — the recurring per-mutation behaviour layered on the
   grid (lattice / currents / TBD-for-catacombs).
3. **Lifecycle** — the ordered states the mechanic moves through, one
   step per food-bite. Each mutation has its own lifecycle defined in
   its own section below.

| Term | Internal meaning | Player-facing |
|------|------------------|---------------|
| **Mutation** | The active generation method + mechanic for an act. Stored in `upgrades.mutation`. Strings: `"crystalline"`, `"wildlands"`, `"catacombs"`. The draft `TYPE_MUTATION` option offers a mutation; accepting it changes the active mutation. | "Mutation" |
| **Generation method** | The procedural step that fills the grid when an act starts. | Not surfaced by name — players see the result. |
| **Mechanic** | The per-mutation behaviour layered on the grid (`game.mechanic`). Crystalline → lattice; wildlands → currents; catacombs → TBD. | Generally not surfaced by name. |
| **Lifecycle state** | The ordered sequence of states a mechanic runs through. Single-active mechanics keep it on `mech.state` (currents). Concurrent mechanics keep it on each entry (lattice's `mech.crystals[i].state`). "Phase" is reserved for boss combat — mutation lifecycles use **state**. | Not surfaced as a single noun; players see the named states ("growing", "decaying", "surge", etc.). |

## Crystalline mutation

- **Generation method:** the act starts with no walls. Crystals arrive
  over time via the lattice mechanic's lifecycle — there is no
  "initial layout" of crystals.
- **Mechanic:** **Lattice** (`mechanics/lattice.js`).
- **Lifecycle (one crystal, advances one step per food-bite):**
  `telegraph_place → place → telegraph_grow → grow → linger → decay → disappear`.
  After `disappear` the crystal is reaped from `mech.crystals[]`. The
  collective verbs are **growing** (`telegraph_place → place →
  telegraph_grow → grow`) and **decaying** (`linger → decay →
  disappear`). `telegraph_decay` is intentionally omitted — vanishing
  walls don't need a warning.
- **Concurrent crystals:** the lattice runs multiple lifecycles in
  parallel. A new crystal lifecycle starts every `SPAWN_INTERVAL = 2`
  food-bites, so 3–4 crystals are typically active at once at staggered
  states.
- **Determinism:** placement anchors and shape choices are pre-computed
  once per act in `initLattice` from the seeded `mech.rand`, stored on
  `mech.placements`. `telegraph_place` pops the next anchor and
  re-validates it against the live grid; if every remaining anchor is
  stale (snake parked on it, another crystal already there) it falls
  back to a bounded live search.

| Term | Internal meaning | Player-facing |
|------|------------------|---------------|
| **Crystal** | A self-contained wall lifecycle (`mech.crystals[i]`). Each crystal owns its own `state`, `crystalIdx`, `rotation`, anchor (`x`, `y`), `stageIdx`, plus per-crystal `ownedSolid` / `ownedInterior` bitmasks tracking exactly which cells it stamped — so decay/disappear release only that crystal's contribution, not cells another crystal happened to overlap. | Crystal |
| **Stage** | A defined size/silhouette of a crystal. Currently 2: *small* (~5×5 bbox) and *full* (~8×8). Each stage has rotations, each rotation has `solidRows` (wall bitmask per row) and `interiorRows` (hollow bitmask per row). | "Small / full crystal" |
| **Growing** | Collective name for the early lifecycle states (`telegraph_place → place → telegraph_grow → grow`). | "Growing" |
| **Decaying** | Collective name for the late lifecycle states (`linger → decay → disappear`). | "Decaying" |
| **Telegraph** / **Telegraph cell** | Walkable, non-lethal cell that announces an upcoming wall placement. `TERRAIN_TELEGRAPH` in the terrain layer. Clearing is footprint-scoped per crystal so concurrent crystals don't blow each other's telegraphs away. | "Warning cell" or just visual cue. |
| **Hollow** | Cell inside a crystal's silhouette but not itself a wall. Walkable, no food spawns there. Marked as `TERRAIN_INTERIOR` in the terrain layer; auto-derived per stage by flood-fill from the bbox edge (cells the outside can't reach are interior); cleared when the crystal decays. | "Hollow" |
| **Lattice** | The mechanic name in `mechanics/lattice.js`. | Not exposed to players. |

**Conflict:** *Lattice* is also a candidate generic term for "grid maze."
Since `mechanics/lattice.js` already owns it, **do not reuse "lattice"
elsewhere** — particularly for the catacombs maze.

## Wildlands mutation

- **Generation method:** FBM-noise sampling across the grid, with cells
  above one threshold becoming **low walls** and above a higher
  threshold becoming **high walls**.
- **Mechanic:** **Currents** (`mechanics/currents.js`) — a winding river
  that pushes the snake along its flow direction.
- **Lifecycle (one step per food-bite):** initial
  `telegraph → flow → surge`, then loops
  `telegraph_shift → flow → surge` indefinitely. `telegraph_shift` both
  announces the river is about to move and previews the new river's
  shape; the next `flow` paints it for real.

| Term | Internal meaning | Player-facing |
|------|------------------|---------------|
| **Currents** | The mechanic name. | "Currents" |
| **River** | The cells that make up the currently-active current — synonym for the mechanic's active flow cells. | "River" / "current" |
| **Low wall** | Wall cell from the lower FBM threshold (`TERRAIN_LOW`). **Eatable** by Iron Jaw and any future bites-type upgrade that interacts with walls. Renders as light amber `▒▒` (or bright amber when an eat-walls upgrade is active). | "Low wall" |
| **High wall** | Wall cell from the higher FBM threshold (`TERRAIN_HIGH`). **Not eatable** — behaves like a regular wall. Renders as dark brown `██`. | "High wall" |

## Catacombs mutation

See `PLAN.catacombs-adr.md` (file rename pending). The mutation is
pre-generated per act, with fixed 2-wide corridors and 1-wide walls.

| Term | Internal meaning | Player-facing |
|------|------------------|---------------|
| **Catacombs** | Mutation string `"catacombs"`. | "Catacombs" |
| **Corridor** | 2-cell-wide walkable strip in the maze. | "Corridor" |
| **Wall** (catacombs) | 1-cell-wide blocker between corridors. Same wall flag as everywhere else; the term distinguishes intent. | "Wall" |
| **Mechanic** | Pending — see Q7 in `PLAN.catacombs-adr.md`. May be empty (the maze is the mechanic). | — |

## Boss fights

| Term | Internal meaning | Player-facing |
|------|------------------|---------------|
| **Boss** | The entity defined in `boss/bosses/<name>.js`. | Boss |
| **Phase** | Boss combat phase: `BOSS_PHASE_INTRO` / `_1` / `_2` / `_3` (`fight.js`). **Reserved for bosses** — mutation lifecycles use **lifecycle state** (see Mutation structure), not "phase." | "Phase 2!" |
| **Weak point** / **Body cell** | Damage targeting: weak point = HP, body = destructible cover. | "Weak point" surfaces in HUD; body cells are visual. |
| **Modifier** (`_bossModifiers`) | Temporary boss-spawned hazard or cover (`anchor_lock`, `algorithm_current`, `danger_trail`, `echo_zone`). A modifier may flag itself as a drift source (`driftActive` + `cells[]` with `flowDx`/`flowDy`); both player projectiles and boss projectiles bend through those cells via the hook in `updateProjectiles` / `updatePlayerBullets`. | Not exposed by name. |
| **Special** | The boss-defined ability fired on `BOSS_SPECIAL_INTERVAL`. | Implicit — players just see the effect. |
| **Stagger** | A brief boss-can't-act window after certain hits. | Visible as the boss flashing / not firing. |

## Upgrades

Three upgrade *types* exist, distinguished by their **trigger axis**:

- **Passive** — *time-gated.* Always-on while held; counts down its
  `remainingBites` on every food-bite. e.g. Slow Time.
- **Consumable** — *player-gated.* Charges spent by manual player
  trigger. e.g. Bomb, Dash, Wormhole.
- **Bites** — *event-gated.* Auto-fires on a specific in-game event,
  consuming one charge per fire. e.g. Iron Jaw (per wall eaten).

Independently, an upgrade also has a **source** — where the player got
it from. Source and type are orthogonal axes.

| Term | Internal meaning | Player-facing |
|------|------------------|---------------|
| **Upgrade** | Generic term covering all run modifiers (passives, consumables, bites, and mutations as draft options). | "Upgrade" |
| **Passive** | Time-gated upgrade type (`TYPE_PASSIVE`, `upgrades/passives/`). Duration in food-bites. | "Passive" |
| **Consumable** | Player-triggered, charge-based upgrade type (`TYPE_CONSUMABLE`, `upgrades/consumables/`). | "Consumable" / specific name |
| **Bites** | Event-gated, charge-based upgrade type (`TYPE_BITES`, `upgrades/bites/`). Iron Jaw is the canonical example. | "Bites" / specific name. The HUD displays remaining charges as `N bites`. |
| **Contraband** | A *source* — upgrade picked from a draft after a boss kill (`upgrades/contraband/`). Contraband upgrades have their own data shape (`ContrabandDef`) with refresh-per-fight or cooldown semantics (Gomu Gomu, Get Out of Jail Free) — they are *not* in the bites type system; the contraband system is structurally distinct. | "Contraband" |
| **Draft** | The pick-one-from-N upgrade picker (`upgrades/draft.js`). The mutation slot is part of this. | "Draft" / "pick" |
| **Pool** | The set of upgrades a draft is sampled from. | Not surfaced. |

### Upgrade label fields

Each upgrade entry under `LABELS.upgrades.<id>` provides three string
fields:

- **`name`** — long flavour title shown on draft / contraband cards
  (e.g. "Who gave the snake a gun?").
- **`short`** — terse HUD label, ≤10 characters, shown in the
  upgrade strip (e.g. "Bullets").
- **`desc`** — one-liner shown under the name on cards.

Defs in `defs.js` and `contraband/*.js` hold only mechanical config
(id, type, duration / charges, modeOnly, etc.); player-facing strings
live entirely in `LABELS`.

## Grid layers / cell flags

| Term | Meaning |
|------|---------|
| **Wall** | Blocking cell (`grid.isWallCell`). |
| **Snake cell** | Cell occupied by the snake's body. |
| **Reserved cell** | Generation-time reservation, e.g. spawn buffer. Cleared after generation. |
| **Terrain** | A separate per-cell value: `TERRAIN_NONE` / `TERRAIN_TELEGRAPH` / `TERRAIN_CURRENT` / `TERRAIN_LOW` / `TERRAIN_HIGH` / `TERRAIN_INTERIOR` (`grid/constants.js`). |
| **Food** / **Boss food** | Single-position flags on the grid (`foodX/Y`, `bossFoodX/Y`). |

## Snake

| Term | Meaning |
|------|---------|
| **Head** / **Tail** | Ring-buffer endpoints (`headIndex`, `tailIndex` in `snake/index.js`). |
| **Length** | Body cell count (`snake.snakeLength`). Resets to `INITIAL_SNAKE_LENGTH` at the start of each act — does *not* carry over. |
| **Facing** | Boss-mode aim direction (`game._playerFacing`). Distinct from movement direction. |
| **Held direction** | The latched movement input in boss mode (`game._heldDirection`). |

## Vocabulary decisions

Why these terms were chosen, for future reference:

- **Progression vocabulary** — Slay-the-Spire-inspired framework with the
  parallel terms collapsed: **run** for the full game (code and player),
  **act** for the progression unit, **grid** for the cell array.
  "Encounter" deliberately not introduced (no branching paths today).
  "Map", "level", "room", "board" all replaced or removed.
- **Seeding** — `runSeed` once per run, `actSeed = mix(runSeed,
  actIndex)` per act. Sub-systems derive further seeds from `actSeed`
  if needed. No standalone "level" seed concept.
- **Mutation** — one concept, not two. The active generation method +
  mechanic *and* the draft option that swaps it use the same word; they
  are the same thing.
- **Phase reserved for bosses** — mutation lifecycle steps use
  **lifecycle state** (`mech.state`). Player HUD only ever says "Phase"
  for the boss.
- **Bite as the universal unit** — every duration and charge count in
  the upgrade system is measured in bites. Bites split into
  **food-bite** (canonical clock) and **wall-bite** (gated by
  bites-type upgrades).
- **Bites upgrade type** — third type alongside passive and consumable,
  distinguished by its *event-gated* trigger axis. Iron Jaw is the
  canonical resident.
- **Contraband stays separate from the type system** — boss-only
  upgrades (Gomu Gomu, Get Out of Jail Free, etc.) have refresh /
  cooldown semantics that don't fit the depleting-charges bites model.
  They live in their own `ContrabandDef` shape, not as `TYPE_BITES`.
- **Crystal interior** — called **hollow** (one word, easier to read).
- **Boss-act semantics** — no separate "boss act" concept. The boss is
  triggered solely by eating boss food, which the player opts into.

## How to use this file

- New code / comments: use a term from this doc. If you need a new
  term, add it here first, then use it.
- Player-facing text (HUD, screens, README, help): use the player
  column. If a row has no player term, the concept is internal-only.
  Add the string to `LABELS.*` in `src/text/labels.js`, not inline.
- Conflicts: don't redefine an existing word in a new context — pick a
  new word.
