# Design notes

Current design intent for each mutation and boss. Designer-facing —
holds the **why**, not the **how** (mechanics live in
[`glossary.md`](./glossary.md) and [`mechanics.md`](./mechanics.md)). Use this doc to keep yourself
honest while iterating: when a fight starts feeling off, re-read the
"Don't become" line and see if you've drifted.

Strawmen, not ground truth. Update when the intent shifts.

Each entry uses the same five-line structure:

- **Fantasy** — the one-line pitch. What the player thinks they're in.
- **Core mechanic** — the loop the player actually learns and exploits.
- **Signature moment** — the thing that has to happen for the design to
  have done its job.
- **Don't become** — the anti-pattern. What this fight/mutation must
  not collapse into when balance shifts.
- **Open** — design questions still up in the air; the levers worth
  pulling.

## Mutations

### Crystalline

- **Fantasy:** an empty arena slowly filling with hostile geometry.
  Space is a resource and you're losing it.
- **Core mechanic:** read the lattice's growth/decay cycle, route
  around blooming crystals, exploit the windows when crystals decay.
  Telegraphs are the planning tool.
- **Signature moment:** committing to a path and watching a crystal
  bloom dead-centre on it — and finding the alternate route in time.
- **Don't become:** a static-walls grid where new crystals only matter
  in the moments they appear. The lifecycle (`telegraph_place →
place → telegraph_grow → grow → linger → decay`) is the soul; if
  players stop reading those states, the mutation has degraded into
  random walls.
- **Open:** crystal density, concurrent-lifecycle count
  (`SPAWN_INTERVAL`), how aggressive bigger stages should be in mid-
  to-late acts.

### Wildlands

- **Fantasy:** a living landscape. Currents are weather, walls are
  terrain. You're not fighting the map — you're working with it.
- **Core mechanic:** read river flow vectors, accept drift as part of
  the move, time food approaches against the current's lifecycle.
  Iron Jaw (low-wall eating) is the only mutation-specific upgrade —
  it's the "tame the terrain" answer.
- **Signature moment:** riding a river to a food cell you couldn't
  have reached against the current, threading between cells just
  before the river `telegraph_shift`s under your feet.
- **Don't become:** a current-spam where the river feels random or
  punitive instead of readable. The `telegraph → flow → surge` rhythm
  must stay legible.
- **Open:** low/high wall ratio (FBM thresholds); river width and
  shift cadence; whether currents should ever push the snake into a
  wall (they shouldn't, but it's a constraint to keep enforcing).

### Catacombs

- **Fantasy:** an ancient labyrinth that occasionally rearranges
  itself. You can't memorise the way out; the way out is changing.
- **Core mechanic:** maze navigation + adaptation. The 2-wide
  corridors are deliberate — they read as "passages", not "rooms",
  and they fit the survival blob exactly. Rifts add a fourth
  dimension: the topology between food bites.
- **Signature moment:** the corridor you were heading down closes
  with a `telegraph_rift` a beat before you reach it; you reroute
  through a side passage that just opened.
- **Don't become:** a static maze. Rifts are the reason this mutation
  exists; if the cadence is too slow players forget about them, too
  fast and the maze feels arbitrary.
- **Open:** `RIFT_CADENCE` (currently 5 bites/cycle); whether to ever
  allow rifts that close on the snake's straight path (currently
  forbidden); how aggressively the extra-loop pass adds cycles to
  the base tree.

### Brood

- **Fantasy:** you are a snake mother. You hatched a half-dozen
  hatchlings on an open field. A theatrical, top-hatted, knife-clawed
  crow named Sir Reginald Caw is sitting on the fence picking them off
  one cell at a time, narrating his work.
- **Core mechanic:** real-time defensive triage. You spend the early
  beats placing your brood, then the act is a race between Reginald's
  4-second throw cadence and your snake's food collection. Shields are
  a scarce reactive resource (5 per act, one per kin); the question is
  always _which_ kin to cover next, with the AI's hunt + pity timers
  pulling toward the answer being "the one he just hit".
- **Signature moment:** the kin he keeps narrowly missing, you keep
  meaning to shield, then he gets a pity-forced hit on it and the
  death toast names her.
- **Don't become:** a tower-defence sim. The snake is still the
  protagonist — the kin are the stakes, not the puzzle. If the player
  can play it like Plants vs Zombies (just micromanage shields), we've
  drifted. Shields are limited so the answer is sometimes "let her
  die, save the bigger one".
- **Open:** `THROW_INTERVAL_MS` (currently 4 s — too slow / too fast?);
  the pity range (`[3, 5]` misses); the relative weights of
  `SCORE_PER_KIN` vs `SCORE_PER_UNUSED_SHIELD` (D22 invariant
  constrains the order, not the magnitudes); whether hunt should
  remember more than the latest hit cell when re-anchoring.

## Bosses

### Traffic Jam (crystalline → bullet-hell)

- **Fantasy:** the lattice weaponised. The same crystals you've been
  navigating now drop on you in bursts — but they're cover too if you
  use them right.
- **Core mechanic:** dodge a wide projectile fan from above while
  using the boss-spawned amber pillars as cover. Charge through a
  pillar to clear it (turning cover into momentum).
