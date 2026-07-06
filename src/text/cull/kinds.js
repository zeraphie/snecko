// kinds.js — Brood kind variants.
//
// Each kin is randomly tagged at placement time as one of these. The
// kind is flavour-only (mechanically identical) — the variance keeps
// the death toasts from sounding identical ("Brenda the hatchling has
// fallen" / "Off you pop, Trevor the snekling"). See ADR D4.

export const KIND_HATCHLING = "hatchling";
export const KIND_SNEKLING = "snekling";

/** Iteration order — used for random pick. */
export const KINDS = [KIND_HATCHLING, KIND_SNEKLING];
