# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.10.0]

### Added

- Brood mutation — Sir Reginald Caw, an off-grid predator who hurls things
  at kin (baby snakes) placed by the player at act start
- Cull mechanic: real-time throw cadence with telegraph → impact fuses,
  battleship-style AI (search / hunt / pity), plus-bomb and line-bomb
  specials on a food-eaten cadence, and mine traps that stun Reginald
- Placement flow: pool of six shaped kin (tetromino-style pieces) plus
  three mines placed via a grid cursor before the act starts
- Shields (five per act) that absorb one hit per shielded kin per throw
- Sparse walls scattered on the brood grid without isolating open cells
- Brood act-clear scoring: bonus per surviving kin + per unused shield;
  breakdown shown on the draft screen
- Brood game-over screen when every kin has died
- Sir Reginald sprite (canvas + terminal) with speech-bubble surfacing
  for idle taunts, pity announcements, block reactions, death toasts,
  stun yelps, and game-over remarks
- Version number now displayed under the SNECKO header and in the
  browser tab title, sourced from `package.json` at runtime
- Catacombs cobble terrain and crystalline cluster textures with
  telegraph wireframe

### Fixed

- Food placement no longer picks cells that trap the snake in a
  dead-end pocket after eating
- Browser-reserved key combos (F5, Ctrl/Cmd+R, F11) now pass through
  the game's input handler

## [0.9.0]

### Added

- Hissalia — soulslike boss with dedicated controls and stamina
- Fox cutscene overlay

## [0.8.5]

### Added

- Additional practice modes
- Roomba mechanic
- Windows native binding install script

## [0.8.0]

### Changed

- Version bump

## [0.7.0]

### Changed

- Terminology cleanup across UI and code

## [0.6.0]

### Added

- Boss system
- Bun bundle configuration for browser builds

### Changed

- Migrated from ESLint + Prettier to oxlint + oxfmt
- Justfile recipes now source nvm for consistent Node/Bun versions

### Fixed

- GitHub Pages deployment
- Boss damage calculation

## [0.5.0]

### Added

- Initial public release
- Snake + roguelike core gameplay loop
- Additive grid generation with crystalline and wildlands biomes
- Upgrade draft system (passives, consumables, mutations)
- River currents and lattice growth mechanics
- Canvas renderer (browser) and terminal renderer (ANSI)
- Tetromino shape definitions via `.shapes` visual format
- Full ESM module system
