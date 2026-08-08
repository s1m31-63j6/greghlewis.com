"use client";

import { Chess } from "chess.js";

import type { StockfishEngine } from "./uci";
import { winProbabilityFor } from "./winProbability";

/**
 * Post-game review: walk the moves, score each one, and say what happened.
 *
 * The central trick is that one analysis per *position* is enough for both
 * halves of the story. A position's evaluation already assumes best play from
 * there, so it doubles as "what your chances would have been had you found the
 * best move". The move you actually played is then judged by the evaluation of
 * the position it produced. So for a game of N moves we need N+1 analyses, not
 * 2N — which is the difference between a review that takes a few seconds and one
 * nobody waits for.
 */

/** Search depth for review. Deeper than the coach plays, so the verdict is fair. */
const REVIEW_DEPTH = 14;

export type Verdict = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export type MoveReview = {
  /** 1-based half-move number. */
  ply: number;
  san: string;
  /** Position before this move — what the board shows when reviewing it. */
  fenBefore: string;
  fenAfter: string;
  /** Was this the human's move? Coach moves are shown but not judged. */
  byPlayer: boolean;
  /** Player-frame win %, before and after. */
  winBefore: number;
  winAfter: number;
  /** How much the mover's own chances moved. Negative is a loss. */
  swing: number;
  /** The engine's preference in the position before the move. */
  bestSan: string | null;
  verdict: Verdict;
  note: string;
};

export type ReviewProgress = { done: number; total: number };

/** Win-percentage loss thresholds. Roughly the bands Lichess uses. */
function classify(loss: number, playedWasBest: boolean): Verdict {
  if (playedWasBest) return "best";
  if (loss >= 20) return "blunder";
  if (loss >= 10) return "mistake";
  if (loss >= 5) return "inaccuracy";
  return "good";
}

export const VERDICT_STYLE: Record<Verdict, { label: string; icon: string; colour: string }> = {
  best: { label: "Best move", icon: "★", colour: "#1CB0F6" },
  good: { label: "Good", icon: "✓", colour: "#58CC02" },
  inaccuracy: { label: "Inaccuracy", icon: "?!", colour: "#FFC800" },
  mistake: { label: "Mistake", icon: "?", colour: "#FF9600" },
  blunder: { label: "Blunder", icon: "??", colour: "#FF4B4B" },
};

const PIECE_NAME: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/**
 * Why the move cost something, when we can tell cheaply and confidently.
 *
 * Only claims a reason it can actually see: that the reply is a capture, or that
 * the position is now losing to a forced mate. Anything vaguer would be
 * plausible-sounding narration that might simply be wrong, which is worse than
 * saying nothing.
 */
function reason(fenAfter: string, replySan: string | null): string {
  if (!replySan) return "";
  const board = new Chess(fenAfter);
  const move = board.moves({ verbose: true }).find((m) => m.san === replySan);
  if (!move) return "";
  if (move.captured) {
    return ` It lets the coach play ${replySan}, taking your ${PIECE_NAME[move.captured]} on ${move.to}.`;
  }
  if (replySan.includes("#")) return ` It allows ${replySan}, which is mate.`;
  return "";
}

/**
 * The prose half of a move's review.
 *
 * Deliberately carries **no percentages**. The numbers are shown beside the
 * verdict badge instead, where they can be read at a glance and compared
 * between moves; repeating them inside the sentence made every note read like a
 * spreadsheet and buried the part that actually explains anything.
 */
function narrate(
  verdict: Verdict,
  san: string,
  winBefore: number,
  winAfter: number,
  byPlayer: boolean,
  fenAfter: string,
  replySan: string | null,
): string {
  if (!byPlayer) {
    const swing = winAfter - winBefore;
    if (swing > 4) return `The coach played ${san} — that one helps you.`;
    if (swing < -4) return `The coach played ${san}, and it puts you under pressure.`;
    return `The coach played ${san}. Nothing much changes.`;
  }

  if (verdict === "best") return `${san} — exactly the engine's choice.`;
  if (verdict === "good") return `${san} keeps you on track.`;

  // Qualitative only — the magnitude is on the badge beside it.
  const opening =
    verdict === "inaccuracy"
      ? `${san} is a little loose.`
      : verdict === "mistake"
        ? `${san} is a real error.`
        : `${san} is a costly slip.`;

  return `${opening}${reason(fenAfter, replySan)}`;
}

/**
 * Analyse a finished game.
 *
 * `history` is the SAN move list; `playerColour` decides whose frame the
 * percentages are quoted in and which moves get judged.
 */
export async function reviewGame(
  engine: StockfishEngine,
  history: string[],
  playerColour: "w" | "b",
  onProgress?: (progress: ReviewProgress) => void,
): Promise<MoveReview[]> {
  const board = new Chess();

  // Every position the game passed through, plus the final one.
  const positions: string[] = [board.fen()];
  for (const san of history) {
    board.move(san);
    positions.push(board.fen());
  }

  const total = positions.length;
  const evals: number[] = [];
  const bests: (string | null)[] = [];

  for (let i = 0; i < positions.length; i++) {
    const fen = positions[i];
    const position = new Chess(fen);

    if (position.isGameOver()) {
      // A finished game has no move to search. Score it directly, or the
      // engine's empty reply would read as 0 centipawns — a dead-drawn 50%
      // shown at the exact moment someone was checkmated.
      const decisive = position.isCheckmate();
      const loser = position.turn();
      evals.push(decisive ? (loser === "w" ? -100000 : 100000) : 0);
      bests.push(null);
    } else {
      const candidates = await engine.analyse(fen, REVIEW_DEPTH, 1);
      const top = candidates[0];
      // UCI scores are side-to-move relative; the review quotes everything in
      // White's frame and converts per-mover later.
      evals.push(top ? (fen.split(" ")[1] === "b" ? -top.cp : top.cp) : 0);

      // `top.move` is UCI ("g1f3"), which chess.js `move()` will not parse as
      // SAN — it has to be given the from/to form, and it returns the SAN.
      let bestSan: string | null = null;
      if (top) {
        try {
          bestSan = position.move({
            from: top.move.slice(0, 2),
            to: top.move.slice(2, 4),
            promotion: top.move.length > 4 ? top.move[4] : undefined,
          }).san;
        } catch {
          bestSan = null;
        }
      }
      bests.push(bestSan);
    }
    onProgress?.({ done: i + 1, total });
  }

  const reviews: MoveReview[] = [];
  for (let i = 0; i < history.length; i++) {
    const before = new Chess(positions[i]);
    const mover = before.turn();
    const byPlayer = mover === playerColour;

    // Quote everything in the mover's frame so "you lost 14 points" is true for
    // whoever made the move, then present in the player's frame for display.
    const winBeforeMover = winProbabilityFor(evals[i], mover);
    const winAfterMover = winProbabilityFor(evals[i + 1], mover);
    const loss = winBeforeMover - winAfterMover;

    const winBefore = winProbabilityFor(evals[i], playerColour);
    const winAfter = winProbabilityFor(evals[i + 1], playerColour);

    const bestSan = bests[i];
    const playedWasBest = bestSan === history[i];
    const verdict = classify(loss, playedWasBest);

    reviews.push({
      ply: i + 1,
      san: history[i],
      fenBefore: positions[i],
      fenAfter: positions[i + 1],
      byPlayer,
      winBefore,
      winAfter,
      swing: winAfter - winBefore,
      bestSan,
      verdict,
      note: narrate(
        verdict,
        history[i],
        winBefore,
        winAfter,
        byPlayer,
        positions[i + 1],
        bests[i + 1],
      ),
    });
  }

  return reviews;
}
