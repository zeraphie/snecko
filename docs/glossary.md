# Glossary

The canonical vocabulary for Snecko. Two audiences:

1. **Internal** — code, comments, ADRs, agent instructions. Words used
   here should be unambiguous and consistent so a fresh contributor
   (human or LLM) can read the codebase without inferring meaning from
   context.
2. **Player-facing** — anything the player reads in-game (HUD,
   tutorial, help text, README, screen titles). Should be evocative
   and short, but **map cleanly to the internal terms** so help text
   and code don't drift.

Player-facing strings live centrally in `src/text/labels.js`
(`LABELS.*`) so the vocabulary can be audited from a single place.
Internal-only strings (logs, error messages, dev-only text) stay
inline.

For the **how**, see [`mechanics.md`](./mechanics.md). For the
**why**, see [`design.md`](./design.md).

## Progression / loop

Slay-the-Spire-inspired framework with parallel terms collapsed: same
word for code and player. A run contains acts; each act has its own
generated grid. See [`mechanics.md` → Seeding pattern](./mechanics.md#seeding-pattern)
for how seeds derive across runs and acts.

| Term                     | Internal meaning                                                                          | Player-facing            |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------ |
| **Run**                  | One game from spawn to death/quit. The unit at which `runSeed` is fixed.                  | Run                      |
| **Act**                  | One progression unit within a run: generate a grid, eat `foodRequired` foods, draft, advance. Counter is `actIndex`. | Act                      |
| **Grid**                 | The cell array the act is played on (`Grid` class). The instance is reused across acts (cells cleared and re-filled). | Grid                     |
| **Run seed** (`runSeed`) | Integer set once at run start. The deterministic root for everything procedural in the run. | —                        |
| **Act seed** (`actSeed`) | Derived from `runSeed` and `actIndex`. Same act number in the same run always produces the same layout. | —                        |
| **Food required**        | Foods needed in the current act before the upgrade draft triggers (`game.foodRequired`). | "Food to clear"          |
| **Food eaten**           | Counter for foods eaten in the current act (`game.foodEaten`). HUD: `Progress: N/M`.     | "Progress"               |
| **Boss food**            | Red food that triggers a boss fight when eaten. The player opts into the fight.          | "Boss food" / "red food" |

## Bites

A **bite** is one consumption event — the snake takes something into
itself. Bites are the canonical sub-act unit of time: durations,
charges, and lifecycle ticks all measure in bites. See
[`mechanics.md` → Bites](./mechanics.md#bites) for cadence detail.

| Term          | Internal meaning                                                                                            | Player-facing                                |
| ------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Bite**      | One consumption event. The unit for all durations and charges in the upgrade system.                       | "Bite"                                       |
| **Food-bite** | The snake eats a food. The canonical clock: progression, lifecycle, food-bite-gated upgrades all advance.   | "Bite" — usually unqualified.                |
| **Wall-bite** | The snake eats a wall. Only possible when a bites-type upgrade allows it (e.g. Iron Jaw on wildlands lows). | "Bite" / "wall bite" if disambiguation needed. |

## Mutations

A **mutation** is the method that generates a grid and the mechanic
that runs on it during an act. **One concept** here, not two: a
mutation runs an act, and the same word names the draft option that
swaps the active mutation. See [`mechanics.md` → Mutation
structure](./mechanics.md#mutation-structure) for the three-part
shape every mutation follows.

Today's mutations: **crystalline**, **wildlands**, **catacombs**.

| Term                  | Internal meaning                                                                                            | Player-facing                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Mutation**          | The active generation method + mechanic for an act. `upgrades.mutation`. Strings: `"crystalline"`, `"wildlands"`, `"catacombs"`. | "Mutation"                                     |
| **Generation method** | The procedural step that fills the grid when an act starts.                                                | Not surfaced — players see the result.         |
| **Mechanic**          | The per-mutation behaviour layered on the grid (`game.mechanic`). Crystalline → lattice; wildlands → currents; catacombs → rifts. | Generally not surfaced by name.                |
| **Lifecycle state**   | The ordered sequence of states a mechanic runs through. Single-active on `mech.state`; concurrent on each entry. **State** for mutations, **phase** for bosses — never mix. | Players see named states ("growing", "surge"). |

## Crystalline

Open grid; crystals arrive over time via the lattice mechanic. See
[`mechanics.md` → Crystalline](./mechanics.md#crystalline) for the
full lifecycle and concurrency model.

| Term                               | Internal meaning                                                                                                                        | Player-facing                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Crystal**                        | A self-contained wall lifecycle (`mech.crystals[i]`) with its own state, anchor, rotation, stage, and `ownedSolid` / `ownedInterior` masks. | Crystal                            |
| **Stage**                          | A defined size/silhouette of a crystal. Currently 2: _small_ (~5×5) and _full_ (~8×8).                                                  | "Small / full crystal"             |
| **Growing**                        | Collective name for the early lifecycle states (`telegraph_place → place → telegraph_grow → grow`).                                     | "Growing"                          |
| **Decaying**                       | Collective name for the late lifecycle states (`linger → decay → disappear`).                                                           | "Decaying"                         |
| **Telegraph** / **Telegraph cell** | Walkable, non-lethal cell that announces an upcoming wall placement (`TERRAIN_TELEGRAPH`).                                              | "Warning cell" or just visual cue. |
| **Hollow**                         | Cell inside a crystal's silhouette but not itself a wall. Walkable, no food spawns there (`TERRAIN_INTERIOR`).                          | "Hollow"                           |
| **Lattice**                        | The mechanic name in `mechanics/lattice.js`.                                                                                            | Not exposed to players.            |

## Wildlands

FBM-noise terrain (low + high walls) with shifting current rivers.
See [`mechanics.md` → Wildlands](./mechanics.md#wildlands) for the
flow lifecycle and wall types.

| Term          | Internal meaning                                                                                       | Player-facing       |
| ------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| **Currents**  | The mechanic name (`mechanics/currents.js`).                                                           | "Currents"          |
| **River**     | The cells that make up the currently-active current — synonym for the active flow cells.               | "River" / "current" |
| **Low wall**  | Wall cell from the lower FBM threshold (`TERRAIN_LOW`). **Eatable** by Iron Jaw; renders amber.        | "Low wall"          |
| **High wall** | Wall cell from the higher FBM threshold (`TERRAIN_HIGH`). **Not eatable**; renders dark brown.         | "High wall"         |

## Catacombs

Static maze with periodic topology rifts. See
[`mechanics.md` → Catacombs](./mechanics.md#catacombs) for the maze
generation and rift cycle.

| Term                 | Internal meaning                                                                                                        | Player-facing    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Catacombs**        | Mutation string `"catacombs"`.                                                                                          | "Catacombs"      |
| **Maze cell**        | One of the 10×10 logical cells the maze graph operates on. Each has a 2×2 corridor interior plus 1-wide inter-cell walls. | —                |
| **Corridor**         | 2-cell-wide walkable strip — the 2×2 interior of a maze cell, plus opened inter-cell wall gaps.                         | "Corridor"       |
| **Inter-cell wall**  | The 1-cell-wide divider between two adjacent maze cells. Either fully closed or fully open. Rifts flip these.           | "Wall"           |
| **Rift**             | The atomic mechanic operation: open one closed inter-cell wall + close one open one, preserving connectivity.           | Implicit visual. |
| **Rifts**            | The mechanic name (`mechanics/rifts.js`).                                                                               | Not exposed.     |

## Boss fights

Each boss declares a **style** — the family of fight it belongs to —
which dispatches to a per-style module. See
[`mechanics.md` → Boss styles](./mechanics.md#boss-styles) for how
the dispatcher and shared transitions work.

| Term                            | Internal meaning                                                                                                                        | Player-facing                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Boss**                        | The entity defined in `boss/bosses/<name>.js`.                                                                                          | Boss                                                 |
| **Style**                       | The fight family of a boss def (`def.style`). Defaults to `"bullet_hell"` if unset. Dispatches to `boss/styles/<name>.js`.              | Not surfaced.                                        |
| **Bullet-hell**                 | Style: player Y-locked, auto-fires up; boss has body cells + weak point + HP.                                                           | Not labelled.                                        |
| **Survival**                    | Style: free movement on the host's grid; chasing entity instead of HP; win by surviving a fixed timer.                                  | Not labelled.                                        |
| **Phase**                       | Bullet-hell combat phase: `BOSS_PHASE_INTRO` / `_1` / `_2` / `_3`. **Reserved for bosses** — mutation lifecycles use **state**.        | "Phase 2!"                                           |
| **Weak point** / **Body cell**  | Bullet-hell only. Damage targeting: weak point = HP, body = destructible cover.                                                         | "Weak point" surfaces in HUD; body cells are visual. |
| **Modifier** (`_bossModifiers`) | Bullet-hell only. Temporary boss-spawned hazard or cover (`anchor_lock`, `algorithm_current`, `danger_trail`, `echo_zone`).             | Not exposed by name.                                 |
| **Special**                     | Bullet-hell only. The boss-defined ability fired on `BOSS_SPECIAL_INTERVAL`.                                                            | Implicit — players just see the effect.              |
| **Stagger**                     | Bullet-hell only. A brief boss-can't-act window after certain hits.                                                                     | Visible as the boss flashing / not firing.           |

## Survival style

A boss style for fights where the snake survives a chasing entity for
a fixed duration instead of dealing HP damage. See
[`mechanics.md` → Survival](./mechanics.md#survival) for spawn,
timer, and path-shift detail.

| Term            | Internal meaning                                                                                                                                                                  | Player-facing                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Blob**        | The 2×2 chasing entity. Lives in `game._bossSurvival.blob = { x, y, lastDx, lastDy, stunTicks }`. Footprint is `(x, y) .. (x+1, y+1)`.                                            | Implicit — players see the shape.              |
| **The Roomba**  | Display name for the catacombs survival boss (def id `catacombs_chaser`, label under `LABELS.bosses.catacombs_chaser`).                                                            | "The Roomba"                                   |
| **Stun**        | Post-flip freeze; blob doesn't move while `stunTicks > 0`. BFS still recomputes so the blob has a fresh path the moment stun ends.                                                 | Visible as the blob freezing for ~1 s.         |
| **Push**        | The relocation that follows a flip closing on the blob — linear walk along `-lastDir` to the nearest valid 2×2 placement (BFS-nearest fallback if the linear walk dead-ends).      | Implicit — players see the blob jump back.     |

## Upgrades

Three upgrade _types_ (trigger axis): **passive** (time-gated),
**consumable** (player-gated), **bites** (event-gated). Independently,
an upgrade has a **source** (where the player got it) — orthogonal to
type. See [`mechanics.md` → Upgrades](./mechanics.md#upgrades) for
type semantics, contraband, and label fields.

| Term           | Internal meaning                                                                                                                                                                                                                                                                                                                          | Player-facing                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Upgrade**    | Generic term covering all run modifiers (passives, consumables, bites, and mutations as draft options).                                                                                                                                                                                                                                    | "Upgrade"                                                                 |
| **Passive**    | Time-gated upgrade type (`TYPE_PASSIVE`, `upgrades/passives/`). Duration in food-bites.                                                                                                                                                                                                                                                    | "Passive"                                                                 |
| **Consumable** | Player-triggered, charge-based upgrade type (`TYPE_CONSUMABLE`, `upgrades/consumables/`).                                                                                                                                                                                                                                                  | "Consumable" / specific name                                              |
| **Bites**      | Event-gated, charge-based upgrade type (`TYPE_BITES`, `upgrades/bites/`). Iron Jaw is the canonical example.                                                                                                                                                                                                                               | "Bites" / specific name. HUD shows remaining as `N bites`.                |
| **Contraband** | A _source_ — upgrade picked from a draft after a boss kill (`upgrades/contraband/`). Has its own `ContrabandDef` shape with refresh / cooldown semantics. May declare `styles[]` allow-list scoping it to specific boss styles; unset = available everywhere.                                                                              | "Contraband"                                                              |
| **Draft**      | The pick-one-from-N upgrade picker (`upgrades/draft.js`). The mutation slot is part of this.                                                                                                                                                                                                                                               | "Draft" / "pick"                                                          |
| **Pool**       | The set of upgrades a draft is sampled from.                                                                                                                                                                                                                                                                                               | Not surfaced.                                                             |

## Grid layers / cell flags

| Term                     | Meaning                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wall**                 | Blocking cell (`grid.isWallCell`).                                                                                                                               |
| **Snake cell**           | Cell occupied by the snake's body.                                                                                                                               |
| **Reserved cell**        | Generation-time reservation, e.g. spawn buffer. Cleared after generation.                                                                                        |
| **Terrain**              | A separate per-cell value: `TERRAIN_NONE` / `TERRAIN_TELEGRAPH` / `TERRAIN_CURRENT` / `TERRAIN_LOW` / `TERRAIN_HIGH` / `TERRAIN_INTERIOR` (`grid/constants.js`). |
| **Food** / **Boss food** | Single-position flags on the grid (`foodX/Y`, `bossFoodX/Y`).                                                                                                    |

## Snake

| Term                | Meaning                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Head** / **Tail** | Ring-buffer endpoints (`headIndex`, `tailIndex` in `snake/index.js`).                                                     |
| **Length**          | Body cell count (`snake.snakeLength`). Resets to `INITIAL_SNAKE_LENGTH` at the start of each act — does _not_ carry over. |
| **Facing**          | Boss-mode aim direction (`game._playerFacing`). Distinct from movement direction.                                         |
| **Held direction**  | The latched movement input in boss mode (`game._heldDirection`).                                                          |

## Vocabulary decisions

Why these terms were chosen, for future reference:

- **Progression vocabulary** — Slay-the-Spire-inspired framework with
  parallel terms collapsed: **run** for the full game (code and
  player), **act** for the progression unit, **grid** for the cell
  array. "Encounter" deliberately not introduced (no branching paths
  today). "Map", "level", "room", "board" all replaced or removed.
- **Seeding** — `runSeed` once per run, `actSeed = mix(runSeed,
  actIndex)` per act. Sub-systems derive further seeds from
  `actSeed` if needed. No standalone "level" seed concept.
- **Mutation** — one concept, not two. The active generation method
  + mechanic _and_ the draft option that swaps it use the same word.
- **Phase reserved for bosses** — mutation lifecycle steps use
  **state** (`mech.state`). Player HUD only ever says "Phase" for
  the boss.
- **Bite as the universal unit** — every duration and charge in the
  upgrade system measures in bites. **Food-bite** (canonical clock)
  and **wall-bite** (gated by bites-type upgrades).
- **Bites upgrade type** — third type alongside passive and
  consumable, distinguished by its _event-gated_ trigger axis.
- **Contraband stays separate from the type system** — boss-only
  upgrades have refresh / cooldown semantics that don't fit the
  depleting-charges bites model. They live in `ContrabandDef`, not
  `TYPE_BITES`.
- **Crystal interior** — called **hollow** (one word, easier to
  read).
- **Boss-act semantics** — no separate "boss act" concept. The boss
  is triggered solely by eating boss food, which the player opts
  into.
- **Boss style as a discriminator** — bosses pick a fight family
  (**bullet-hell**, **survival**) declared on the def and dispatched
  to per-style modules. Style is _orthogonal_ to mutation: a single
  style can host bosses across mutations. Adding a new style is a new
  file under `boss/styles/` plus a registry entry, not a tick-function
  branch.

## How to use this file

- Looking up a term: scan the section table, copy the internal term
  into code/comments.
- Need a new term: add it here first (with internal + player meaning),
  then use it. Don't redefine an existing word in a new context — pick
  a new word.
- Need to know how a system *works*: this isn't the file. See
  [`mechanics.md`](./mechanics.md).
- Need to know what a system is *for*: see
  [`design.md`](./design.md).
- Player-facing strings live in `LABELS.*` in
  `src/text/labels.js`, never inline. The player column here tells
  you which entries to populate.
