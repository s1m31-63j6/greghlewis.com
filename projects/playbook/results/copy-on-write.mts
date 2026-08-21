/**
 * Copy-on-write, asserted rather than assumed.
 *
 * The promise the whole editing model rests on: **editing a library play never
 * touches the library play.** It forks into a new play whose lineage points
 * back at the original, and the original stays exactly as it shipped.
 *
 * This checks it at the level that matters — the play documents themselves —
 * so it holds whether the edit came from the UI, the API, or anywhere else.
 *
 *   node --experimental-strip-types projects/playbook/results/copy-on-write.mts
 */

import { readFileSync } from "node:fs";

import { resolvePlay, DEFAULT_STYLE } from "../../../src/lib/playbook/resolve.ts";
import type { FieldVariantId, Play, PlaySpec } from "../../../src/lib/playbook/types.ts";

const LIBRARY = "public/playbook/plays.json";
const specs = JSON.parse(readFileSync(LIBRARY, "utf8")) as PlaySpec[];

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const ORIGINAL_ID = "ar-92-mesh";
const VARIANT: FieldVariantId = "11man";

// A pristine copy of the library play, kept for comparison at the end.
const pristine = JSON.stringify(specs.find((s) => s.id === ORIGINAL_ID));
const library: Play = { spec: specs.find((s) => s.id === ORIGINAL_ID)! };

console.log("\nediting a library play");

// The exact shape `usePlaybook.commitEdit` produces for a play the book does
// not own: a fresh id, and lineage back to where it came from.
const forkedId = `u_${ORIGINAL_ID}_ab12cd`;
const edited: Play = {
  spec: {
    ...structuredClone(library.spec),
    id: forkedId,
    name: "92 Mesh — Z Dig",
    assignments: {
      ...structuredClone(library.spec.assignments),
      // A real edit: change the primary's route outright.
      Z: { kind: "route", route: "dig", mods: { depth: 14 } },
    },
  },
  overrides: {
    authoredVariant: VARIANT,
    players: { H: { dx: -2, dy: -1 } },
    paths: { X: { mode: "freehand", points: [{ x: -16, y: 0 }, { x: -16, y: 9 }], curve: "polyline", cap: "arrow", style: "solid" } },
  },
  lineage: { rootId: ORIGINAL_ID, parentId: ORIGINAL_ID, rev: 1, source: "user" },
  notes: "Dig instead of the corner against a squatting boundary corner.",
};

check("the fork has a different id", edited.spec.id !== library.spec.id, `${library.spec.id} -> ${edited.spec.id}`);
check("the fork points back at the original", edited.lineage?.rootId === ORIGINAL_ID);
check("the fork is marked as the coach's own", edited.lineage?.source === "user");
check("the fork starts at revision 1", edited.lineage?.rev === 1);

console.log("\nthe original is untouched");

// The library play object must be byte-identical to what it was before.
check("the library play document did not change", JSON.stringify(library.spec) === pristine);
check("the original still has no overrides", library.spec === specs.find((s) => s.id === ORIGINAL_ID));
check(
  "the original's primary route is still the corner",
  (library.spec.assignments.Z as { route?: string } | undefined)?.route === "corner",
  String((library.spec.assignments.Z as { route?: string } | undefined)?.route),
);
check("the original has no notes", library.spec === specs.find((s) => s.id === ORIGINAL_ID) && !("notes" in library));
check("the original still carries its own name", library.spec.name === "92 — Mesh", library.spec.name);

console.log("\nthe two resolve differently");

const a = resolvePlay(library, VARIANT, false, DEFAULT_STYLE);
const b = resolvePlay(edited, VARIANT, false, DEFAULT_STYLE);

const zEnd = (p: typeof a) => {
  const path = p.paths.find((x) => x.slot === "Z");
  const pt = path?.points.at(-1);
  return pt ? `${pt.x.toFixed(1)},${pt.y.toFixed(1)}` : "none";
};
check("Z ends somewhere different", zEnd(a) !== zEnd(b), `${zEnd(a)} vs ${zEnd(b)}`);

const hAt = (p: typeof a) => p.players.find((x) => x.slot === "H")!.at;
check(
  "H moved by exactly the delta that was stored",
  Math.abs(hAt(b).x - (hAt(a).x - 2)) < 1e-9 && Math.abs(hAt(b).y - (hAt(a).y - 1)) < 1e-9,
  `${hAt(a).x},${hAt(a).y} -> ${hAt(b).x},${hAt(b).y}`,
);
check("neither resolve produced a warning", a.warnings.length === 0 && b.warnings.length === 0);

console.log("\nresolving the fork did not mutate the original");
check("the library play document is STILL unchanged after both resolves", JSON.stringify(library.spec) === pristine);

// Everything else in the library has to be untouched too — a shared reference
// anywhere would show up here.
const afterAll = JSON.stringify(JSON.parse(readFileSync(LIBRARY, "utf8")));
check("the library file on disk is unchanged", afterAll === JSON.stringify(specs));

console.log(failures ? `\n${failures} failure(s)\n` : "\ncopy-on-write holds\n");
process.exit(failures ? 1 : 0);
