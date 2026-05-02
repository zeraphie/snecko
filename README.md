# Snecko

[![CI](https://github.com/zeraphie/snecko/actions/workflows/ci.yml/badge.svg)](https://github.com/zeraphie/snecko/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-lts%2Fkrypton-brightgreen)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/runtime%20deps-0-blue)](#)
[![GitHub Pages](https://img.shields.io/badge/play-online-orange)](https://zeraphie.github.io/snecko/)

Snake, but it's a roguelite. Procedural crystal walls, boss fights, contraband upgrades, and permadeath — in the terminal or the browser.

## Quick Start

```bash
nvm use
npm run play        # terminal
just serve          # browser
```

## How to Play

Arrow keys or WASD. Eat food to clear acts. Each act generates a new layout. Your snake grows as you eat within an act and resets at the start of the next; later acts ramp up the difficulty.

Between acts you pick upgrades that modify your run. Survive long enough and you'll face a boss fight.

## Commands

```bash
just play           # terminal mode
just serve          # browser mode
just check          # format + lint + test
just play boss      # jump straight to boss fight
```

## Design

- Zero runtime dependencies — ESM modules, no bundler
- Bitmask grid with 31-bit chunks (Uint32Array)
- Ring-buffer snake with O(1) movement
- Runs in both `<canvas>` and ANSI terminal from shared game logic
- Procedural grid generation using crystal shapes

## Tests

```bash
npm test
```