- **Signature moment:** ducking behind a fresh pillar to break a
  fan's line — then realising the pillar will auto-expire in a few
  ticks and you need to commit before it does.
- **Don't become:** a pillar maze with a static turret. The pillars
  must read as temporary, and the fan must remain the dominant
  pressure; pillars are the relief, not the obstacle.
- **Open:** pillar duration vs. fan cadence; phase-2 fan width (5 →
  7); whether to telegraph pillar placement.

### The Algorithm (wildlands → bullet-hell)

- **Fantasy:** the river didn't go away — it's _between_ you and the
  boss now, bending bullets. Geometry is on the boss's side.
- **Core mechanic:** read the per-cell flow vectors of the
  algorithm-current band, predict how bullets will curve, position so
  curved shots miss instead of converge.
- **Signature moment:** dodging a shot that _looked_ straight only
  for the river to whip it back across your head — and learning to
  pre-empt the curve next time.
- **Don't become:** a pure projectile fight where the river is
  decoration. If players stop using the curve to plan dodges and just
  jink at the last second, the mechanic has failed to teach.
- **Open:** telegraph length vs. flow length (`TELEGRAPH_TICKS = 4`,
  `FLOW_TICKS = 8`); river width; whether snake_hungry's vertical
  range should let the player enter the river and use it themselves.

### Absolute Unit (default fallback → bullet-hell)

- **Fantasy:** a generic boss. Big body, no tricks. The shape of a
  fight before the fight has identity.
- **Core mechanic:** pure bullet-hell baseline — body cells, weak
  point, phase-escalating fire patterns. No `special()`. The fight a
  new boss def starts as before its mechanic is added.
- **Signature moment:** none, on purpose. If a player has a story
  about Absolute Unit, the design has gone wrong.
- **Don't become:** featured. The moment we ship a new biome, that
  biome should get its own boss; Absolute Unit's only job is "any
  mutation can fall back to a working fight." Don't tune it; replace
  it.
- **Open:** retiring it isn't on the roadmap — it's the safety net.
  But if every mutation gets a dedicated boss, this could move to a
  practice-only debug fight.

### The Roomba (catacombs → survival)

- **Fantasy:** the maze is hunting you. Slow inevitability — not a
  fair fight, not meant to be one. You're prey.
- **Core mechanic:** chase + survival timer. Player tools are
  pathfinding the maze, baiting the BFS at intersections, using the
  rifts to put walls between you and the blob.
- **Signature moment:** the blob squeezes through a doorway behind
  you and you realise you didn't actually get away — and then the
  rift you were running toward closes.
- **Don't become:** a bullet-hell with no bullets. The pressure is
  geometry, not damage. If players start trying to "kill" the blob,
  the framing has slipped.
- **Open:** the fixed `SURVIVAL_WIN_TICKS = 750` timer vs. an
  N-phase escalation; default blob speed (`SURVIVAL_BOSS_TICK_INTERVAL
= 1`); BFS recompute cadence as a baiting dial
  (`SURVIVAL_BOSS_PATH_RECOMPUTE_TICKS`); how much rift telegraphing
  should remain visible during the fight.

### Hissalia, Blade of Wormwood (— → soulslike)

Status: in playtest tuning (labelled "(WIP)" in the boss picker). Not
wired to any mutation; reachable via the boss picker only in v1.

- **Fantasy:** a Souls/Sekiro duel inside Snake. You are no longer a
  growing snake — you are a fighter with a knife, an arena, and a
  giant in front of you who wants you dead.
- **Core mechanic:** stamina-gated melee. Read the boss's telegraph,
  pick the right defensive (dodge through, parry, walk out of
  range), counter on the opening. Stamina is the limiter on every
  action — committing to dodge means you can't immediately stab,
  whiffing a parry means you're out of breath for the next swing.
- **Signature moment:** the parry. Pressing L into a sweep tell,
  the boss freezes white, and you get three or four free hits
  before the stagger ends. Or: the Waterfowl. Three dashes you
  have to bait then dodge, with a 360° glaive swipe at each
  landing — the moment where you stop reading individual attacks
  and start reading patterns.
- **Don't become:** a bullet-hell with extra steps. The fight has
  to reward positioning and reading tells; if it collapses into
  "mash stab whenever stamina allows", the stamina system is too
  generous or the telegraphs aren't readable enough. Conversely
  if players never feel safe enough to attack, the windows are
  too tight.
- **Open:** Hissalia is in playtest. Currently being tuned:
  movement cadence, dash speed, swipe ring density, scenery
  density / clarity, water surface readability vs combat
  legibility. Numbers in `soulslike/constants.js` are starting
  values — expect them to keep moving.

## How to use this file

- Open it before sitting down to balance or extend a fight. Re-read
  the relevant entry. If the change you're about to make would break
  the **Don't become** line, that's a design conversation, not a
  tuning pass.
- New mutation or boss → add an entry here _before_ writing code. The
  five lines are a forcing function; if you can't write them, the
  design isn't ready.
- Open questions get added freely. Resolved questions get _removed_
  (not crossed out) — this doc is current state, not history.
