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
play:
  {{nvm}} && node src/main.terminal.js

# Serve for browser (needed for ESM <script type="module">)
serve:
  {{nvm}} && bun run serve
