# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Replaced ESLint + Prettier with oxlint + oxfmt
- Justfile recipes now source nvm for consistent Node/Bun versions

## [0.5.0] - 2025

### Added

- Initial public release
- Snake + roguelike core gameplay loop
- Additive board generation with crystalline and wildlands biomes
- Upgrade draft system (passives, consumables, mutations)
- River currents and lattice growth mechanics
- Canvas renderer (browser) and terminal renderer (ANSI)
- Tetromino shape definitions via `.shapes` visual format
- Full ESM module system
