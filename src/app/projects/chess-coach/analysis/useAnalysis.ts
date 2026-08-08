"use client";

import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StockfishEngine } from "../engine/uci";
import { bootEngine, type BootProgress } from "../engine/boot";
import { winProbability } from "../engine/winProbability";

/**
 * Analysis-board state: a position you can push around freely, with the engine
 * evaluating whatever is in front of it.
 *
 * Unlike the game hook, there is no player colour and no turn gate — either
 * side can be moved at any time. That single difference is most of what makes
 * this a sandbox rather than a game.
 *
 * The line is stored as `startFen` plus a list of SAN moves plus a ply pointer,
 * rather than as a mutable board. That makes stepping backwards free, and makes
 * "play a different move from here" a truncate-and-append instead of a rewind.
 */

const START_FEN = new Chess().fen();

/** How many candidate moves to surface. Second and third best is where the learning is. */
export const CANDIDATE_COUNT = 4;

export type Candidate = {
  uci: string;
  san: string;
  /** Centipawns for the side to move. */
  cp: number;
  /** Win probability for the side to move, 0-100. */
  winPct: number;
  /** Win-percentage cost versus the best move. 0 for the top line. */
  loss: number;
};

export function useAnalysis() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const bootRef = useRef<Promise<StockfishEngine> | null>(null);
  // Guards against a slow analysis of an old position landing after a newer one.
  const requestRef = useRef(0);

  const [startFen, setStartFen] = useState(START_FEN);
  const [moves, setMoves] = useState<string[]>([]);
  const [ply, setPly] = useState(0);
  const [depth, setDepth] = useState(14);
  const [result, setResult] = useState<{ fen: string; candidates: Candidate[] } | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [boot, setBoot] = useState<BootProgress | null>(null);
  const [flipped, setFlipped] = useState(false);

  /** The board as it stands at the current ply. */
  const board = useMemo(() => {
    const game = new Chess(startFen);
    for (let i = 0; i < ply && i < moves.length; i++) {
      try {
        game.move(moves[i]);
      } catch {
        break;
      }
    }
    return game;
  }, [moves, ply, startFen]);

  const fen = board.fen();

  /**
   * Boot the engine once, no matter how many callers ask at once.
   *
   * The promise is memoised in a ref because `engineRef.current` is only set
   * *after* the await, so without this a second caller arriving during the boot
   * window starts a second engine — two workers, two downloads, and two
   * interleaved progress streams fighting over the same state.
   *
   * That race had a nasty tail: the losing boot's final "ready" callback landed
   * after the winner had already cleared the progress state, so the loading card
   * reappeared and stayed up until the page was reloaded.
   *
   * On failure the ref is cleared so a later attempt can retry rather than
   * re-awaiting a permanently rejected promise.
   */
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

  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
      bootRef.current = null;
    };
  }, []);

  // Analyse whenever the position or depth changes. `analysing` is derived from
  // whether the stored result matches the current position, so no state is
  // written synchronously here.
  useEffect(() => {
    let cancelled = false;
    const ticket = ++requestRef.current;

    const run = async () => {
      try {
        // Never terminate here on cancel: the engine outlives any single
        // analysis, and a cancelled run tearing it down would destroy the one
        // the next run is about to use. Only unmount disposes of it.
        const engine = await ensureEngine();
        if (cancelled || ticket !== requestRef.current) return;

        const position = new Chess(fen);
        if (position.isGameOver()) {
          if (!cancelled && ticket === requestRef.current) setResult({ fen, candidates: [] });
          return;
        }

        const scored = await engine.analyse(fen, depth, CANDIDATE_COUNT);
        // A newer position was requested while this was searching — drop it.
        if (cancelled || ticket !== requestRef.current) return;

        const best = scored[0]?.cp ?? 0;
        const candidates: Candidate[] = scored.flatMap((entry) => {
          const probe = new Chess(fen);
          let san: string;
          try {
            san = probe.move({
              from: entry.move.slice(0, 2),
              to: entry.move.slice(2, 4),
              promotion: entry.move.length > 4 ? entry.move[4] : undefined,
            }).san;
          } catch {
            return [];
          }
          return [
            {
              uci: entry.move,
              san,
              cp: entry.cp,
              winPct: winProbability(entry.cp),
              loss: winProbability(best) - winProbability(entry.cp),
            },
          ];
        });
        setResult({ fen, candidates });
      } catch (cause) {
        if (!cancelled) {
          setEngineError(cause instanceof Error ? cause.message : "The engine failed.");
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [depth, ensureEngine, fen]);

  const analysing = result?.fen !== fen;
  const candidates = result?.fen === fen ? result.candidates : [];

  /** Play a move for whichever side is to move. Returns false if illegal. */
  const move = useCallback(
    (from: string, to: string): boolean => {
      const probe = new Chess(fen);
      let san: string;
      try {
        san = probe.move({ from, to, promotion: "q" }).san;
      } catch {
        return false;
      }
      // Playing from a rewound position replaces the rest of the line, which is
      // what "try something else from here" should do.
      setMoves((current) => [...current.slice(0, ply), san]);
      setPly(ply + 1);
      setHeld(null);
      return true;
    },
    [fen, ply],
  );

  /** Play the engine's nth choice, so a suggestion can be taken with one click. */
  const playCandidate = useCallback(
    (candidate: Candidate) => {
      move(candidate.uci.slice(0, 2), candidate.uci.slice(2, 4));
    },
    [move],
  );

  const loadFen = useCallback((next: string): string | null => {
    try {
      const probe = new Chess(next.trim());
      setStartFen(probe.fen());
      setMoves([]);
      setPly(0);
      setHeld(null);
      return null;
    } catch (cause) {
      return cause instanceof Error ? cause.message : "That FEN is not valid.";
    }
  }, []);

  const loadPgn = useCallback((pgn: string): string | null => {
    try {
      const game = new Chess();
      game.loadPgn(pgn.trim());
      const played = game.history();
      if (played.length === 0) return "No moves found in that PGN.";
      // A PGN may set up from a non-standard position via a FEN header.
      const header = game.getHeaders?.().FEN;
      setStartFen(header ?? START_FEN);
      setMoves(played);
      setPly(played.length);
      setHeld(null);
      return null;
    } catch (cause) {
      return cause instanceof Error ? cause.message : "That PGN could not be read.";
    }
  }, []);

  const reset = useCallback(() => {
    setStartFen(START_FEN);
    setMoves([]);
    setPly(0);
    setHeld(null);
  }, []);

  return {
    boot,
    board,
    fen,
    moves,
    ply,
    setPly,
    depth,
    setDepth,
    candidates,
    analysing,
    engineError,
    held,
    setHeld,
    flipped,
    setFlipped,
    move,
    playCandidate,
    loadFen,
    loadPgn,
    reset,
  };
}
