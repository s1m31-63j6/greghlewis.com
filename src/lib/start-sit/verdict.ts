/**
 * Who to start, and when the honest answer is "either".
 *
 * Mirrors `optimal()` in the two-minute drill: the highest expected total is
 * always named, and every rival whose gap is inside the noise is marked "too
 * close to call" beside it. The noise here is the disagreement between books
 * about each line, carried through the scoring weights. With a single source
 * there is no disagreement to measure, so each stat gets a floor instead —
 * roughly how far a line moves in a normal week.
 *
 * Players the market has not priced are excluded from the verdict and listed,
 * rather than ranked last as if zero were a projection.
 */

import { components, isPriced, weights } from "./scoring.ts";
import type { ComponentKey } from "./scoring.ts";
import type { Player, Scoring } from "./types.ts";

/** Gap must exceed this many combined standard errors to call a winner. */
export const K_SE = 2;
/** And never call a winner over less than a point. */
export const MIN_GAP = 1.0;
/** Uncertainty of a stat's expectation with one source, in stat units. */
export const SE_FLOOR: Record<ComponentKey, number> = {
  pass_yds: 8, pass_tds: 0.15, ints: 0.1, rush_yds: 4, rush_att: 0.6,
  rec: 0.3, rec_yds: 4, td: 0.05,
};

export interface Ranked {
  id: string;
  mean: number;
  /** Standard error of the mean, in points. */
  u: number;
  partial: boolean;
}

export interface Verdict {
  best: string | null;
  tied: string[];
  ranked: Ranked[];
  excluded: string[];
  /** The winner or a tied player carries incomplete pricing. */
  partial: boolean;
}

export function uncertainty(p: Player, s: Scoring): number {
  const w = weights(s);
  let v = 0;
  for (const [key, line] of Object.entries(p.stats)) {
    const k = key as ComponentKey;
    const se = k === "td" ? SE_FLOOR.td : ("se" in line && line.se != null && line.books >= 3 ? line.se : SE_FLOOR[k]);
    v += (w[k] * se) ** 2;
  }
  return Math.sqrt(v);
}

export function verdict(players: Player[], s: Scoring): Verdict {
  const priced = players.filter(isPriced);
  const excluded = players.filter((p) => !isPriced(p)).map((p) => p.id);
  const ranked: Ranked[] = priced
    .map((p) => ({
      id: p.id,
      mean: components(p, s).mean,
      u: uncertainty(p, s),
      partial: p.coverage !== "full",
    }))
    .sort((a, b) => b.mean - a.mean);
  if (!ranked.length) return { best: null, tied: [], ranked, excluded, partial: false };
  const top = ranked[0];
  const tied = ranked.slice(1).filter((r) => {
    const gap = top.mean - r.mean;
    return gap < MIN_GAP || gap <= K_SE * Math.sqrt(top.u ** 2 + r.u ** 2);
  }).map((r) => r.id);
  const partial = top.partial || ranked.some((r) => tied.includes(r.id) && r.partial);
  return { best: top.id, tied, ranked, excluded, partial };
}

/** The one component that separates two players the most, in points. */
export function explain(a: Player, b: Player, s: Scoring): { key: ComponentKey; label: string; diff: number } | null {
  const pa = new Map(components(a, s).parts.map((c) => [c.key, c]));
  const pb = new Map(components(b, s).parts.map((c) => [c.key, c]));
  let best: { key: ComponentKey; label: string; diff: number } | null = null;
  for (const key of new Set([...pa.keys(), ...pb.keys()])) {
    const diff = (pa.get(key)?.points ?? 0) - (pb.get(key)?.points ?? 0);
    const label = pa.get(key)?.label ?? pb.get(key)?.label ?? key;
    if (!best || Math.abs(diff) > Math.abs(best.diff)) best = { key, label, diff };
  }
  return best;
}
