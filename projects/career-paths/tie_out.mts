/**
 * tie_out.mts — the browser engine must reproduce the Python reference.
 *
 * simulate.py wrote reference.json from the Python engine under fixed cohort
 * seeds. This runs the shipped TypeScript engine over the same cohorts from
 * public/career-paths/params.json and fails if any summary statistic drifts
 * by more than 0.5%. Same seed, same stream, so the real tolerance is float
 * noise; a stale public copy of params.json or a divergent port shows up as
 * a wall of misses.
 *
 * Run: npm run career-paths:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadParams } from "../../src/app/projects/career-paths/engine/params.ts";
import { runCohort, summarize, type CohortSummary } from "../../src/app/projects/career-paths/engine/stats.ts";
import type { Persona, Stage, Track3 } from "../../src/app/projects/career-paths/engine/types.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const P = loadParams(JSON.parse(readFileSync(join(ROOT, "public", "career-paths", "params.json"), "utf8")));
const ref = JSON.parse(readFileSync(join(ROOT, "public", "career-paths", "reference.json"), "utf8")) as {
  n: number; cohorts: Record<string, CohortSummary>;
};

const TOL = 0.005;
let checks = 0;
let misses = 0;

function cmp(key: string, path: string, a: number, b: number) {
  checks++;
  const d = Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b));
  if (d > TOL) {
    misses++;
    if (misses <= 12) console.log(`MISS ${key} ${path}: ts ${a} vs py ${b}`);
  }
}

for (const [key, py] of Object.entries(ref.cohorts)) {
  const [persona, first, stageKey, stayKey] = key.split("|");
  const stage = stageKey === "blended" ? null : (stageKey as Stage);
  const ts = summarize(runCohort(persona as Persona, first as Track3, P, ref.n, { stage, stay: stayKey === "stay" }), P.plinkoYears);
  for (const [k, v] of Object.entries(py.avg30)) cmp(key, `avg30.${k}`, ts.avg30[k as keyof typeof ts.avg30], v);
  for (const [k, v] of Object.entries(py.ltv)) cmp(key, `ltv.${k}`, ts.ltv[k as keyof typeof ts.ltv], v);
  for (const [k, v] of Object.entries(py.equity)) cmp(key, `equity.${k}`, ts.equity[k as keyof typeof ts.equity], v);
  for (const [k, v] of Object.entries(py.wealth)) cmp(key, `wealth.${k}`, ts.wealth[k as keyof typeof ts.wealth], v);
}

console.log(`${Object.keys(ref.cohorts).length} cohorts, ${checks} statistics, ${misses} outside ${TOL * 100}%`);
process.exit(misses ? 1 : 0);
