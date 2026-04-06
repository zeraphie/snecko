default:
  @just --list

# Run all checks (format, lint, test)
check:
  bun run format:check
  bun run lint
  bun run test

# Format all files
format:
  bun run format

# Lint source and test files
lint:
  bun run lint

# Auto-fix lint issues
lint-fix:
  bun run lint:fix

# Run tests
test:
  bun run test

# Run tests in watch mode
test-watch:
  bun run test:watch

# Run tests with coverage
test-coverage:
  bun run test:coverage

# Generate crystal bitmasks from .shapes file
gen-shapes:
  node scripts/gen-shapes.js

# Play in terminal
play:
  node src/main.terminal.js

# Serve for browser (needed for ESM <script type="module">)
serve:
  npx --yes serve .
