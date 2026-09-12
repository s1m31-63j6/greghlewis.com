/**
 * The band around a projection.
 *
 * A single expected value hides what a start/sit question is really about:
 * whether the safer player's floor beats the riskier player's median. So each
 * selected player is simulated as one game, a few thousand times, with the same
 * spread the expected value was derived from:
 *
 *   yards              gamma with mean ev and sd — never negative, right-skewed
 *   receptions, carries normal(ev, sd), rounded, floored at zero
 *   passing TDs, INTs  Poisson(ev)   — small counts, and a normal would put
 *                                      real mass below zero
 *   touchdowns         Poisson(lambda)
 *
 * The draws are shared across players, so P(A beats B) is read straight off
 * them. Nothing is correlated between players in this version: two receivers
 * on the same team are drawn independently, which slightly overstates how
 * often one beats the other.
 *
 * Rounding and flooring the counts nudges their simulated mean a little above
 * the expectation for very low lines. The gate in results/simulate.mts bounds
 * that gap.
 */

import { gamma, mulberry32, normal, poisson } from "./rng.ts";
import { weights } from "./scoring.ts";
import type { Player, Scoring, StatKey } from "./types.ts";

const POISSON_STATS = new Set<StatKey>(["pass_tds", "ints"]);
const COUNT_STATS = new Set<StatKey>(["rec", "rush_att"]);
const YARD_STATS = new Set<StatKey>(["pass_yds", "rush_yds", "rec_yds"]);

export interface SimResult {
  id: string;
  mean: number;
  p20: number;
  p50: number;
  p80: number;
  draws: Float32Array;
}

export interface Simulation {
  results: SimResult[];
  /** pWin[i][j] = P(player i outscores player j). */
  pWin: number[][];
  draws: number;
}

export function simulate(
  players: Player[],
  scoring: Scoring,
  { draws = 5000, seed = 20260913 }: { draws?: number; seed?: number } = {},
): Simulation {
  const w = weights(scoring);
  const results: SimResult[] = players.map((p, idx) => {
    // One stream per player, seeded from the player's index so adding a
    // fourth player does not change the first three's draws.
    const rng = mulberry32(seed + idx * 7919);
    const out = new Float32Array(draws);
    const lines = Object.entries(p.stats).filter(([k]) => k !== "td") as [StatKey, { ev: number; sd: number }][];
    const td = p.stats.td;
    for (let d = 0; d < draws; d++) {
      let pts = 0;
      for (const [key, s] of lines) {
        let v: number;
        if (POISSON_STATS.has(key)) v = poisson(rng, s.ev);
        else if (YARD_STATS.has(key)) {
          // shape = mean²/var, scale = var/mean reproduce the mean and sd.
          v = s.ev <= 0 ? 0 : gamma(rng, (s.ev * s.ev) / (s.sd * s.sd), (s.sd * s.sd) / s.ev);
        } else {
          v = Math.max(0, s.ev + s.sd * normal(rng));
          if (COUNT_STATS.has(key)) v = Math.round(v);
        }
        pts += v * w[key];
      }
      if (td) pts += poisson(rng, td.lambda) * w.td;
      out[d] = pts;
    }
    const sorted = Float32Array.from(out).sort();
    const q = (f: number) => sorted[Math.min(draws - 1, Math.floor(f * draws))];
    let sum = 0;
    for (let d = 0; d < draws; d++) sum += out[d];
    return { id: p.id, mean: sum / draws, p20: q(0.2), p50: q(0.5), p80: q(0.8), draws: out };
  });

  const n = players.length;
  const pWin: number[][] = Array.from({ length: n }, () => Array(n).fill(0.5));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let wins = 0;
      let ties = 0;
      const a = results[i].draws;
      const b = results[j].draws;
      for (let d = 0; d < draws; d++) {
        if (a[d] > b[d]) wins++;
        else if (a[d] === b[d]) ties++;
      }
      const p = (wins + ties / 2) / draws;
      pWin[i][j] = p;
      pWin[j][i] = 1 - p;
    }
  }
  return { results, pWin, draws };
}
