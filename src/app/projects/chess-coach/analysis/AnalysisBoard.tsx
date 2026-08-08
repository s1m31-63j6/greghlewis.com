"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { heatmap, mergeOverlays, moveHints, HEAT_BLACK, HEAT_WHITE, TIERS } from "../boardOverlays";
import { cutePieces } from "../CutePieces";
import { material } from "../material";
import { MaterialBar } from "../MaterialBar";
import { PositionSetup } from "./PositionSetup";
import { CANDIDATE_COUNT, useAnalysis, type Candidate } from "./useAnalysis";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), {
  ssr: false,
  loading: () => <div className="aspect-square w-full rounded-3xl bg-[#EDEDED]" />,
});

const LIGHT_SQUARE = { backgroundColor: "#F4EFE2" };
const DARK_SQUARE = { backgroundColor: "#9BBF6B" };

/**
 * Arrow colours by rank. The best move is unmistakable and the alternatives
 * recede — the ranking has to be readable from the board alone, without
 * cross-referencing the list.
 */
const ARROW_COLOURS = ["#58CC02", "#1CB0F6", "#FFC800", "#FF9600"];

/**
 * Centipawns in the conventional pawn notation: `+0.35`, `-2.50`, `M3`.
 *
 * Two decimals rather than one, which is what analysis GUIs use — and it avoids
 * a rounding wart: `0.35.toFixed(1)` is `"0.3"`, because 0.35 has no exact
 * binary representation, so single-decimal evals round the wrong way at exactly
 * the values a player is most likely to be squinting at.
 */
