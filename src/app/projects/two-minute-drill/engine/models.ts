/**
 * The fitted models, in the form the rollout loop wants them.
 *
 * Port of the `Models` class in `projects/two-minute-drill/engine.py`. The
 * lookup order in `tendency` and `runoffSeconds` is load-bearing and has to
 * match the Python exactly, because a different fallback picks a different
 * distribution and the parity test compares decisions, not vibes.
 */

import { diffBand, timeBand, yardlineBand, ytgBand } from "./buckets";
import type {
  Calibration,
  Distributions,
  GameState,
  PmfBlob,
  TendencyLevel,
  Tendencies,
  TendencySpec,
} from "./types";
import type { Rng } from "./rng";

/** Inverse-CDF sample over a small integer support. */
export function draw(pmf: PmfBlob, u: number): number {
  const { v, c } = pmf;
  // Binary search rather than a linear scan: the engine draws a few million
  // times per search and these supports run to ~90 entries.
  let lo = 0;
  let hi = c.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c[mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return v[Math.min(lo, v.length - 1)];
}

export class Models {
  readonly d: Distributions;
  readonly t: Tendencies;
  readonly season: number;
  readonly seasons: number[];
  private readonly fgCurve: number[];
  private readonly fgLo: number;
  private readonly fgHi: number;
  private readonly calib: Calibration | null;

  constructor(d: Distributions, t: Tendencies, season: number, calib: Calibration | null) {
    this.d = d;
    this.t = t;
    this.fgLo = d.field_goal.grid_lo;
    this.fgHi = d.field_goal.grid_hi;
    // The kicking model is a season-by-distance surface, so picking a season
    // picks a row. Nothing else in the engine moves with it: choosing 2003 asks
    // what this decision looks like if only the kicking were that of 2003.
    this.seasons = Object.keys(d.field_goal.make_by_season).map(Number).sort((a, b) => a - b);
    const chosen = Math.min(Math.max(season, this.seasons[0]), this.seasons[this.seasons.length - 1]);
    this.season = chosen;
    this.fgCurve = d.field_goal.make_by_season[String(chosen)];
    this.calib = calib;
  }

  withSeason(season: number): Models {
    return new Models(this.d, this.t, season, this.calib);
  }

  fgMake(distance: number): number {
    if (distance < this.fgLo) return this.fgCurve[0];
    if (distance > this.fgHi) return 0;
    return this.fgCurve[distance - this.fgLo];
  }

  /**
   * Monotone recalibration of a raw rollout frequency. See calibrate.py: the
   * simulator orders decisions well but is too pessimistic about trailing
   * teams, and this corrects the level without reordering anything.
   */
  calibrate(p: number): number {
    if (!this.calib) return p;
    const { grid, curve } = this.calib;
    if (p <= grid[0]) return curve[0];
    if (p >= grid[grid.length - 1]) return curve[curve.length - 1];
    let i = 1;
    while (i < grid.length && grid[i] < p) i += 1;
    const t = (p - grid[i - 1]) / (grid[i] - grid[i - 1]);
    return curve[i - 1] + t * (curve[i] - curve[i - 1]);
  }

  runoffSeconds(
    klass: string,
    u: number,
    afterTimeout: boolean,
    urgency: string,
    tband: string,
  ): number {
    const entry = this.d.runoff[klass] ?? this.d.runoff["run_inbounds"];
    if (afterTimeout && entry["after_timeout"]) return draw(entry["after_timeout"], u);
    const pmf = entry[`${urgency}_${tband}`] ?? entry[urgency] ?? entry["normal"];
    return draw(pmf, u);
  }

  /** Walk a decision's specificity levels, coarsest last. */
  tendency(decision: keyof Tendencies, s: GameState): Record<string, number> {
    const spec = this.t[decision] as TendencySpec;
    const fields: Record<string, string> = {
      time_b: timeBand(s.seconds),
      diff_b: diffBand(s.diff),
      ytg_b: ytgBand(s.ydstogo),
      yl_b: yardlineBand(s.yardline),
      down_s: String(s.down),
      exact: String(Math.max(-16, Math.min(16, s.diff))),
    };
    for (let i = 0; spec[`L${i}`] !== undefined; i += 1) {
      const level = spec[`L${i}`] as TendencyLevel;
      const key = level.by.map((c) => fields[c]).join("|");
      const hit = level.table[key];
      if (hit) return hit.p;
    }
    return (spec["global"] as { p: Record<string, number> }).p;
  }
}

/** Sample a named choice from a probability map. */
export function pick(probs: Record<string, number>, u: number): string {
  let acc = 0;
  let last = "run";
  for (const [name, p] of Object.entries(probs)) {
    acc += p;
    last = name;
    if (u < acc) return name;
  }
  return last;
}

export interface ModelBundle {
  distributions: Distributions;
  tendencies: Tendencies;
  calibration: Calibration | null;
}

export async function fetchModels(
  base = "/two-minute-drill",
  signal?: AbortSignal,
): Promise<ModelBundle> {
  const get = async (name: string) => {
    const res = await fetch(`${base}/${name}`, { signal });
    if (!res.ok) throw new Error(`could not load ${name}: ${res.status}`);
    return res.json();
  };
  const [distributions, tendencies, calibration] = await Promise.all([
    get("distributions.json"),
    get("tendencies.json"),
    get("calibration.json"),
  ]);
  return { distributions, tendencies, calibration };
}

export function buildModels(bundle: ModelBundle, season = 2025): Models {
  return new Models(bundle.distributions, bundle.tendencies, season, bundle.calibration);
}

export type { Rng };
