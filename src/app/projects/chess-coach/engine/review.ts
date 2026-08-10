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
  /** Which side made this move. */
  mover: "w" | "b";
  /** Whether this move gets a verdict. In two-player mode, every move does. */
  judged: boolean;
  /** Kept for the coach board, where only the human's moves are judged. */
  byPlayer: boolean;
  /** Win %, in the perspective colour's frame. */
  winBefore: number;
  winAfter: number;
  /** The same pair in the *mover's* frame — what this player's chances did.
   *  Two humans want "Ada's move cost Ada 14 points", not the change to White. */
  moverWinBefore: number;
  moverWinAfter: number;
  /** Change in the perspective colour's chances. */
  swing: number;
  /** Change in the mover's own chances. Negative means they gave ground. */
  moverSwing: number;
  /** The engine's preference in the position before the move. */
  bestSan: string | null;
  verdict: Verdict;
  note: string;
};

export type ReviewProgress = { done: number; total: number };

export type ReviewOptions = {
  /** Whose frame the perspective percentages are quoted in. */
  perspective: "w" | "b";
  /**
   * Display names for both sides. Supplying them switches on two-player mode:
   * every move is judged, and narration stops calling one side "the coach".
   */
  names?: { w: string; b: string };
};

/** Win-percentage loss thresholds. Roughly the bands Lichess uses. */
function classify(loss: number, playedWasBest: boolean): Verdict {
  // "Played the top move" normally implies no loss, since the position's
  // evaluation already assumes best play. The two come from separate searches
  // though, so instability can leave a gap — and a move badged "Best move"
  // sitting beside a double-digit drop reads as a bug to anyone looking at it.
  // Trust the measured loss over the label when they disagree.
  if (playedWasBest && loss < 10) return "best";
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
  judged: boolean,
  fenAfter: string,
  replySan: string | null,
): string {
  if (!judged) {
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
  options: ReviewOptions,
  onProgress?: (progress: ReviewProgress) => void,
): Promise<MoveReview[]> {
  const { perspective, names } = options;
  const twoPlayer = Boolean(names);
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
    const byPlayer = mover === perspective;
    // With two humans there is no "opponent" whose moves go unexamined — the
    // point is for both of them to see where their own game turned.
    const judged = twoPlayer || byPlayer;

    // Quote everything in the mover's frame so "you lost 14 points" is true for
    // whoever made the move, then present in the player's frame for display.
    const winBeforeMover = winProbabilityFor(evals[i], mover);
    const winAfterMover = winProbabilityFor(evals[i + 1], mover);
    const loss = winBeforeMover - winAfterMover;

    const winBefore = winProbabilityFor(evals[i], perspective);
    const winAfter = winProbabilityFor(evals[i + 1], perspective);

    const bestSan = bests[i];
    const playedWasBest = bestSan === history[i];
    const verdict = classify(loss, playedWasBest);

    reviews.push({
      ply: i + 1,
      san: history[i],
      fenBefore: positions[i],
      fenAfter: positions[i + 1],
      mover,
      judged,
      byPlayer,
      winBefore,
      winAfter,
      moverWinBefore: winBeforeMover,
      moverWinAfter: winAfterMover,
      swing: winAfter - winBefore,
      moverSwing: winAfterMover - winBeforeMover,
      bestSan,
      verdict,
      note: narrate(
        verdict,
        history[i],
        twoPlayer ? winBeforeMover : winBefore,
        twoPlayer ? winAfterMover : winAfter,
        judged,
        positions[i + 1],
        bests[i + 1],
      ),
    });
  }

  return reviews;
}
