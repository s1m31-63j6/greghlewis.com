/**
 * names.mts — the sportsbook tier attaches to the right players.
 *
 * The pick'em tier joins on Sleeper's own id and cannot misfile anyone. The
 * sportsbook tier arrives with names, and a name that fails to match is a
 * player whose Vegas number silently falls back to the weaker tier. The
 * publisher records every unmatched name; this asserts the rate stays low and
 * prints the residue so an alias can be added.
 *
 * Skips, visibly, when no sportsbook snapshot exists yet.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const meta = JSON.parse(readFileSync(join(ROOT, "public", "start-sit", "meta.json"), "utf8"));

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

console.log("\nSportsbook names");
if (!meta.counts.books) {
  console.log("  --    no sportsbook snapshot in this build; the pick'em tier needs no matching");
} else {
  const matched = meta.counts.bookStats;
  const unmatched = meta.counts.unmatched;
  const rate = matched / (matched + unmatched);
  check(`${(rate * 100).toFixed(1)}% of sportsbook rows matched a pool player`, rate >= 0.97,
    unmatched ? `unmatched: ${meta.unmatched.join(", ")}` : "");
  check(`${meta.counts.books} books`, meta.counts.books >= 3);
}
console.log(failures === 0 ? "\nnames: all checks passed\n" : `\nnames: ${failures} FAILURES\n`);
process.exit(failures === 0 ? 0 : 1);
