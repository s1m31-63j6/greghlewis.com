/**
 * Search assertions. The point of folding facet values into the haystack is
 * that a coach can type what they are thinking, so these are the sentences a
 * coach would actually type.
 */

import { readFileSync } from "node:fs";

import { buildIndexEntry, matchPlay, parseQuery, deriveTargets } from "../../../src/lib/playbook/search.ts";
import type { PlayIndexEntry, PlaySpec } from "../../../src/lib/playbook/types.ts";

const specs = JSON.parse(readFileSync("public/playbook/plays.json", "utf8")) as PlaySpec[];
const index: PlayIndexEntry[] = specs.map((spec) => buildIndexEntry({ spec }, "library"));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function find(query: string) {
  return index.filter((e) => matchPlay(e, {}, parseQuery(query)));
}

const ids = (q: string) => find(q).map((e) => e.id);

console.log("\nnatural phrasing — the point of the vocabulary");
check("'first down run' returns only run plays tagged 1st down",
  find("first down run").length > 0 &&
    find("first down run").every((e) => e.f.type === "run" && e.f.situations.includes("1st-down")),
  `${find("first down run").length} hits`);
check("'1st down run' is the same query",
  find("1st down run").length === find("first down run").length);
check("'third and long pass' narrows on both", 
  find("third and long pass").length > 0 &&
    find("third and long pass").every((e) => e.f.type === "pass" && e.f.situations.includes("3rd-long")));
check("'red zone tight end' resolves a zone AND a target",
  find("red zone tight end").length > 0 &&
    find("red zone tight end").every(
      (e) => e.f.situations.includes("red-zone") && e.f.target.includes("TE")));
check("'goal line run' works", find("goal line run").every((e) => e.f.type === "run"));
check("'zone coverage' beats the zone RUNNING game to the phrase",
  find("zone coverage").every((e) => e.f.situations.includes("vs-zone")));
check("'flag' means either the philosophy or the team size",
  find("flag").every((e) => e.f.philosophy === "flag" || e.f.variants.includes("5flag")));

console.log("\ncommas are an explicit AND");
check("'smash, red zone' ANDs",
  find("smash, red zone").length > 0 &&
    find("smash, red zone").every((e) => e.h.includes("smash") && e.f.situations.includes("red-zone")));
check("commas and phrases agree",
  find("first down, run").length === find("first down run").length);
check("an impossible pair returns nothing", find("goal line, two minute, trick").length === 0);

console.log("\nfree text");
check("'mesh' finds 92 Mesh", ids("mesh").includes("ar-92-mesh"));
check("'mesh' finds the flag version too", ids("mesh").includes("flag-mesh"));
check("'air raid' now resolves to the philosophy exactly",
  find("air raid").every((e) => e.f.philosophy === "air-raid"),
  `${find("air raid").length} hits`);
check("philosophy:air-raid filters exactly",
  find("philosophy:air-raid").every((e) => e.f.philosophy === "air-raid"),
  `${find("philosophy:air-raid").length} hits`);
check("'cover 3' resolves to the facet, not a substring",
  find("cover 3").every((e) => e.f.situations.includes("vs-cover-3")), `${ids("cover 3").length} hits`);
check("commentary is still searchable", ids("chalkboard").length === 0 && ids("shallows sit down").length > 0);
check("an alias works", ids("power o").includes("gap-power-right"));
check("a scheme name works", ids("counter").length > 0);
check("nonsense finds nothing", ids("zzzzz").length === 0);

console.log("\nfacet syntax");
check("target:TE returns only tight-end plays",
  find("target:TE").every((e) => e.f.target.includes("TE")), `${find("target:TE").length} hits`);
check("situation:red-zone filters", find("situation:red-zone").every((e) => e.f.situations.includes("red-zone")));
check("side:defense filters", find("side:defense").every((e) => e.f.side === "defense"));
check("variant:5flag filters", find("variant:5flag").every((e) => e.f.variants.includes("5flag")));
check("facets and text combine", find("target:QB option").every(
  (e) => e.f.target.includes("QB") && e.h.includes("option")));

console.log("\nderived targets");
const mesh = specs.find((s) => s.id === "ar-92-mesh")!;
check("Mesh surfaces for its number-two read as well as its primary",
  deriveTargets({ spec: mesh }).includes("ZWR") && deriveTargets({ spec: mesh }).includes("TE"),
  deriveTargets({ spec: mesh }).join(","));
const power = specs.find((s) => s.id === "gap-power-right")!;
check("a run play targets its carrier", deriveTargets({ spec: power }).includes("RB"));
const veer = specs.find((s) => s.id === "fb-inside-veer")!;
check("an option play targets the give, the keep and the pitch",
  ["FV", "QB", "RB"].every((t) => deriveTargets({ spec: veer }).includes(t as never)),
  deriveTargets({ spec: veer }).join(","));

console.log("\ncoverage of the facet vocabulary");
for (const facet of ["philosophy", "type", "target", "situations"] as const) {
  const empty = index
    // A defensive play has no intended target, by definition.
    .filter((e) => !(facet === "target" && e.f.side === "defense"))
    .filter((e) => {
      const v = e.f[facet];
      return Array.isArray(v) ? v.length === 0 : !v;
    });
  check(`every play has a ${facet}`, empty.length === 0,
    empty.length ? empty.slice(0, 3).map((e) => e.id).join(", ") : "");
}

console.log(failures ? `\n${failures} failure(s)\n` : "\nall search checks pass\n");
process.exit(failures ? 1 : 0);
