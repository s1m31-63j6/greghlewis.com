"use client";

import { Chess } from "chess.js";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import { moveHints } from "../boardOverlays";
import { cutePieces } from "../CutePieces";
import type { PuzzleExample } from "./types";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
  loading: () => <div className="aspect-square w-full rounded-2xl bg-[#EDEDED]" />,
});

const LIGHT_SQUARE = { backgroundColor: "#F4EFE2" };
const DARK_SQUARE = { backgroundColor: "#9BBF6B" };

type Status = "solving" | "wrong" | "solved";

/**
 * A puzzle you actually play, rather than a diagram you look at.
 *
 * The Lichess solution alternates solver / opponent moves starting with the
 * solver, so after a correct move the reply is played automatically and the
 * next solver move is awaited. Solutions are "only moves" — any alternative
 * considerably worsens the position — which is what makes a strict
 * right/wrong check fair here.
 *
 * Exception, straight from the dataset's own documentation: mate in one may
 * have several solutions, so any mating move is accepted.
 */
export function PuzzleBoard({ puzzle }: { puzzle: PuzzleExample }) {
  const [game, setGame] = useState(() => new Chess(puzzle.fen));
  const [step, setStep] = useState(0); // index into solution_uci
  const [status, setStatus] = useState<Status>("solving");
  const [revealed, setRevealed] = useState(false);
  const [held, setHeld] = useState<string | null>(null);

  // No reset effect: the parent gives this component a `key` per puzzle, so a
  // different puzzle remounts it and every piece of state above starts fresh.
  // Resetting in an effect would cascade an extra render for the same result.

  const solverColour = useMemo(() => new Chess(puzzle.fen).turn(), [puzzle.fen]);
  const expected = puzzle.solution_uci[step];

  const squareStyles = useMemo(
    () => (status === "solving" ? moveHints(game, held) : {}),
    [game, held, status],
  );

  const reset = useCallback(() => {
    setGame(new Chess(puzzle.fen));
    setStep(0);
    setStatus("solving");
    setHeld(null);
  }, [puzzle.fen]);

  const attempt = useCallback(
    (from: string, to: string): boolean => {
      if (status === "solved" || revealed) return false;

      const next = new Chess(game.fen());
      let played;
      try {
        played = next.move({ from, to, promotion: "q" });
      } catch {
        return false;
      }

      const uci = played.from + played.to + (played.promotion ?? "");
      const correct =
        uci === expected ||
        // Mate in one is the documented exception: several moves may mate, and
        // the dataset counts any of them as a solve.
        (next.isCheckmate() && step === puzzle.solution_uci.length - 1);

      if (!correct) {
        setStatus("wrong");
        setHeld(null);
        // Show the mistake briefly, then put the piece back so they can retry.
        window.setTimeout(() => {
          setGame(new Chess(game.fen()));
          setStatus("solving");
        }, 700);
        return true;
      }

      setHeld(null);
      const reply = puzzle.solution_uci[step + 1];
      if (!reply) {
        setGame(next);
        setStep(step + 1);
        setStatus("solved");
        return true;
      }

      // Play the opponent's forced reply after a beat, so the solver's move is
      // visible before the position changes again.
      setGame(next);
      setStatus("solving");
      window.setTimeout(() => {
        const after = new Chess(next.fen());
        try {
          after.move({
            from: reply.slice(0, 2),
            to: reply.slice(2, 4),
            promotion: reply.length > 4 ? reply[4] : undefined,
          });
          setGame(after);
          setStep(step + 2);
        } catch {
          // A malformed line should not strand the puzzle mid-solution.
          setStatus("solved");
        }
      }, 420);
      return true;
    },
    [expected, game, puzzle.solution_uci, revealed, status, step],
  );

  const solvedAll = status === "solved";

  return (
    <div className="space-y-3">
      <div className="mx-auto w-full max-w-sm">
        <div
          className={`rounded-2xl p-2 transition-colors ${
            status === "wrong"
              ? "bg-[#FFE4E4]"
              : solvedAll
                ? "bg-[#E4F8D4]"
                : "bg-white ring-1 ring-[#E5E5E5]"
          }`}
        >
          <Chessboard
            options={{
              id: `puzzle-${puzzle.puzzle_id}`,
              position: game.fen(),
              pieces: cutePieces,
              boardOrientation: solverColour === "w" ? "white" : "black",
              allowDragging: status === "solving" && !revealed,
              darkSquareStyle: DARK_SQUARE,
              lightSquareStyle: LIGHT_SQUARE,
              squareStyles,
              animationDurationInMs: 200,
              onPieceDrag: ({ square }) => setHeld(square),
              onPieceDragCancel: () => setHeld(null),
              onSquareClick: ({ square }) =>
                setHeld((current) => (current === square ? null : square)),
              onPieceDrop: ({ sourceSquare, targetSquare }) =>
                targetSquare ? attempt(sourceSquare, targetSquare) : false,
            }}
          />
        </div>
      </div>

      <p aria-live="polite" className="text-center text-sm font-extrabold">
        {solvedAll ? (
          <span className="text-[#58CC02]">🎉 Solved! {puzzle.solution_san.join(" ")}</span>
        ) : status === "wrong" ? (
          <span className="text-[#FF4B4B]">Not quite — try again</span>
        ) : revealed ? (
          <span className="text-[#1899D6]">Answer: {puzzle.solution_san.join(" ")}</span>
        ) : (
          <span className="text-[#777]">
            {solverColour === "w" ? "White" : "Black"} to play — find the best move
          </span>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-extrabold">
        <button
          onClick={reset}
          className="rounded-xl bg-white px-3 py-2 text-[#4B4B4B] ring-2 ring-[#E5E5E5] transition active:translate-y-[1px]"
        >
          ↺ Reset
        </button>
        {!solvedAll && (
          <button
            onClick={() => setRevealed(true)}
            className="rounded-xl bg-white px-3 py-2 text-[#4B4B4B] ring-2 ring-[#E5E5E5] transition active:translate-y-[1px]"
          >
            👀 Show answer
          </button>
        )}
        <span className="rounded-xl bg-[#F4F4F4] px-3 py-2 text-[#AFAFAF]">
          rated {puzzle.rating}
        </span>
        <a
          href={puzzle.game_url}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-[#F4F4F4] px-3 py-2 text-[#AFAFAF] underline-offset-2 hover:underline"
        >
          source game ↗
        </a>
      </div>
    </div>
  );
}
