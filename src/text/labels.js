// labels.js — Player-facing string source of truth.
//
// Strings shown to players (HUD, screens, tutorial) live here so that
// vocabulary stays consistent with PLAN.terminology.md and is easy to
// audit / change in one place. Internal-only strings (logs, errors,
// dev-only text) stay inline.

export const LABELS = {
  hud: {
    act: "Act",
    progress: "Progress",
    // The "score" field counts total food-bites eaten this run; display as "Bites".
    score: "Bites",
    time: "Time",
    // Lowercase unit suffix used after a number (e.g. "3 bites").
    bites: "bites",
  },
  dead: {
    title: "G A M E   O V E R",
    cause: "Cause",
    restart: "Press Space or Enter to restart",
  },
  // Each upgrade has:
  //   name  — long flavour title shown on draft/contraband cards
  //   short — terse label shown in the HUD upgrade strip (~10 chars)
  //   desc  — one-liner shown under the name on cards
  upgrades: {
    // Passives
    climber: {
      name: "Parkour!",
      short: "Parkour",
      desc: "Low walls? More like no walls",
    },
    iron_jaw: {
      name: "Mmm, Crunchy",
      short: "Iron Jaw",
      desc: "Walls are tasty too",
    },
    slow_time: {
      name: "Snake.exe has stopped responding",
      short: "Slow Time",
      desc: "Everything is slower. You're welcome",
    },
    // Consumables
    bomb: {
      name: "Who gave the snake a gun?",
      short: "Bullets",
      desc: "Seriously, who did this",
    },
    dash: {
      name: "Snek Goes Brrrr",
      short: "Dash",
      desc: "Zoom through walls at alarming speed",
    },
    wormhole: {
      name: "Snake Discovered Quantum Mechanics",
      short: "Wormhole",
      desc: "Do quantum mechanics things",
    },
    // Mutations
    wildlands: { name: "Wildlands", short: "Wildlands", desc: "FBM terrain generation" },
    crystalline: {
      name: "Crystalline",
      short: "Crystalline",
      desc: "Crystal growth generation",
    },
    // Contraband
    danger_noodle: {
      name: "Danger noodle",
      short: "Trail",
      desc: "Snake hurts",
    },
    get_out_of_jail_free: {
      name: "Get out of jail free",
      short: "Pardon",
      desc: "Just ignore the bullet, lol",
    },
    snake_hungry: {
      name: "Snake hungry, snake need bigger food",
      short: "Hungry",
      desc: "Unlocks vertical dodging in boss fights (+halved fire cooldown near boss)",
    },
    double_snake: {
      name: "Double snake? Double snake!",
      short: "Echo",
      desc: "What's better than one snake? That's right, three.",
    },
    gomu_gomu: {
      name: "Gomu gomu no Snakeskin",
      short: "Shield",
      desc: "Luffy got nothing on Snake, one free hit.",
    },
    collateral_hissage: {
      name: "Collateral hissage",
      short: "Crit",
      desc: "One hit, three problems. Not your problems.",
    },
  },
  bosses: {
    traffic_jam: { name: "Traffic Jam" },
    the_algorithm: { name: "The Algorithm" },
    absolute_unit: { name: "Absolute Unit" },
  },
  start: {
    title: "S N E C K O",
    controls: "Arrow keys or WASD to move",
    begin: "Press Space or Enter to start",
  },
  draft: {
    // "L E V E L   U P" was the old wording before level → act; "Upgrade" is
    // the closest direct description of what's happening. Easy to swap.
    title: "U P G R A D E",
    mutationPrefix: "MUTATION",
    selectInstrFull: "↑↓ select, ←→ mutation, Enter confirm",
    selectInstr: "↑↓ select, Enter confirm",
  },
  contraband: {
    title: "C O N T R A B A N D",
    subtitle: "These upgrades are not on the flight manifest.",
    none: "No items available.",
    inHold: "In the hold",
    selectInstr: "↑↓ select, Enter confirm",
  },
  boss: {
    incoming: "INCOMING",
    holdPosition: "hold position...",
    phases: ["warmup", "phase 1", "phase 2", "phase 3"],
  },
};
