import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHAPES_FILE = path.join(
  __dirname,
  '..',
  'src',
  'core',
  'generation',
  'crystalline',
  'crystals.shapes'
);
const TARGET_FILE = path.join(
  __dirname,
  '..',
  'src',
  'core',
  'generation',
  'crystalline',
  'crystals.js'
);

const SOLID = '\u2588'; // █
const TELEGRAPH = '\u2593'; // ▓
const SPACE = '\u2591'; // ░

function parseShapesFile(text) {
  const blocks = text.trim().split(/\n\n+/);
  // Group stages by crystal name
  const crystalMap = new Map();

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    if (lines.length < 2) continue;

    const header = lines[0].trim();
    const parts = header.split(/\s+/);
    const name = parts[0];
    const stage = parseInt(parts[1], 10);
    if (isNaN(stage)) {
      console.error(`Invalid stage number in header: "${header}"`);
      process.exit(1);
    }

    const grid = lines.slice(1);
    const height = grid.length;
    const width = grid[0].length;
    const solidRows = [];
    const telegraphRows = [];

    for (let y = 0; y < height; y++) {
      let solidMask = 0;
      let telegraphMask = 0;
      for (let x = 0; x < grid[y].length; x++) {
        const ch = grid[y][x];
        if (ch === SOLID) {
          solidMask |= 1 << x;
        } else if (ch === TELEGRAPH) {
          telegraphMask |= 1 << x;
        }
        // ░ (SPACE) = empty, no bits set
      }
      solidRows.push(solidMask);
      telegraphRows.push(telegraphMask);
    }

    if (!crystalMap.has(name)) {
      crystalMap.set(name, []);
    }
    crystalMap.get(name).push({ stage, width, height, solidRows, telegraphRows });
  }

  // Sort stages within each crystal and build final array
  const crystals = [];
  for (const [name, stages] of crystalMap) {
    stages.sort((a, b) => a.stage - b.stage);
    crystals.push({ name, stages });
  }

  return crystals;
}

function toBinary(mask, width) {
  return '0b' + mask.toString(2).padStart(width, '0');
}

function generateBaseShapes(crystals) {
  const entries = crystals.map((c) => {
    const stageStrs = c.stages.map((s) => {
      const solidStrs = s.solidRows.map((r) => toBinary(r, s.width));
      const telegraphStrs = s.telegraphRows.map((r) => toBinary(r, s.width));
      return `    { width: ${s.width}, height: ${s.height}, solidRows: [${solidStrs.join(', ')}], telegraphRows: [${telegraphStrs.join(', ')}] }`;
    });
    return `  { name: "${c.name}", stages: [\n${stageStrs.join(',\n')},\n  ] }`;
  });
  return entries.join(',\n');
}

// Read and parse
const shapesText = fs.readFileSync(SHAPES_FILE, 'utf8');
const crystals = parseShapesFile(shapesText);

if (crystals.length === 0) {
  console.error('No shapes found in', SHAPES_FILE);
  process.exit(1);
}

// Read target file and replace BASE_SHAPES block
const target = fs.readFileSync(TARGET_FILE, 'utf8');
const marker = /\/\/ prettier-ignore\nconst BASE_SHAPES = \[\n[\s\S]*?\n\];/;

if (!marker.test(target)) {
  console.error('Could not find BASE_SHAPES block in', TARGET_FILE);
  process.exit(1);
}

const replacement =
  '// prettier-ignore\nconst BASE_SHAPES = [\n' + generateBaseShapes(crystals) + ',\n];';

const updated = target.replace(marker, replacement);
fs.writeFileSync(TARGET_FILE, updated, 'utf8');

const totalStages = crystals.reduce((sum, c) => sum + c.stages.length, 0);
console.log(`Generated ${crystals.length} crystals (${totalStages} stages) from crystals.shapes`);
