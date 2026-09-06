/**
 * Cohort runs and summary statistics, mirroring projects/career-paths/simulate.py
 * so tie_out.mts can hold the browser engine to the Python reference numbers.
 */

import { avgFirst, ltv, simulate } from "./engine.ts";
import { mulberry32 } from "./rng.ts";
import type { Career, Params, Persona, Stage, Track3 } from "./types.ts";

export const SEED = 20260906;
export const PAYDAY = 100_000;

/** Deterministic seed per cohort; mirrored in simulate.py cohort_seed(). */
export function cohortSeed(persona: Persona, first: Track3, stage: Stage | null, stay: boolean): number {
  const key = `${persona}|${first}|${stage ?? "blended"}|${stay ? "stay" : "free"}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  return (SEED + h) >>> 0;
}

export function runCohort(
  persona: Persona, first: Track3, P: Params, n: number,
  opts: { stage?: Stage | null; stay?: boolean; seed?: number } = {},
): Career[] {
  const rng = mulberry32(opts.seed ?? cohortSeed(persona, first, opts.stage ?? null, opts.stay ?? false));
  const out: Career[] = [];
  for (let i = 0; i < n; i++) out.push(simulate(persona, first, P, rng, { stage: opts.stage ?? null, stay: opts.stay ?? false }));
  return out;
}

export function pct(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export function mean(xs: number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t / xs.length;
}

export interface CohortSummary {
  n: number;
  wealth: { median: number; p10: number; p90: number; retireMedian: number };
  avg30: { mean: number; median: number; p10: number; p90: number; over1M: number };
  ltv: { median: number; p10: number; p90: number };
  equity: { median: number; p90: number; anyPayday: number };
}

export function equityCash(b: Career): number {
  let t = 0;
  for (const e of b.events) if (e.kind === "exit" || e.kind === "tender") t += e.amount;
  return t;
}

export function summarize(balls: Career[], years: number): CohortSummary {
  const a = balls.map((b) => avgFirst(b, years));
  const l = balls.map(ltv);
  const eq = balls.map(equityCash);
  const w = balls.map((b) => b.wealthByYear[years - 1]);
  const r = balls.map((b) => { let s = 0; for (let i = 0; i < years; i++) s += b.retireByYear[i]; return s; });
  return {
    n: balls.length,
    wealth: { median: pct(w, 0.5), p10: pct(w, 0.1), p90: pct(w, 0.9), retireMedian: pct(r, 0.5) },
    avg30: { mean: mean(a), median: pct(a, 0.5), p10: pct(a, 0.1), p90: pct(a, 0.9), over1M: a.filter((x) => x >= 1_000_000).length },
    ltv: { median: pct(l, 0.5), p10: pct(l, 0.1), p90: pct(l, 0.9) },
    equity: { median: pct(eq, 0.5), p90: pct(eq, 0.9), anyPayday: eq.filter((x) => x >= PAYDAY).length },
  };
}
