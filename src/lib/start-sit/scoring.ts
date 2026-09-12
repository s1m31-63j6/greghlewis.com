/**
 * From market expectations to fantasy points.
 *
 * Every stat the market prices maps to one weight. Carries carry no points but
 * stay on the card as context. Touchdowns come in as a Poisson rate, so their
 * expected points are six times the rate. Missing stats contribute nothing and
 * are reported, never imputed.
 */

import type { Player, Scoring, StatKey } from "./types.ts";
import { STAT_LABEL, STAT_ORDER } from "./types.ts";

export type ComponentKey = StatKey | "td";

export function weights(s: Scoring): Record<ComponentKey, number> {
  return {
    pass_yds: 0.04,
    pass_tds: s.passTd,
    // -1, as the books score it: measured against their own fantasy-score
    // lines, -1 lands within 0.04 points on average and -2 does not.
    ints: -1,
    rush_yds: 0.1,
    rush_att: 0,
    rec: s.rec,
    rec_yds: 0.1,
    td: 6,
  };
}

export interface Component {
  key: ComponentKey;
  label: string;
  /** Expected stat value (touchdowns: the rate). */
  value: number;
  points: number;
  tier: "book" | "dfs";
  books: number;
}

export interface Breakdown {
  parts: Component[];
  mean: number;
  /** Stats the position is normally priced for that the market did not post. */
  missing: ComponentKey[];
}

export function components(p: Player, s: Scoring): Breakdown {
  const w = weights(s);
  const parts: Component[] = [];
  const missing: ComponentKey[] = [];
  for (const key of STAT_ORDER[p.pos]) {
    if (key === "td") {
      const td = p.stats.td;
      if (!td) { missing.push(key); continue; }
      parts.push({ key, label: STAT_LABEL.td, value: td.lambda, points: td.lambda * w.td,
        tier: td.tier, books: td.books });
      continue;
    }
    const line = p.stats[key];
    if (!line) {
      // Rushing yards for a receiver are optional context, not a gap.
      if (!(p.pos === "WR" && key === "rush_yds")) missing.push(key);
      continue;
    }
    parts.push({ key, label: STAT_LABEL[key], value: line.ev, points: line.ev * w[key],
      tier: line.tier, books: line.books });
  }
  const mean = parts.reduce((sum, c) => sum + c.points, 0);
  return { parts, mean, missing };
}

/** Does this player carry any priced stat at all. */
export function isPriced(p: Player): boolean {
  return Object.keys(p.stats).length > 0;
}
