"use client";

import { Chess } from "chess.js";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { heatmap, mergeOverlays, moveHints, HEAT_BLACK, HEAT_WHITE, TIERS } from "./boardOverlays";
import { cutePieces } from "./CutePieces";
import { BoardSkeleton, EngineLoading } from "./EngineLoading";
import type { Ladder } from "./engine/weakening";
import { GameReview } from "./GameReview";
import { material } from "./material";
import { MaterialBar } from "./MaterialBar";
import { useCoachGame } from "./useCoachGame";
import { WinTrend } from "./WinTrend";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
  loading: () => <BoardSkeleton />,
});

const LIGHT_SQUARE = { backgroundColor: "#F4EFE2" };
const DARK_SQUARE = { backgroundColor: "#9BBF6B" };

/** Chunky Duolingo-style button: a solid slab with a hard shadow that presses in. */
function Chunky({
  children,
  onClick,
  tone = "green",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "green" | "blue" | "grey";
  className?: string;
}) {
  const tones = {
    green: "bg-[#58CC02] text-white shadow-[0_5px_0_0_#46A302] hover:bg-[#61DB02]",
    blue: "bg-[#1CB0F6] text-white shadow-[0_5px_0_0_#1899D6] hover:bg-[#33BBF8]",
    grey: "bg-white text-[#4B4B4B] shadow-[0_5px_0_0_#E5E5E5] ring-2 ring-[#E5E5E5] hover:bg-[#F7F7F7]",
  } as const;
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-5 py-3 text-sm font-extrabold uppercase tracking-wide transition-all active:translate-y-[3px] active:shadow-[0_2px_0_0_rgba(0,0,0,0.2)] ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

function Status({ game }: { game: ReturnType<typeof useCoachGame> }) {
  if (game.error) return <>😬 {game.error}</>;
  if (game.outcome) {
    if (game.outcome.result === "win") return <>🎉 You won by {game.outcome.reason}!</>;
    if (game.outcome.result === "loss") return <>💪 The coach got you — {game.outcome.reason}.</>;
    return <>🤝 A draw by {game.outcome.reason}.</>;
  }
  if (game.phase === "loading") return <>⏳ Waking up the coach…</>;
  if (game.phase === "thinking") return <>🤔 The coach is thinking…</>;
  if (game.phase === "playing") return <>✨ Your move!</>;
  return <>👋 Pick a difficulty and jump in.</>;
}

export function PlayCoach() {
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHeat, setShowHeat] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const game = useCoachGame(ladder);

  // While reviewing, the board shows the position *after* the selected move —
  // you watch the move land, then read the verdict on it. Showing the position
  // before it meant narrating a move that had not appeared on the board yet.
  const reviewing = game.review !== null;
  const shownFen = reviewing ? game.review![reviewIndex].fenAfter : game.fen;

  useEffect(() => {
    fetch("/chess-coach/ladder.json")
      .then((res) => {
        if (!res.ok) throw new Error(`ladder.json returned ${res.status}`);
        return res.json();
      })
      .then(setLadder)
      .catch((cause: unknown) =>
        setLoadError(cause instanceof Error ? cause.message : "Could not load the difficulty dial."),
      );
  }, []);

  // Rebuilt from the FEN rather than shared from the hook, so nothing reads a
  // ref during render. Cheap, and it keeps the overlays pure.
  const board = useMemo(() => new Chess(shownFen), [shownFen]);
  const materialSummary = useMemo(() => material(board), [board]);

  const squareStyles = useMemo(
    () =>
      mergeOverlays(
        showHeat ? heatmap(board) : {},
        game.phase === "playing" && !reviewing ? moveHints(board, game.heldPiece) : {},
      ),
    [board, game.heldPiece, game.phase, reviewing, showHeat],
  );

  const provisional = Boolean(ladder && "provisional" in ladder && ladder.provisional);

  if (loadError) {
    return <p className="font-bold text-[#FF4B4B]">Couldn&apos;t load the coach: {loadError}</p>;
  }
  if (!ladder || !game.rung) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="mx-auto w-full max-w-2xl">
          <BoardSkeleton label="Setting up the board…" />
        </div>
        <div className="h-32 rounded-3xl bg-[#EDEDED]" />
      </div>
    );
  }

  return (
    <div className="font-round space-y-5">
      {provisional && (
        <p className="rounded-2xl bg-[#FFF3D6] px-4 py-3 text-sm font-bold text-[#8A6100]">
          🚧 These difficulty numbers are a placeholder — the measurement run hasn&apos;t finished yet.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---------------- board ---------------- */}
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-[2rem] bg-white p-4 shadow-[0_6px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
            <Chessboard
              options={{
                id: "coach-board",
                position: shownFen,
                pieces: cutePieces,
                boardOrientation: game.playerColor === "w" ? "white" : "black",
                allowDragging: game.phase === "playing" && !reviewing,
                darkSquareStyle: DARK_SQUARE,
                lightSquareStyle: LIGHT_SQUARE,
                squareStyles,
                animationDurationInMs: 220,
                onPieceDrag: ({ square }) => game.setHeldPiece(square),
                onPieceDragCancel: () => game.setHeldPiece(null),
                onSquareClick: ({ square }) =>
                  game.setHeldPiece((current: string | null) =>
                    current === square ? null : square,
                  ),
                onPieceDrop: ({ sourceSquare, targetSquare }) => {
                  game.setHeldPiece(null);
                  return targetSquare ? game.playerMove(sourceSquare, targetSquare) : false;
                },
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowHeat((on) => !on)}
              aria-pressed={showHeat}
              className={`rounded-2xl px-4 py-2.5 text-sm font-extrabold transition-all active:translate-y-[2px] ${
                showHeat
                  ? "bg-[#1CB0F6] text-white shadow-[0_4px_0_0_#1899D6]"
                  : "bg-white text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5]"
              }`}
            >
              🔥 Heatmap {showHeat ? "on" : "off"}
            </button>

            {showHeat && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-[#777]">
                {(
                  [
                    ["White", HEAT_WHITE],
                    ["Black", HEAT_BLACK],
                  ] as const
                ).map(([who, rgb]) => (
                  <span key={who} className="flex items-center gap-1.5">
                    {who}
                    {TIERS.map((alpha, i) => (
                      <span
                        key={i}
                        title={`${i + 1}${i === 2 ? "+" : ""} attacker${i ? "s" : ""}`}
                        className="h-3.5 w-3.5 rounded-[3px]"
                        style={{ backgroundColor: `rgba(${rgb}, ${alpha})` }}
                      />
                    ))}
                    <span className="text-[#AFAFAF]">1 · 2 · 3+</span>
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-[#AFAFAF]">
                  <span
                    className="h-3.5 w-3.5 rounded-[3px]"
                    style={{
                      backgroundImage: `linear-gradient(135deg, rgba(${HEAT_WHITE},0.62) 0 50%, rgba(${HEAT_BLACK},0.62) 50% 100%)`,
                    }}
                  />
                  split = both sides
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ---------------- side panel ---------------- */}
        <aside className="space-y-5">
          {game.boot ? (
            <EngineLoading progress={game.boot} />
          ) : (
            <p
              aria-live="polite"
              className="rounded-3xl bg-white px-5 py-4 text-lg font-extrabold text-[#4B4B4B] shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]"
            >
              <Status game={game} />
            </p>
          )}

          <WinTrend points={game.trend} thinking={game.phase === "thinking"} />

          <MaterialBar summary={materialSummary} playerColor={game.playerColor} />

          {game.history.length > 0 && (
            <GameReview
              review={game.review}
              progress={game.reviewProgress}
              index={reviewIndex}
              setIndex={setReviewIndex}
              onRun={() => {
                setReviewIndex(0);
                void game.runReview();
              }}
              canRun={game.phase === "over"}
            />
          )}

          <section className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
            <div className="flex items-baseline justify-between">
              <label htmlFor="difficulty" className="text-sm font-extrabold uppercase tracking-wide text-[#777]">
                Difficulty
              </label>
              <span className="font-round text-2xl font-black text-[#1CB0F6]">
                {game.rung.label}
              </span>
            </div>
            <input
              id="difficulty"
              type="range"
              min={0}
              max={ladder.rungs.length - 1}
              step={1}
              value={game.rungIndex}
              onChange={(e) => game.setRungIndex(Number(e.target.value))}
              className="mt-3 w-full accent-[#1CB0F6]"
            />
            <div className="flex justify-between text-xs font-bold text-[#AFAFAF]">
              <span>🐣 {ladder.rungs[0].label}</span>
              <span>{ladder.rungs[ladder.rungs.length - 1].label} 🦈</span>
            </div>
            {game.rung.ci95 != null && (
              <p className="mt-2 text-xs font-bold text-[#AFAFAF]">
                measured over {ladder.games.toLocaleString()} games (±{Math.round(game.rung.ci95)})
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex gap-3">
              <Chunky onClick={() => void game.start("w")} tone="green" className="flex-1">
                ♔ Play white
              </Chunky>
              <Chunky onClick={() => void game.start("b")} tone="grey" className="flex-1">
                ♚ Play black
              </Chunky>
            </div>
            {(game.phase === "playing" || game.phase === "thinking") && (
              <button
                onClick={game.resign}
                className="w-full rounded-2xl py-2 text-xs font-extrabold uppercase tracking-wide text-[#AFAFAF] transition hover:text-[#FF4B4B]"
              >
                Resign
              </button>
            )}
          </section>

          {game.history.length > 0 && (
            <section className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">Moves</h2>
              <ol className="mt-2 max-h-56 space-y-0.5 overflow-y-auto text-sm font-bold text-[#4B4B4B]">
                {Array.from({ length: Math.ceil(game.history.length / 2) }, (_, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-6 text-right text-[#AFAFAF]">{i + 1}.</span>
                    <span className="w-16">{game.history[i * 2]}</span>
                    <span className="w-16">{game.history[i * 2 + 1] ?? ""}</span>
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
