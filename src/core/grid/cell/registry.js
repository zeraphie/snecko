// cell/registry.js — Registry storage and access primitives.
//
// Split from `cell/index.js` so per-cell files can import `defineCell`
// without creating a circular import via index.js's side-effect cell
// imports. Lifecycle:
//   - cell files (e.g. `empty.js`) call `defineCell(...)` at top level
//     when their module is evaluated.
//   - `cell/index.js` imports each cell file once for its side effect.
//   - `drawCell` (in `cell/index.js`) reads via `getCellSpec`.

const REGISTRY = new Map();

/**
 * @param {number} id — a CELL_* constant from `render/renderer.js`
 * @param {{ render: (x: number, y: number, context?: object) => void }} spec
 */
export function defineCell(id, spec) {
  REGISTRY.set(id, spec);
}

/**
 * @param {number} id
 * @returns {object|undefined}
 */
export function getCellSpec(id) {
  return REGISTRY.get(id);
}
