/**
 * coaching.mts — assert the published offseason briefing is complete and honest.
 *
 * `team_news.py` validates the hand-authored SOURCE file. This checks the
 * PUBLISHED artifact, which is a different failure surface: a merge that drops
 * a team, a play-caller pointing at a role nobody fills, or an impact score
 * that survived into the output without a coaching change behind it would all
 * pass the Python validator and still be wrong on the page.
 *
 * Run: npm run draft-sheet:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const news = JSON.parse(
  readFileSync(join(ROOT, "public", "draft-sheet", "team-news.json"), "utf8"),
);
const teamsFile = JSON.parse(
  readFileSync(join(ROOT, "public", "draft-sheet", "teams.json"), "utf8"),
);

const entries = news.teams as Record<string, any>;
const codes: string[] = Object.keys(teamsFile.teams);

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

console.log("\nOffseason briefing");

check(`all ${codes.length} teams present`, Object.keys(entries).length === codes.length,
  `got ${Object.keys(entries).length}`);

const missing = codes.filter((c) => !entries[c]);
check("no team missing from the briefing", missing.length === 0, missing.join(" "));

const noCoaching = codes.filter((c) => !entries[c]?.coaching);
check("every team has an authored coaching entry", noCoaching.length === 0,
  noCoaching.length ? `missing: ${noCoaching.join(" ")}` : "");

const noStaff = codes.filter((c) => {
  const co = entries[c]?.coaching;
  return !co?.HC?.in || !co?.OC?.in;
});
check("every team names both a head coach and a coordinator", noStaff.length === 0,
  noStaff.join(" "));

const badCaller = codes.filter((c) => {
  const co = entries[c]?.coaching;
  if (!co?.playCaller) return false;
  return !co[co.playCaller]?.in;
});
check("every play-caller role is actually filled", badCaller.length === 0, badCaller.join(" "));

// An impact score that reached the page without a coaching change behind it is
// an unsupported claim — the one thing this whole file exists to prevent.
const unsupported = codes.filter((c) => {
  const t = entries[c];
  const co = t?.coaching;
  const moved = Object.values(t?.coachNet ?? {}).some((v) => v !== 0);
  const changed = co?.HC?.new || co?.OC?.new || co?.playCallerNew;
  return moved && !changed;
});
check("no arrow is moved by coaching without a coaching change",
  unsupported.length === 0, unsupported.join(" "));

// Every arrow must equal roster + coaching. A drift here means the published
// numbers do not explain the arrow the reader is looking at.
const inconsistent = codes.filter((c) => {
  const t = entries[c];
  return ["QB", "RB", "WR", "TE"].some((p) => {
    const sum = (t.rosterNet?.[p] ?? 0) + (t.coachNet?.[p] ?? 0);
    return Math.abs(sum - (t.net?.[p] ?? 0)) > 0.11;
  });
});
check("net equals roster plus coaching everywhere", inconsistent.length === 0,
  inconsistent.join(" "));

const hcNew = codes.filter((c) => entries[c]?.coaching?.HC?.new).length;
const ocNew = codes.filter((c) => entries[c]?.coaching?.OC?.new).length;
const pcNew = codes.filter((c) => entries[c]?.coaching?.playCallerNew).length;
console.log(`\n  ${hcNew} new head coaches · ${ocNew} new coordinators · ${pcNew} new play-callers`);
// The 2026 cycle had ten head-coach changes, tied for the most ever. If this
// drops, a team quietly lost its entry.
check("head-coach changes match the 2026 cycle", hcNew === 10, `got ${hcNew}, expected 10`);

console.log(
  failures === 0 ? "\ncoaching: all checks passed\n" : `\ncoaching: ${failures} FAILURES\n`,
);
process.exit(failures === 0 ? 0 : 1);
