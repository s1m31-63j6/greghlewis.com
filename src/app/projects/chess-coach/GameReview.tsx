"use client";

import { useEffect } from "react";

import { VERDICT_STYLE, type MoveReview, type ReviewProgress } from "./engine/review";

/**
 * Move-by-move walkthrough of a finished game.
 *
 * The narration is generated from real engine numbers rather than written prose:
 * every percentage quoted is a measured evaluation, and the "you should have
 * played X" line is the engine's actual first choice in that position. Nothing
 * here is a guess about what happened.
 */

const GOOD = "#58CC02";
const BAD = "#FF4B4B";

function Pill({ review }: { review: MoveReview }) {
  const style = VERDICT_STYLE[review.verdict];
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-black"
      style={{ color: style.colour, backgroundColor: `${style.colour}1F` }}
    >
      {style.icon} {style.label}
    </span>
  );
}

/** How far the player's chances moved on this move, in points. */
function Swing({ swing }: { swing: number }) {
  const points = Math.round(swing);
  if (points === 0) return null;
  const up = points > 0;
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-black tabular-nums"
      style={{ color: up ? GOOD : BAD, backgroundColor: up ? `${GOOD}1F` : `${BAD}1F` }}
    >
      {up ? "▲" : "▼"} {Math.abs(points)}%
    </span>
  );
}

export function GameReview({
  review,
  progress,
  index,
  setIndex,
  onRun,
  canRun,
}: {
  review: MoveReview[] | null;
  progress: ReviewProgress | null;
  index: number;
  setIndex: (next: number) => void;
  onRun: () => void;
  canRun: boolean;
}) {
  // Arrow keys are the natural way to step through a game.
  useEffect(() => {
    if (!review) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setIndex(Math.max(0, index - 1));
      if (event.key === "ArrowRight") setIndex(Math.min(review.length - 1, index + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, review, setIndex]);

  if (progress) {
    const pct = Math.round((progress.done / progress.total) * 100);
    return (
      <section className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">
          Reviewing your game…
        </h2>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#EDEDED]">
          <div
            className="h-full rounded-full bg-[#1CB0F6] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-bold text-[#AFAFAF]">
          {progress.done} of {progress.total} positions
        </p>
      </section>
    );
  }

  if (!review) {
    return (
      <button
        onClick={onRun}
        disabled={!canRun}
        className="w-full rounded-2xl bg-[#CE82FF] px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_5px_0_0_#A560E8] transition-all active:translate-y-[3px] active:shadow-[0_2px_0_0_#A560E8] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        🔍 Review this game
      </button>
    );
  }

  const current = review[index];
  const counts = review
    .filter((m) => m.byPlayer)
    .reduce<Record<string, number>>((acc, m) => {
      acc[m.verdict] = (acc[m.verdict] ?? 0) + 1;
      return acc;
    }, {});

  return (
    <section className="space-y-4">
      {/* summary of the player's own moves */}
      <div className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">
          How you played
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["best", "good", "inaccuracy", "mistake", "blunder"] as const).map((verdict) => (
            <span
              key={verdict}
              className="rounded-2xl px-3 py-1.5 text-xs font-black"
              style={{
                color: VERDICT_STYLE[verdict].colour,
                backgroundColor: `${VERDICT_STYLE[verdict].colour}1F`,
              }}
            >
              {counts[verdict] ?? 0} {VERDICT_STYLE[verdict].label.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* the narration for the selected move */}
      <div className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-extrabold text-[#4B4B4B]">
            Move {Math.ceil(current.ply / 2)}
            {current.byPlayer ? " · you" : " · coach"}
          </span>
          {current.byPlayer && <Pill review={current} />}
          <Swing swing={current.swing} />
        </div>

        {/* The numbers live here rather than inside the sentence, so they can be
            scanned and compared without reading prose. */}
        <p className="mt-2 flex items-center gap-1.5 text-sm font-black tabular-nums text-[#AFAFAF]">
          <span>{Math.round(current.winBefore)}%</span>
          <span aria-hidden="true">→</span>
          <span style={{ color: current.swing >= 0 ? GOOD : BAD }}>
            {Math.round(current.winAfter)}%
          </span>
        </p>

        <p className="mt-3 text-base font-bold leading-relaxed text-[#4B4B4B]">{current.note}</p>

        {current.byPlayer && current.bestSan && current.verdict !== "best" && (
          <p className="mt-3 rounded-2xl bg-[#F4F9FF] px-4 py-2.5 text-sm font-bold text-[#1899D6]">
            ★ Better was <span className="font-black">{current.bestSan}</span>
            <span className="ml-1.5 font-black tabular-nums text-[#7FC4EC]">
              ({Math.round(current.winBefore)}%)
            </span>
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => setIndex(Math.max(0, index - 1))}
            disabled={index === 0}
            className="rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#4B4B4B] ring-2 ring-[#E5E5E5] shadow-[0_4px_0_0_#E5E5E5] transition-all active:translate-y-[2px] disabled:opacity-40"
          >
            ←
          </button>
          <button
            onClick={() => setIndex(Math.min(review.length - 1, index + 1))}
            disabled={index === review.length - 1}
            className="rounded-2xl bg-[#1CB0F6] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_0_0_#1899D6] transition-all active:translate-y-[2px] disabled:opacity-40"
          >
            →
          </button>
          <span className="ml-1 text-xs font-bold text-[#AFAFAF]">
            {index + 1} / {review.length} · arrow keys work
          </span>
        </div>
      </div>

      {/* every move, colour-coded; click to jump */}
      <div className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">All moves</h2>
        <div className="mt-3 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {review.map((move, i) => {
            const style = VERDICT_STYLE[move.verdict];
            const selected = i === index;
            return (
              <button
                key={move.ply}
                onClick={() => setIndex(i)}
                title={move.note}
                className={`rounded-xl px-2.5 py-1 text-xs font-black transition ${
                  selected ? "ring-2 ring-[#1CB0F6]" : ""
                }`}
                style={{
                  color: move.byPlayer ? style.colour : "#AFAFAF",
                  backgroundColor: move.byPlayer ? `${style.colour}1A` : "#F4F4F4",
                }}
              >
                {move.san}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
