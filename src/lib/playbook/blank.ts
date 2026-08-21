/**
 * A blank play.
 *
 * The default formation for the variant and nothing else — no assignments, no
 * routes. A coach who clicks "build your own" wants an empty field with his
 * players on it, not a play he has to dismantle first.
 */

import { formationById } from "./formations.ts";
import type { FieldVariantId, Play, PlaySpec } from "./types.ts";

const OFFENSE_FORMATION: Record<FieldVariantId, string> = {
  "11man": "gun-doubles-right",
  "9man": "gun-doubles-right",
  "8man": "gun-doubles-right",
  "7man": "gun-doubles-right",
  "5flag": "flag-spread",
};

const DEFENSE_FRONT: Record<FieldVariantId, string> = {
  "11man": "over-4-3",
  "9man": "over-4-3",
  "8man": "over-4-3",
  "7man": "seven-3-2-2",
  "5flag": "flag-1-rush",
};

export function newPlayId(): string {
  return `u_new_${Math.random().toString(36).slice(2, 8)}`;
}

export function blankPlay(variant: FieldVariantId, side: "offense" | "defense"): Play {
  const formationId = OFFENSE_FORMATION[variant];
  // A formation that does not exist would resolve to an empty field, which is
  // a confusing way to start.
  const safeFormation = formationById(formationId) ? formationId : "gun-doubles-right";

  const spec: PlaySpec = {
    id: newPlayId(),
    name: "New Play",
    aliases: [],
    philosophy: side === "defense" ? "defense-coverage" : "spread-rpo",
    family: side === "defense" ? "coverage" : "pass",
    side,
    variantScope: [variant],
    formationId: side === "defense" ? "" : safeFormation,
    frontId: side === "defense" ? DEFENSE_FRONT[variant] : undefined,
    coverageId: side === "defense" ? "cover-3" : undefined,
    assignments: {},
    reads: [],
    annotations: [],
    tags: [],
    situations: [],
    coaching: {},
  };

  return { spec, lineage: { rootId: spec.id, parentId: spec.id, rev: 1, source: "user" } };
}
