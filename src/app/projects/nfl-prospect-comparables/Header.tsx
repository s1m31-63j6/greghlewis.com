"use client";

import Link from "next/link";
import { POSITION_COLORS, type Position } from "./types";

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
  return (
    <header className="absolute top-0 left-0 right-0 z-10 px-6 py-4 pointer-events-none">
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
                  active
                    ? "text-white"
                    : "text-stone-500 hover:text-stone-900"
                }`}
                style={active ? { backgroundColor: accent } : undefined}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