function evalLabel(cp: number): string {
  if (Math.abs(cp) >= 9000) {
    const mateIn = Math.max(1, 10000 - Math.abs(cp));
    return `${cp > 0 ? "" : "-"}M${mateIn}`;
  }
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function CandidateRow({
  candidate,
  rank,
  onPlay,
}: {
  candidate: Candidate;
  rank: number;
  onPlay: () => void;
}) {
  const colour = ARROW_COLOURS[rank] ?? "#AFAFAF";
  return (
    <button
      onClick={onPlay}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-[#F7F7F7] active:translate-y-[1px]"
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black text-white"
        style={{ backgroundColor: colour }}
      >
        {rank + 1}
      </span>
      <span className="w-16 shrink-0 text-base font-black text-[#4B4B4B]">{candidate.san}</span>
      <span className="w-14 shrink-0 text-sm font-black tabular-nums text-[#777]">
        {evalLabel(candidate.cp)}
      </span>
      <span className="ml-auto text-sm font-black tabular-nums text-[#AFAFAF]">
        {Math.round(candidate.winPct)}%
      </span>
      {rank > 0 && candidate.loss >= 0.5 && (
        <span className="w-12 shrink-0 text-right text-xs font-black tabular-nums text-[#FF9600]">
          −{Math.round(candidate.loss)}
        </span>
      )}
    </button>
  );
}

export function AnalysisBoard() {
  const analysis = useAnalysis();
  const [showHeat, setShowHeat] = useState(false);
  const [showArrows, setShowArrows] = useState(true);

  const squareStyles = useMemo(
    () => mergeOverlays(showHeat ? heatmap(analysis.board) : {}, moveHints(analysis.board, analysis.held)),
    [analysis.board, analysis.held, showHeat],
  );

  const arrows = useMemo(() => {
    if (!showArrows) return [];
    return analysis.candidates.map((candidate, i) => ({
      startSquare: candidate.uci.slice(0, 2),
      endSquare: candidate.uci.slice(2, 4),
      color: ARROW_COLOURS[i] ?? "#AFAFAF",
    }));
  }, [analysis.candidates, showArrows]);

  const summary = useMemo(() => material(analysis.board), [analysis.board]);
  const turn = analysis.board.turn() === "w" ? "White" : "Black";
  const over = analysis.board.isGameOver();

  return (
    <div className="font-round space-y-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ---------------- board ---------------- */}
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-[2rem] bg-white p-4 shadow-[0_6px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
            <Chessboard
              options={{
                id: "analysis-board",
                position: analysis.fen,
                pieces: cutePieces,
                boardOrientation: analysis.flipped ? "black" : "white",
                // The whole point: no turn gate, no player colour. Either side
                // can be moved whenever you like.
                allowDragging: true,
                darkSquareStyle: DARK_SQUARE,
                lightSquareStyle: LIGHT_SQUARE,
                squareStyles,
                arrows,
                animationDurationInMs: 180,
                onPieceDrag: ({ square }) => analysis.setHeld(square),
                onPieceDragCancel: () => analysis.setHeld(null),
                onSquareClick: ({ square }) =>
                  analysis.setHeld((current: string | null) =>
                    current === square ? null : square,
                  ),
                onPieceDrop: ({ sourceSquare, targetSquare }) =>
                  targetSquare ? analysis.move(sourceSquare, targetSquare) : false,
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => analysis.setPly(Math.max(0, analysis.ply - 1))}
              disabled={analysis.ply === 0}
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5] transition active:translate-y-[2px] disabled:opacity-40"
            >
              ←
            </button>
            <button
              onClick={() => analysis.setPly(Math.min(analysis.moves.length, analysis.ply + 1))}
              disabled={analysis.ply >= analysis.moves.length}
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5] transition active:translate-y-[2px] disabled:opacity-40"
            >
              →
            </button>
            <button
              onClick={() => analysis.setFlipped(!analysis.flipped)}
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5] transition active:translate-y-[2px]"
            >
              ⇅ Flip
            </button>
            <button
              onClick={() => setShowArrows((on) => !on)}
              aria-pressed={showArrows}
              className={`rounded-2xl px-4 py-2.5 text-sm font-extrabold transition active:translate-y-[2px] ${
                showArrows
                  ? "bg-[#58CC02] text-white shadow-[0_4px_0_0_#46A302]"
                  : "bg-white text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5]"
              }`}
            >
              ➜ Suggestions
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
              🔥 Heatmap
            </button>
          </div>

          {showHeat && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-[#777]">
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
                      className="h-3.5 w-3.5 rounded-[3px]"
                      style={{ backgroundColor: `rgba(${rgb}, ${alpha})` }}
                    />
                  ))}
                </span>
              ))}
              <span className="text-[#AFAFAF]">split = both sides</span>
            </div>
          )}
        </div>

        {/* ---------------- side panel ---------------- */}
        <aside className="space-y-5">
          <section className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">
                Best moves
              </h2>
              <span className="text-xs font-extrabold text-[#AFAFAF]">
                {over ? "game over" : `${turn} to play`}
              </span>
            </div>

            {analysis.engineError ? (
              <p className="mt-3 text-sm font-bold text-[#FF4B4B]">{analysis.engineError}</p>
            ) : over ? (
              <p className="mt-3 text-sm font-bold text-[#AFAFAF]">
                {analysis.board.isCheckmate() ? "Checkmate — nothing left to play." : "Drawn — no legal moves to weigh."}
              </p>
            ) : analysis.candidates.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-bold text-[#AFAFAF]">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-[#1CB0F6]" />
                Thinking…
              </p>
            ) : (
              <>
                <div className="mt-2 -mx-1">
                  {analysis.candidates.map((candidate, i) => (
                    <CandidateRow
                      key={candidate.uci}
                      candidate={candidate}
                      rank={i}
                      onPlay={() => analysis.playCandidate(candidate)}
                    />
                  ))}
                </div>
                <p className="mt-2 px-3 text-[11px] font-bold text-[#C4C4C4]">
                  Click a move to play it. Percentages are {turn.toLowerCase()}&apos;s chances;
                  the orange number is what the move costs against the best.
                  {analysis.analysing && " Refining…"}
                </p>
              </>
            )}

            <div className="mt-4 flex items-center gap-2 border-t border-[#F0F0F0] pt-3">
              <label htmlFor="depth" className="text-xs font-extrabold text-[#AFAFAF]">
                Depth {analysis.depth}
              </label>
              <input
                id="depth"
                type="range"
                min={6}
                max={20}
                step={1}
                value={analysis.depth}
                onChange={(e) => analysis.setDepth(Number(e.target.value))}
                className="flex-1 accent-[#1CB0F6]"
              />
            </div>
          </section>

          <MaterialBar summary={summary} playerColor="w" />

          <PositionSetup
            onFen={analysis.loadFen}
            onPgn={analysis.loadPgn}
            onReset={analysis.reset}
          />

          {analysis.moves.length > 0 && (
            <section className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">Line</h2>
              <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                <button
                  onClick={() => analysis.setPly(0)}
                  className={`rounded-lg px-2 py-1 text-xs font-black transition ${
                    analysis.ply === 0 ? "bg-[#1CB0F6] text-white" : "bg-[#F4F4F4] text-[#AFAFAF]"
                  }`}
                >
                  start
                </button>
                {analysis.moves.map((san, i) => (
                  <button
                    key={`${san}-${i}`}
                    onClick={() => analysis.setPly(i + 1)}
                    className={`rounded-lg px-2 py-1 text-xs font-black transition ${
                      analysis.ply === i + 1
                        ? "bg-[#1CB0F6] text-white"
                        : "bg-[#F4F4F4] text-[#4B4B4B] hover:bg-[#EDEDED]"
                    }`}
                  >
                    {i % 2 === 0 && <span className="text-[#C4C4C4]">{i / 2 + 1}.</span>} {san}
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

export { CANDIDATE_COUNT };
