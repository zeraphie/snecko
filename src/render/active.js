// active.js — Module-level holder for the active renderer.
//
// Cell files (under `core/grid/cell/`) need a renderer to draw to but
// shouldn't have to thread one through every call. Instead, the boot
// script (`main.terminal.js` / `main.browser.js`) calls
// `setActiveRenderer(...)` once after constructing its renderer; cell
// files import `activeRenderer` and call methods on it directly.
//
// `activeRenderer` is a Proxy that forwards method access to the
// currently-set renderer. Methods are auto-bound so `this` resolves
// inside the renderer instance. Returns `undefined` when no renderer
// is set (or when the renderer doesn't have the requested method) —
// callers can guard with `?.()` or check truthiness.

let _r = null;

/** @param {object|null} r — renderer instance, or null to clear. */
export function setActiveRenderer(r) {
  _r = r;
}

export const activeRenderer = new Proxy(
  {},
  {
    get(_target, key) {
      const v = _r?.[key];
      return typeof v === "function" ? v.bind(_r) : v;
    },
  }
);
