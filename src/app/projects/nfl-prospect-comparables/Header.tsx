"use client";

import Link from "next/link";
import { POSITION_COLORS, type Position } from "./types";
import WantMore from "@/app/_subscribe/WantMore";

export type FilterMode = "ALL" | Position;

interface Props {
  filter: FilterMode;
  onFilterChange: (filter: FilterMode) => void;
}

const CHIPS: { id: FilterMode; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "QB", label: "QB" },
  { id: "RB", label: "RB" },
  { id: "WR", label: "WR" },
  { id: "TE", label: "TE" },
];

export default function Header({ filter, onFilterChange }: Props) {
  const chips = (
    <div className="pointer-events-auto flex items-center gap-1.5 bg-white/70 backdrop-blur-sm px-1.5 py-1 rounded-full border border-stone-200 shadow-sm">
      {CHIPS.map((c) => {
        const active = filter === c.id;
        const accent =
          c.id === "ALL" ? "#1a1a1a" : POSITION_COLORS[c.id as Position];
        return (
          <button
            key={c.id}
            onClick={() => onFilterChange(c.id)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              active ? "text-white" : "text-stone-500 hover:text-stone-900"
            }`}
            style={active ? { backgroundColor: accent } : undefined}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Desktop: title block + chips on one row, overlaying the graph. */}
      <header className="hidden md:block absolute top-0 left-0 right-0 z-10 px-6 py-4 pointer-events-none">
        <div className="flex items-center justify-between gap-4">
          <div className="pointer-events-auto">
            <h1 className="text-lg font-semibold tracking-tight text-stone-900">
              NFL Prospect Comparables
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              1,048 prospects · 2014–2026 · click any node ·{" "}
              <Link
                href="/projects/nfl-prospect-comparables/methodology"
                className="text-stone-400 hover:text-stone-700 transition-colors underline-offset-2 hover:underline"
              >
                methodology
              </Link>
            </p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {chips}
            <WantMore
              project="nfl-prospect-comparables"
              className="inline-flex shrink-0 items-center rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-xs font-medium text-stone-500 shadow-sm backdrop-blur-sm transition-colors hover:text-stone-900"
            />
          </div>
        </div>
      </header>

      {/* Mobile: chips strip below the chat bar, methodology link on a
          quieter second line below the chips. The h1/subtitle are dropped
          at this width — page metadata covers the title. */}
      <header className="md:hidden absolute left-0 right-0 z-10 px-3 pointer-events-none top-14">
        <div className="flex flex-col items-center gap-1.5">
          {chips}
          <Link
            href="/projects/nfl-prospect-comparables/methodology"
            className="pointer-events-auto text-[11px] text-stone-500 hover:text-stone-900 underline-offset-2 hover:underline transition-colors"
          >
            methodology
          </Link>
        </div>
      </header>
    </>
  );
}
