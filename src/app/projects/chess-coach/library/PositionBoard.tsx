"use client";

import { Chess } from "chess.js";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { heatmap } from "../boardOverlays";
import { cutePieces } from "../CutePieces";
import { BoardSkeleton } from "../EngineLoading";
import type { PositionExample } from "./types";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
  loading: () => <BoardSkeleton />,
});

const LIGHT_SQUARE = { backgroundColor: "#F4EFE2" };
const DARK_SQUARE = { backgroundColor: "#9BBF6B" };

/**
 * A hand-authored teaching position.
 *
 * Where the position came from an opening line, the moves can be stepped
 * through — seeing a structure *arise* teaches more than being shown it, since
 * the whole point of most of these concepts is that they are the consequence of
 * earlier choices.
 */
export function PositionBoard({ example }: { example: PositionExample }) {
  const moves = example.moves_san;
  const [ply, setPly] = useState(moves.length);
  const [showHeat, setShowHeat] = useState(false);

  // Keyed by the parent, so a new example remounts rather than resetting here.

  const game = useMemo(() => {
    if (moves.length === 0) return new Chess(example.fen);
    const board = new Chess();
    for (let i = 0; i < ply; i++) board.move(moves[i]);
    return board;
  }, [example.fen, moves, ply]);

  const squareStyles = useMemo(() => (showHeat ? heatmap(game) : {}), [game, showHeat]);

  return (
    <div className="space-y-3">
      <div className="mx-auto w-full max-w-sm">
        <div className="rounded-2xl bg-white p-2 ring-1 ring-[#E5E5E5]">
          <Chessboard
            options={{
              id: `position-${example.fen.slice(0, 12)}`,
              position: game.fen(),
              pieces: cutePieces,
              allowDragging: false,
              darkSquareStyle: DARK_SQUARE,
              lightSquareStyle: LIGHT_SQUARE,
              squareStyles,
              animationDurationInMs: 200,
            }}
          />
        </div>
      </div>

      {moves.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-xs font-extrabold">
          <button
            onClick={() => setPly(Math.max(0, ply - 1))}
            disabled={ply === 0}
            className="rounded-xl bg-white px-3 py-2 text-[#4B4B4B] ring-2 ring-[#E5E5E5] disabled:opacity-40"
          >
            ←
          </button>
          <span className="tabular-nums text-[#AFAFAF]">
            {ply === 0 ? "start" : moves[ply - 1]} · {ply}/{moves.length}
          </span>
          <button
            onClick={() => setPly(Math.min(moves.length, ply + 1))}
            disabled={ply === moves.length}
            className="rounded-xl bg-[#1CB0F6] px-3 py-2 text-white disabled:opacity-40"
          >
            →
          </button>
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={() => setShowHeat((on) => !on)}
          aria-pressed={showHeat}
          className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${
            showHeat
              ? "bg-[#1CB0F6] text-white"
              : "bg-white text-[#4B4B4B] ring-2 ring-[#E5E5E5]"
          }`}
        >
          🔥 Square control
        </button>
      </div>

      <p className="mx-auto max-w-md text-center text-sm font-bold leading-relaxed text-[#777]">
        {example.caption}
      </p>
    </div>
  );
}
