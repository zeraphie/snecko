set shell := ["bash", "-cu"]

nvm := "source ${NVM_DIR:-$HOME/.nvm}/nvm.sh --no-use && nvm use --silent"

default:
  @just --list

# Run all checks (format, lint, test)
check: format-check lint test

# Format all files
format:
  {{nvm}} && bun run format

# Check formatting
format-check:
  {{nvm}} && bun run format:check

# Lint source and test files
lint:
  {{nvm}} && bun run lint

# Auto-fix lint issues
lint-fix:
  {{nvm}} && bun run lint:fix

# Run tests
test:
  {{nvm}} && bun run test

# Run tests in watch mode
test-watch:
  {{nvm}} && bun run test:watch

# Run tests with coverage
test-coverage:
  {{nvm}} && bun run test:coverage

# Generate crystal bitmasks from .shapes file
gen-shapes:
  {{nvm}} && node scripts/gen-shapes.js

# Play in terminal
# mode:  boss (skip to boss arena) | wildlands (wildlands terrain)
# world: wildlands | crystalline   (sets the boss biome; inferred from mode if omitted)
# Examples:
#   just play                  → crystalline game, The Anchor on trigger
#   just play boss             → boss arena, The Anchor (crystalline)
#   just play wildlands        → wildlands terrain, The Current Sovereign
#   just play boss wildlands   → boss arena, The Current Sovereign
play mode="" world="":
  {{nvm}} && node src/main.terminal.js {{mode}} {{world}}

# Serve for browser (needed for ESM <script type="module">)
serve:
  {{nvm}} && bun run serve
