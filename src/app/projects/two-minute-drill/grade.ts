/**
 * Turning a win-probability loss into a verdict.
 *
 * Ported in spirit from the chess coach's `review.ts`, with centipawn loss
 * swapped for win-probability loss. The one addition is a "too close to call"
 * band, and it matters more here than it does in chess: these numbers come out
 * of a Monte Carlo search and carry a real standard error, so two options can
 * be separated by half a point of win probability and genuinely not be
 * distinguishable. Announcing a winner in that situation would be the
 * over-confidence that the fourth-down literature keeps complaining about.
 *
 * A choice is called a toss-up when its gap to the best option is inside two
 * standard errors of that gap.
 */

import type { Action, Evaluation } from "./engine/types";

export type Verdict = "best" | "toss" | "fine" | "costly" | "bad";

export const VERDICT_STYLE: Record<Verdict, { className: string; label: string }> = {
  best: { className: "tmd-verdict tmd-v-best", label: "best call" },
  toss: { className: "tmd-verdict tmd-v-toss", label: "too close to call" },
  fine: { className: "tmd-verdict tmd-v-fine", label: "reasonable" },
  costly: { className: "tmd-verdict tmd-v-costly", label: "costly" },
  bad: { className: "tmd-verdict tmd-v-bad", label: "big mistake" },
};

/**
 * How a verdict is drawn on the win-probability chart, and in its key.
 *
 * This is a *diverging* scale, not a categorical one: the verdicts are ordered
 * by what the call cost, from a green pole through a neutral middle to a red
 * one. So the middle is a light neutral, as a diverging midpoint should be, and
 * hue is never the only thing carrying the distinction —
 *
 *   - **size** grows with severity, so the expensive calls are the big marks;
 *   - **fill** separates the two that cost nothing: "reasonable" is solid,
 *     "too close to call" is hollow, which reads as *not counted* — and it is
 *     not counted, it contributes zero to the total.
 *
 * The palette was checked with the dataviz validator rather than by eye. The
 * three chromatic marks pass every check against a white surface (worst
 * adjacent pair amber/green, ΔE 11.7 protan; normal-vision floor 22.2). Across
 * *all* pairs the red/green poles sit at ΔE 6.6 for deuteranopia, which is the
 * classic confusion and is why size, fill and a labelled key are all present:
 * the two are also never adjacent in the ordering. The neutral was re-stepped
 * lighter — #6b7079 sat at ΔE 11.3 from the green even in normal vision, which
 * is a hard fail no amount of secondary encoding excuses.
 */
export interface VerdictMark {
  color: string;
  /** Radius in chart units; grows with what the call cost. */
  radius: number;
  /** Hollow marks are the ones that cost nothing. */
  hollow: boolean;
  label: string;
}

export const VERDICT_MARK: Record<Verdict, VerdictMark> = {
  best: { color: "#1f7a52", radius: 4, hollow: false, label: "Best call" },
  toss: { color: "#8b9098", radius: 4, hollow: true, label: "Too close to call" },
  fine: { color: "#8b9098", radius: 3, hollow: false, label: "Reasonable" },
  costly: { color: "#c4860f", radius: 5, hollow: false, label: "Costly" },
  bad: { color: "#a52121", radius: 6.5, hollow: false, label: "Big mistake" },
};

/** Key order: best to worst, so the legend reads as the scale it is. */
export const VERDICT_ORDER: Verdict[] = ["best", "toss", "fine", "costly", "bad"];

/** Loss thresholds in win probability points. */
const COSTLY = 0.03;
const BAD = 0.10;

export interface Graded {
  verdict: Verdict;
  loss: number;
  chosen: Evaluation | null;
  best: Evaluation | null;
}

export function grade(evals: Evaluation[], action: Action): Graded {
  if (!evals.length) return { verdict: "fine", loss: 0, chosen: null, best: null };
  const best = evals[0];
  const chosen = evals.find((e) => e.action === action) ?? null;
  if (!chosen) return { verdict: "fine", loss: 0, chosen: null, best };
  const loss = Math.max(0, best.wp - chosen.wp);
  if (chosen.action === best.action) return { verdict: "best", loss: 0, chosen, best };

  // Is the gap real, or is it search noise?
  const se = Math.sqrt(best.stderr ** 2 + chosen.stderr ** 2);
  if (loss <= 2 * se) return { verdict: "toss", loss, chosen, best };

  const verdict: Verdict = loss >= BAD ? "bad" : loss >= COSTLY ? "costly" : "fine";
  return { verdict, loss, chosen, best };
}

/** Summed win probability given away across a game. */
export function totalLoss(grades: Graded[]): number {
  return grades.reduce((sum, g) => sum + (g.verdict === "toss" ? 0 : g.loss), 0);
}

export function tally(grades: Graded[]): Record<Verdict, number> {
  const out: Record<Verdict, number> = { best: 0, toss: 0, fine: 0, costly: 0, bad: 0 };
  for (const g of grades) out[g.verdict] += 1;
  return out;
}
