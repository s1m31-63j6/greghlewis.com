"use client";

import { useState } from "react";

/**
 * Load a position to analyse.
 *
 * FEN and PGN cover the case this board exists for: you have a position from
 * somewhere else — your club game, a book, a puzzle — and you want to know what
 * to play. Both fail loudly with the parser's own message rather than silently
 * leaving the previous position on the board.
 */
export function PositionSetup({
  onFen,
  onPgn,
  onReset,
}: {
  onFen: (fen: string) => string | null;
  onPgn: (pgn: string) => string | null;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const value = text.trim();
    if (!value) return;
    // A PGN has move numbers or tag pairs; a FEN is one line of slashes.
    const looksLikePgn = value.includes("[") || /\b1\s*\./.test(value);
    const problem = looksLikePgn ? onPgn(value) : onFen(value);
    setError(problem);
    if (!problem) {
      setText("");
      setOpen(false);
    }
  };

  return (
    <section className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-extrabold uppercase tracking-wide text-[#777]">
          Position
        </h2>
        <button
          onClick={onReset}
          className="rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-[#4B4B4B] ring-2 ring-[#E5E5E5] transition active:translate-y-[1px]"
        >
          ↺ Start
        </button>
        <button
          onClick={() => setOpen((on) => !on)}
          className="rounded-xl bg-[#1CB0F6] px-3 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_0_#1899D6] transition active:translate-y-[2px]"
        >
          📋 Paste FEN / PGN
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Paste a FEN, or a whole PGN…"
            className="w-full resize-y rounded-2xl bg-[#FBFBF7] px-3 py-2 font-mono text-xs text-[#4B4B4B] outline-none ring-2 ring-[#E5E5E5] focus:ring-[#1CB0F6]"
          />
          {error && <p className="text-xs font-extrabold text-[#FF4B4B]">{error}</p>}
          <button
            onClick={load}
            className="w-full rounded-2xl bg-[#58CC02] py-2.5 text-xs font-extrabold uppercase tracking-wide text-white shadow-[0_3px_0_0_#46A302] transition active:translate-y-[2px]"
          >
            Load
          </button>
        </div>
      )}
    </section>
  );
}
