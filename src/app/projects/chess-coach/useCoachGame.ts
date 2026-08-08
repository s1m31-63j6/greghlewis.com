"use client";

import { Chess } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_MULTIPV, selectMove, type Ladder, type Rung } from "./engine/weakening";
import { StockfishEngine } from "./engine/uci";
import { winProbabilityFor } from "./engine/winProbability";
import { reviewGame, type MoveReview, type ReviewProgress } from "./engine/review";
import type { TrendPoint } from "./WinTrend";

export type Phase =
  | "idle" // ladder loaded, no game started
  | "loading" // fetching the 7 MB engine
  | "playing"
  | "thinking" // coach is choosing
  | "over";

export type Outcome = {
  result: "win" | "loss" | "draw";
  reason: string;
};

/** Standard opening position. Computed once at module load so the initial state
 * does not have to read a ref during render. */
const START_FEN = new Chess().fen();

/** Read the outcome of a finished position, or null if it is still live. */
function readOutcome(game: Chess, playerColor: "w" | "b"): Outcome | null {
  if (!game.isGameOver()) return null;
  if (game.isCheckmate()) {
    // The side to move is the one that got mated.
    const loser = game.turn();
    return {
      result: loser === playerColor ? "loss" : "win",
      reason: "checkmate",
    };
  }
  if (game.isStalemate()) return { result: "draw", reason: "stalemate" };
  if (game.isInsufficientMaterial()) return { result: "draw", reason: "insufficient material" };
  if (game.isThreefoldRepetition()) return { result: "draw", reason: "threefold repetition" };
  return { result: "draw", reason: "fifty-move rule" };
}

export function useCoachGame(ladder: Ladder | null) {
  const gameRef = useRef(new Chess());
  const engineRef = useRef<StockfishEngine | null>(null);

  const [fen, setFen] = useState(START_FEN);
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [rungIndex, setRungIndex] = useState(3);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [heldPiece, setHeldPiece] = useState<string | null>(null);
  const [review, setReview] = useState<MoveReview[] | null>(null);
  const [reviewProgress, setReviewProgress] = useState<ReviewProgress | null>(null);

  const rung: Rung | null = ladder?.rungs[rungIndex] ?? null;

  // Tear the worker down on unmount — a 7 MB WASM instance should not outlive
  // the page that created it.
  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  const sync = useCallback(() => {
    const game = gameRef.current;
    setFen(game.fen());
    setHistory(game.history());
    const done = readOutcome(game, playerColor);
    if (done) {
      setOutcome(done);
      setPhase("over");
      return true;
    }
    return false;
  }, [playerColor]);

  /** Boot the engine on demand. 7 MB is not something to load speculatively. */
  const ensureEngine = useCallback(async (): Promise<StockfishEngine> => {
    if (engineRef.current) return engineRef.current;
    setPhase("loading");
    const engine = new StockfishEngine();
    await engine.waitUntilReady();
    engineRef.current = engine;
    return engine;
  }, []);

  /** Append an objective win-probability reading for the current position. */
  const recordEval = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const game = gameRef.current;

    // A finished game has no legal move to search, so the engine returns
    // nothing and `evaluate` falls back to 0 centipawns — which renders as a
    // dead-even 50% at the exact moment someone was checkmated. Score terminal
    // positions directly instead.
    if (game.isGameOver()) {
      const terminal = game.isCheckmate()
        ? game.turn() === playerColor
          ? 0 // the side to move is the one that got mated
          : 100
        : 50; // stalemate and the other draws really are 50/50
      setTrend((previous) => [...previous, { ply: game.history().length, winPct: terminal }]);
      return;
    }

    try {
      const cp = await engine.evaluate(game.fen());
      setTrend((previous) => [
        ...previous,
        { ply: game.history().length, winPct: winProbabilityFor(cp, playerColor) },
      ]);
    } catch {
      // A failed probe should cost a point on a chart, not the game.
    }
  }, [playerColor]);

  const playCoachMove = useCallback(async () => {
    if (!rung) return;
    setPhase("thinking");
    try {
      const engine = await ensureEngine();
      const game = gameRef.current;
      const candidates = await engine.analyse(game.fen(), rung.params.depth, ladder?.multipv ?? DEFAULT_MULTIPV);
      const uci = selectMove(candidates, rung.params);
      if (!uci) {
        setError("The engine returned no move.");
        setPhase("over");
        return;
      }
      game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      const finished = sync();
      void recordEval();
      if (!finished) setPhase("playing");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The engine failed.");
      setPhase("over");
    }
  }, [ensureEngine, ladder, recordEval, rung, sync]);

  const start = useCallback(
    async (color: "w" | "b") => {
      gameRef.current = new Chess();
      setPlayerColor(color);
      setOutcome(null);
      setError(null);
      setHistory([]);
      setTrend([{ ply: 0, winPct: 50 }]);
      setHeldPiece(null);
      setReview(null);
      setReviewProgress(null);
      setFen(gameRef.current.fen());

      try {
        const engine = await ensureEngine();
        await engine.newGame();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The engine failed to load.");
        setPhase("over");
        return;
      }

      setPhase("playing");
      // Playing Black means the coach opens.
      if (color === "b") void playCoachMove();
    },
    [ensureEngine, playCoachMove],
  );

  /** Attempt the player's move. Returns false for an illegal drop. */
  const playerMove = useCallback(
    (from: string, to: string): boolean => {
      const game = gameRef.current;
      if (phase !== "playing" || game.turn() !== playerColor) return false;
      try {
        // Always request a queen: under-promotion needs a UI affordance this
        // board does not have, and silently promoting to something else would
        // be worse than not offering the choice.
        game.move({ from, to, promotion: "q" });
      } catch {
        return false; // chess.js throws on an illegal move
      }
      setHeldPiece(null);
      const finished = sync();
      void recordEval();
      if (!finished) void playCoachMove();
      return true;
    },
    [phase, playCoachMove, playerColor, recordEval, sync],
  );

  /** Analyse the finished game move by move. */
  const runReview = useCallback(async () => {
    const engine = engineRef.current;
    const moves = gameRef.current.history();
    if (!engine || moves.length === 0) return;
    setReviewProgress({ done: 0, total: moves.length + 1 });
    try {
      const result = await reviewGame(engine, moves, playerColor, setReviewProgress);
      setReview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review failed.");
    } finally {
      setReviewProgress(null);
    }
  }, [playerColor]);

  const resign = useCallback(() => {
    if (phase !== "playing" && phase !== "thinking") return;
    setOutcome({ result: "loss", reason: "resignation" });
    setTrend((previous) => [...previous, { ply: previous.length, winPct: 0 }]);
    setPhase("over");
  }, [phase]);

  return {
    trend,
    review,
    reviewProgress,
    runReview,
    heldPiece,
    setHeldPiece,
    fen,
    phase,
    outcome,
    error,
    history,
    playerColor,
    rung,
    rungIndex,
    setRungIndex,
    start,
    playerMove,
    resign,
  };
}
