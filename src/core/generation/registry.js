// registry.js — Mutation registry: maps mutation id → grid generator pair.
//
// Single source of truth for "which generator runs for which mutation."
// The draft flow consults this when applying a TYPE_MUTATION upgrade; the
// terminal entry consults it when picking a generator from a CLI arg.
//
// Adding a new mutation: import its generate/advance pair below and add
// one entry to MUTATIONS. Both call sites pick it up automatically.

import {
  generateGrid as generateCrystallineGrid,
  advanceGrid as advanceCrystallineGrid,
} from "./index.js";
import { generateWildlandsGrid, advanceWildlandsGrid } from "./wildlands/generator.js";
import { generateCatacombsGrid, advanceCatacombsGrid } from "./catacombs/generator.js";

/**
 * @typedef {Object} MutationEntry
 * @property {(game: object) => void} generate — runs once at act start
 * @property {(game: object) => void} advance  — runs each food-bite
 */

/** @type {Record<string, MutationEntry>} */
export const MUTATIONS = {
  crystalline: { generate: generateCrystallineGrid, advance: advanceCrystallineGrid },
  wildlands: { generate: generateWildlandsGrid, advance: advanceWildlandsGrid },
  catacombs: { generate: generateCatacombsGrid, advance: advanceCatacombsGrid },
};

/**
 * Returns the generator pair for a mutation id, or null if the id is
 * unknown. Callers fall back to whatever default they choose.
 *
 * @param {string} id
 * @returns {MutationEntry | null}
 */
export function getMutationGenerator(id) {
  return MUTATIONS[id] ?? null;
}
