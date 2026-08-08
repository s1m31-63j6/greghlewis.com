"use client";

import { useState } from "react";

import { PositionBoard } from "./PositionBoard";
import { PuzzleBoard } from "./PuzzleBoard";
import { CATEGORY_STYLE, type Concept } from "./types";

export function ConceptDetail({ concept, onBack }: { concept: Concept; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const style = CATEGORY_STYLE[concept.category];
  const example = concept.examples[index];

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="text-xs font-extrabold uppercase tracking-wide text-[#AFAFAF] transition hover:text-[#4B4B4B]"
      >
        ← All concepts
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        {/* teaching */}
        <article className="rounded-3xl bg-white p-6 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
          <span
            className="rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide"
            style={{ color: style.colour, backgroundColor: `${style.colour}1F` }}
          >
            {style.icon} {style.label}
          </span>
          <h1 className="mt-3 text-3xl font-black text-[#4B4B4B]">{concept.name}</h1>
          <p className="mt-1 text-lg font-bold text-[#777]">{concept.one_liner}</p>

          <div className="mt-5 space-y-4">
            {concept.teaching.split("\n\n").map((paragraph, i) => (
              <p key={i} className="text-base font-medium leading-relaxed text-[#4B4B4B]">
                {paragraph.replace(/\n/g, " ")}
              </p>
            ))}
          </div>
        </article>

        {/* examples */}
        <aside className="space-y-4">
          <div className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">
                {concept.source === "lichess" ? "Try it" : "See it"}
              </h2>
              {concept.examples.length > 1 && (
                <span className="text-xs font-extrabold text-[#AFAFAF]">
                  {index + 1} / {concept.examples.length}
                </span>
              )}
            </div>

            <div className="mt-4">
              {example?.kind === "puzzle" ? (
                <PuzzleBoard key={example.puzzle_id} puzzle={example} />
              ) : example ? (
                <PositionBoard key={`${concept.slug}-${index}`} example={example} />
              ) : (
                <p className="text-sm font-bold text-[#AFAFAF]">No example for this one yet.</p>
              )}
            </div>

            {concept.examples.length > 1 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {concept.examples.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    aria-label={`Example ${i + 1}`}
                    className={`h-8 w-8 rounded-xl text-xs font-black transition ${
                      i === index
                        ? "bg-[#1CB0F6] text-white"
                        : "bg-[#F4F4F4] text-[#AFAFAF] hover:bg-[#EDEDED]"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="px-2 text-[11px] font-bold leading-relaxed text-[#C4C4C4]">
            {concept.source === "lichess"
              ? "Puzzles from the Lichess puzzle database (CC0), filtered to this motif and checked move by move."
              : "Position written for this concept and machine-checked — the feature it teaches is verified to actually be present."}
          </p>
        </aside>
      </div>
    </div>
  );
}
