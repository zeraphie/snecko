// practice.js — Constants for the practice-mode hub.
//
// The practice hub is a four-way picker that branches into mutation
// practice, single-boss fights, random boss, or boss rush. The item
// list lives here (in core) instead of in the screen module so the
// game logic doesn't depend on the screen layer.

/**
 * Practice hub items, in display order. Each `id` is also the key into
 * `LABELS.practiceHub.items` for its display label.
 *
 * @type {ReadonlyArray<{ id: string }>}
 */
export const PRACTICE_HUB_ITEMS = [
  { id: "mutations" },
  { id: "bossPicker" },
  { id: "randomBoss" },
  { id: "bossRush" },
];
