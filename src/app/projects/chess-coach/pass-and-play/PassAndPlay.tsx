"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { heatmap, mergeOverlays, moveHints, HEAT_BLACK, HEAT_WHITE, TIERS } from "../boardOverlays";
import { cutePieces } from "../CutePieces";
import { BoardSkeleton, EngineLoading } from "../EngineLoading";
import { material } from "../material";
import { MaterialBar } from "../MaterialBar";
import { WinTrend } from "../WinTrend";
import { useTwoPlayerGame } from "./useTwoPlayerGame";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
  loading: () => <BoardSkeleton />,
});

const LIGHT_SQUARE = { backgroundColor: "#F4EFE2" };
const DARK_SQUARE = { backgroundColor: "#9BBF6B" };

function NameField({
  value,
  onChange,
  colour,
  active,
}: {
  value: string;
  onChange: (next: string) => void;
  colour: "white" | "black";
  active: boolean;
}) {
  return (
    <label
      className={`flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 transition ${
        active ? "bg-[#E4F8D4] ring-2 ring-[#58CC02]" : "bg-white ring-2 ring-[#E5E5E5]"
      }`}
    >
      <span className="text-lg" aria-hidden="true">
        {colour === "white" ? "♔" : "♚"}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${colour} player name`}
        className="w-full min-w-0 bg-transparent text-sm font-extrabold text-[#4B4B4B] outline-none"
      />
    </label>
  );
}

export function PassAndPlay() {
  const game = useTwoPlayerGame();
  const [white, setWhite] = useState("Player 1");
  const [black, setBlack] = useState("Player 2");
  const [showHeat, setShowHeat] = useState(false);
  const [showHints, setShowHints] = useState(true);
  const [autoFlip, setAutoFlip] = useState(false);
  const [manualFlip, setManualFlip] = useState(false);

  // With auto-flip on, the board turns to face whoever is about to move — the
  // natural thing when two people share one screen.
  const flipped = autoFlip ? game.turn === "b" : manualFlip;

  const squareStyles = useMemo(
    () =>
      mergeOverlays(
        showHeat ? heatmap(game.board) : {},
        showHints ? moveHints(game.board, game.held) : {},
      ),
    [game.board, game.held, showHeat, showHints],
  );

  const summary = useMemo(() => material(game.board), [game.board]);
  const toMoveName = game.turn === "w" ? white : black;
  const inCheck = game.board.inCheck();

  const status = game.outcome
    ? game.outcome.winner === null
      ? `🤝 Draw — ${game.outcome.reason}.`
      : `🎉 ${game.outcome.winner === "white" ? white : black} wins by ${game.outcome.reason}!`
    : inCheck
      ? `⚠️ ${toMoveName}, you're in check!`
      : `✨ ${toMoveName}'s turn`;

  return (
    <div className="font-round space-y-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---------------- board ---------------- */}
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-[2rem] bg-white p-4 shadow-[0_6px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
            <Chessboard
              options={{
                id: "pass-and-play-board",
                position: game.fen,
                pieces: cutePieces,
                boardOrientation: flipped ? "black" : "white",
                allowDragging: !game.outcome,
                darkSquareStyle: DARK_SQUARE,
                lightSquareStyle: LIGHT_SQUARE,
                squareStyles,
                animationDurationInMs: 220,
                onPieceDrag: ({ square }) => game.setHeld(square),
                onPieceDragCancel: () => game.setHeld(null),
                onSquareClick: ({ square }) =>
                  game.setHeld((current: string | null) => (current === square ? null : square)),
                onPieceDrop: ({ sourceSquare, targetSquare }) =>
                  targetSquare ? game.move(sourceSquare, targetSquare) : false,
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={game.takeBack}
              disabled={game.moves.length === 0}
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5] transition active:translate-y-[2px] disabled:opacity-40"
            >
              ↶ Take back
            </button>
            <button
              onClick={() => (autoFlip ? setAutoFlip(false) : setManualFlip((on) => !on))}
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5] transition active:translate-y-[2px]"
            >
              ⇅ Flip
            </button>
            <button
              onClick={() => setAutoFlip((on) => !on)}
              aria-pressed={autoFlip}
              className={`rounded-2xl px-4 py-2.5 text-sm font-extrabold transition active:translate-y-[2px] ${
                autoFlip
                  ? "bg-[#CE82FF] text-white shadow-[0_4px_0_0_#A560E8]"
                  : "bg-white text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5]"
              }`}
            >
              🔄 Auto-flip
            </button>
            <button
              onClick={() => setShowHints((on) => !on)}
              aria-pressed={showHints}
              className={`rounded-2xl px-4 py-2.5 text-sm font-extrabold transition active:translate-y-[2px] ${
                showHints
                  ? "bg-[#58CC02] text-white shadow-[0_4px_0_0_#46A302]"
                  : "bg-white text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5]"
              }`}
            >
              ● Where can it go?
            </button>
            <button
              onClick={() => setShowHeat((on) => !on)}
              aria-pressed={showHeat}
              className={`rounded-2xl px-4 py-2.5 text-sm font-extrabold transition active:translate-y-[2px] ${
                showHeat
                  ? "bg-[#1CB0F6] text-white shadow-[0_4px_0_0_#1899D6]"
                  : "bg-white text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5]"
              }`}
            >
              🔥 Who owns what
            </button>
          </div>

          {showHeat && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-[#777]">
              {(
                [
                  [white, HEAT_WHITE],
                  [black, HEAT_BLACK],
                ] as const
              ).map(([who, rgb]) => (
                <span key={who} className="flex items-center gap-1.5">
                  {who}
                  {TIERS.map((alpha, i) => (
                    <span
                      key={i}
                      className="h-3.5 w-3.5 rounded-[3px]"
                      style={{ backgroundColor: `rgba(${rgb}, ${alpha})` }}
                    />
                  ))}
                </span>
              ))}
              <span className="text-[#AFAFAF]">darker = more pieces guarding it</span>
            </div>
          )}
        </div>

        {/* ---------------- side panel ---------------- */}
        <aside className="space-y-5">
          <div className="flex gap-2">
            <NameField value={white} onChange={setWhite} colour="white" active={game.turn === "w" && !game.outcome} />
            <NameField value={black} onChange={setBlack} colour="black" active={game.turn === "b" && !game.outcome} />
          </div>

          <p
            aria-live="polite"
            className="rounded-3xl bg-white px-5 py-4 text-lg font-extrabold text-[#4B4B4B] shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]"
          >
            {status}
          </p>

          {game.boot ? (
            <EngineLoading progress={game.boot} />
          ) : (
            <WinTrend
              points={game.trend}
              thinking={false}
              title="Who's winning"
              aheadLabel={white}
              behindLabel={black}
            />
          )}

          <MaterialBar summary={summary} playerColor="w" />

          <button
            onClick={game.reset}
            className="w-full rounded-2xl bg-[#58CC02] px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_5px_0_0_#46A302] transition-all active:translate-y-[3px] active:shadow-[0_2px_0_0_#46A302]"
          >
            ♟️ New game
          </button>

          {game.moves.length > 0 && (
            <section className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">Moves</h2>
              <ol className="mt-2 max-h-56 space-y-0.5 overflow-y-auto text-sm font-bold text-[#4B4B4B]">
                {Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-6 text-right text-[#AFAFAF]">{i + 1}.</span>
                    <span className="w-16">{game.moves[i * 2]}</span>
                    <span className="w-16">{game.moves[i * 2 + 1] ?? ""}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
