/**
 * Move-selection policy for the difficulty dial — browser port.
 *
 * ⚠️ This is a port of `projects/chess-coach/weakening.py` and must stay
 * behaviourally identical to it. The calibration harness measured the *Python*
 * implementation; `ladder.json` maps a target Elo onto parameters that produced
 * that strength **there**. If the two drift apart, every Elo label on the dial
 * silently becomes a lie — the numbers would still render, they would just no
 * longer describe what the engine does.
 *
 * If you change the sampling logic here, re-run the calibration. See
 * `projects/chess-coach/README.md`.
 *
 * Why any of this exists: Stockfish's own `UCI_Elo` bottoms out at 1320, so the
 * entire bottom half of a 600-2200 dial is unreachable with the built-in
 * weakening, and `Skill Level` weakens by inserting occasional catastrophic
 * blunders into otherwise near-perfect play — weaker, but not remotely human.
 */

import type { ScoredMove } from "./uci";

/**
 * Fallback analysis width. The real value comes from `ladder.json` (`multipv`),
 * because the policy was *measured* at a particular width and analysing at a
 * different one would quietly change how the dial plays. Duplicating the
 * constant here and in Python is exactly how that drifts, so the ladder owns it.
 */
export const DEFAULT_MULTIPV = 12;

export type Params = {
  depth: number;
  band_cp: number;
  temperature_cp: number;
  blunder_rate: number;
};

export type Rung = {
  /** The Elo this rung is calibrated to. */
  label: number;
  /** Strength scalar in [0, 1] that measured as `label` Elo. */
  s: number;
  params: Params;
  /** Half-width of the 95% interval on the measurement, in Elo. */
  ci95: number;
};

export type Ladder = {
  games: number;
  /** Analysis width the policy was calibrated at. */
  multipv?: number;
  rungs: Rung[];
  curve: { s: number; elo: number; se: number; id: string }[];
  anchors: Record<string, { nominal: number; measured: number; residual: number }>;
};

/** Weighted choice over `items`; `weights` need not be normalised. */
function sample<T>(items: T[], weights: number[], random: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return items[0];
  let r = random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Pick a move for a player at the given strength, from a MultiPV analysis.
 *
 * `candidates` must be sorted best-first with centipawns relative to the side to
 * move — which is what `StockfishEngine.analyse` returns.
 */
export function selectMove(
  candidates: ScoredMove[],
  params: Params,
  random: () => number = Math.random,
): string | null {
  if (candidates.length === 0) return null;

  const bestCp = candidates[0].cp;

  // Blunder branch: ignore the band and pick from the moves this player should
  // have rejected, weighted toward the least-bad of them. Even a blundering
  // human is usually not choosing the single worst move on the board — they are
  // missing one specific idea.
  if (random() < params.blunder_rate) {
    const outside = candidates.filter((c) => c.cp < bestCp - params.band_cp);
    if (outside.length > 0) {
      const weights = outside.map((_, i) => 1 / (i + 1));
      return sample(outside, weights, random).move;
    }
  }

  // Normal branch: softmax over everything inside the band. A move `d`
  // centipawns worse than best is exp(-d / temperature) times as likely, so the
  // temperature is literally "how many centipawns of error this player cannot
  // perceive".
  const inside = candidates.filter((c) => c.cp >= bestCp - params.band_cp);
  if (inside.length === 0) return candidates[0].move;

  const temperature = Math.max(params.temperature_cp, 1);
  const weights = inside.map((c) => Math.exp(-(bestCp - c.cp) / temperature));
  return sample(inside, weights, random).move;
}
