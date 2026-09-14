/**
 * eval.mts — the evaluation artifact is well formed and large enough to mean
 * something. Ranges are sanity, not targets: a week can score badly and pass.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const doc = JSON.parse(readFileSync(join(ROOT, "public", "start-sit", "eval.json"), "utf8"));

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

console.log("\nEvaluation artifact");
const weeks = Object.values<any>(doc.weeks ?? {});
check(`${weeks.length} week(s) evaluated`, weeks.length >= 1);
check("no NaN or Infinity", !/\bNaN\b|Infinity/.test(JSON.stringify(doc)));
for (const w of weeks) {
  const f = w.final;
  console.log(`\nWeek ${w.week}`);
  check(`${w.games} games with actuals`, w.games >= 13);
  check(`${w.snapshots.length} snapshot(s)`, w.snapshots.length >= 1);
  check(`${f.verdict.pairs} verdict pairs`, f.verdict.pairs >= 300);
  check(`${f.touchdowns.n} touchdown lines`, f.touchdowns.n >= 200);
  check("hit rates and coverages are probabilities",
    [f.verdict.overallHit, ...f.verdict.byGap.map((b: any) => b.hitRate), ...Object.values<any>(f.band).map((b) => b.inside ?? 0.5)]
      .every((x) => x >= 0 && x <= 1));
  check("verdict hit rate rises with the gap", f.verdict.byGap.every((b: any, i: number, a: any[]) => i === 0 || b.hitRate >= a[i - 1].hitRate - 0.08));
  check("every position has an error figure", ["QB", "RB", "WR", "TE"].every((p) => f.points[p]?.ours?.mae != null));
  check("per-stat table covers the core markets", ["rec", "rec_yds", "rush_yds", "pass_yds"].every((s) => f.perStat[s]?.n >= 15));
}
console.log(failures === 0 ? "\neval: all checks passed\n" : `\neval: ${failures} FAILURES\n`);
process.exit(failures === 0 ? 0 : 1);
