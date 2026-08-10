"use client";

import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bootEngine, type BootProgress } from "../engine/boot";
import type { StockfishEngine } from "../engine/uci";
import { winProbability } from "../engine/winProbability";
import { reviewGame, type MoveReview, type ReviewProgress } from "../engine/review";
import type { TrendPoint } from "../WinTrend";

/**
 * Two people at one board.
 *
 * Turn order is enforced, unlike the analysis board — this is a real game, and
 * the whole point is that each player only gets to move their own pieces.
 *
 * The engine is here purely to draw the odds line. It never suggests a move,
 * which would take the game away from the people playing it. Everything else on
 * screen — legal-move dots, square control, captured material — teaches how
 * chess works rather than what to play, which is the distinction that makes this
 * usable with someone who is still learning.
 */

const START_FEN = new Chess().fen();

export type Outcome = { winner: "white" | "black" | null; reason: string };

function readOutcome(game: Chess): Outcome | null {
  if (!game.isGameOver()) return null;
  if (game.isCheckmate()) {
    return { winner: game.turn() === "w" ? "black" : "white", reason: "checkmate" };
  }
  if (game.isStalemate()) return { winner: null, reason: "stalemate" };
  if (game.isInsufficientMaterial()) return { winner: null, reason: "not enough pieces left" };
  if (game.isThreefoldRepetition()) return { winner: null, reason: "the same position three times" };
  return { winner: null, reason: "the fifty-move rule" };
}

export function useTwoPlayerGame() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const bootRef = useRef<Promise<StockfishEngine> | null>(null);

  const [moves, setMoves] = useState<string[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([{ ply: 0, winPct: 50 }]);
  const [boot, setBoot] = useState<BootProgress | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [review, setReview] = useState<MoveReview[] | null>(null);
  const [reviewProgress, setReviewProgress] = useState<ReviewProgress | null>(null);

  const board = useMemo(() => {
    const game = new Chess();
    for (const san of moves) {
      try {
        game.move(san);
      } catch {
        break;
      }
    }
    return game;
  }, [moves]);

  const fen = board.fen();
  const turn = board.turn();
  const outcome = useMemo(() => readOutcome(board), [board]);

  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
      bootRef.current = null;
    };
  }, []);

  /** One shared boot, cleared on both paths — see useCoachGame for the full story. */
  const ensureEngine = useCallback((): Promise<StockfishEngine> => {
    if (engineRef.current) return Promise.resolve(engineRef.current);
    if (!bootRef.current) {
      bootRef.current = bootEngine(setBoot)
        .then((engine) => {
          engineRef.current = engine;
          setBoot(null);
          return engine;
        })
        .catch((cause) => {
          bootRef.current = null;
          setBoot(null);
          throw cause;
        });
    }
    return bootRef.current;
  }, []);

  // Keep the odds line in step with the board, including after a takeback.
  // Deriving it from `moves` rather than appending on each move means undo needs
  // no special handling: the effect simply re-runs for the shorter game.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const position = new Chess(fen);

      if (position.isGameOver()) {
        // A finished game has no move to search, so the engine would report 0
        // centipawns — a dead-even 50% at the moment someone was checkmated.
        const decided = position.isCheckmate();
        const whitePct = decided ? (position.turn() === "w" ? 0 : 100) : 50;
        if (!cancelled) {
          setTrend((previous) => [
            ...previous.filter((point) => point.ply < moves.length),
            { ply: moves.length, winPct: whitePct },
          ]);
        }
        return;
      }

      try {
        const engine = await ensureEngine();
        if (cancelled) return;
        const cp = await engine.evaluate(fen);
        if (cancelled) return;
        setTrend((previous) => [
          ...previous.filter((point) => point.ply < moves.length),
          { ply: moves.length, winPct: winProbability(cp) },
        ]);
      } catch {
        // A missing data point should cost a dot on a chart, not the game.
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [ensureEngine, fen, moves.length]);

  /** Play a move for whoever is to move. Returns false if it is not legal. */
  const move = useCallback(
    (from: string, to: string): boolean => {
      if (outcome) return false;
      const probe = new Chess(fen);
      let san: string;
      try {
        san = probe.move({ from, to, promotion: "q" }).san;
      } catch {
        return false;
      }
      setMoves((current) => [...current, san]);
      setHeld(null);
      return true;
    },
    [fen, outcome],
  );

  /**
   * Go back over the finished game, judging *both* players' moves and showing
   * what each of them could have played instead — the "why" that makes a loss
   * worth something.
   */
  const runReview = useCallback(
    async (names: { w: string; b: string }) => {
      if (moves.length === 0) return;
      setReviewProgress({ done: 0, total: moves.length + 1 });
      try {
        const engine = await ensureEngine();
        const result = await reviewGame(
          engine,
          moves,
          { perspective: "w", names },
          setReviewProgress,
        );
        setReview(result);
      } catch {
        // Leaving the review unavailable is better than breaking the board.
      } finally {
        setReviewProgress(null);
      }
    },
    [ensureEngine, moves],
  );

  /** Take back the last move. Indispensable when playing with a beginner. */
  const takeBack = useCallback(() => {
    setMoves((current) => current.slice(0, -1));
    setHeld(null);
    // A review of a game that no longer exists would be worse than none.
    setReview(null);
  }, []);

  const reset = useCallback(() => {
    setMoves([]);
    setTrend([{ ply: 0, winPct: 50 }]);
    setHeld(null);
    setReview(null);
    setReviewProgress(null);
  }, []);

  return {
    board,
    fen: fen === START_FEN ? START_FEN : fen,
    moves,
    turn,
    outcome,
    trend,
    boot,
    held,
    setHeld,
    move,
    takeBack,
    reset,
    review,
    reviewProgress,
    runReview,
  };
}
