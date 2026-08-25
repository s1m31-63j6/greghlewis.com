import type { Metadata } from "next";
import Link from "next/link";

import { LibraryBrowser } from "./LibraryBrowser";
import WantMore from "@/app/_subscribe/WantMore";

export const metadata: Metadata = {
  title: "Chess Library · Greg Lewis",
  description:
    "Forty-four chess ideas — tactics, endgames, and strategy — each with a plain-English explanation and positions you can play through.",
};

export default function Page() {
  return (
    <main className="font-round min-h-screen bg-[#FBFBF7]">
      <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        <nav className="mb-6 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="text-xs font-extrabold uppercase tracking-wide text-[#AFAFAF] transition hover:text-[#4B4B4B]"
          >
            ← All projects
          </Link>
          <Link
            href="/projects/chess-coach"
            className="text-xs font-extrabold uppercase tracking-wide text-[#1CB0F6] transition hover:text-[#1899D6]"
          >
            ♟️ Play the coach
          </Link>
          <Link
            href="/projects/chess-coach/pass-and-play"
            className="text-xs font-extrabold uppercase tracking-wide text-[#1CB0F6] transition hover:text-[#1899D6]"
          >
            👥 Play a friend
          </Link>
          <Link
            href="/projects/chess-coach/analysis"
            className="text-xs font-extrabold uppercase tracking-wide text-[#1CB0F6] transition hover:text-[#1899D6]"
          >
            🔎 Analysis board
          </Link>
          <WantMore
            project="chess-coach"
            className="ml-auto rounded-full border-2 border-[#E5E5E5] px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-[#AFAFAF] transition hover:border-[#1CB0F6] hover:text-[#1CB0F6]"
          />
        </nav>

        <header className="mb-7">
          <h1 className="text-4xl font-black leading-tight text-[#4B4B4B] sm:text-5xl">
            The Library 📚
          </h1>
          <p className="mt-2 max-w-2xl text-lg font-bold text-[#777]">
            Forty-four ideas worth knowing, in plain English — and for the tactical ones, a puzzle
            to actually solve rather than a diagram to nod at.
          </p>
        </header>

        <LibraryBrowser />

        <footer className="mt-10 max-w-3xl text-[11px] font-bold leading-relaxed text-[#C4C4C4]">
          Puzzles from the{" "}
          <a href="https://database.lichess.org/" className="underline" target="_blank" rel="noreferrer">
            Lichess puzzle database
          </a>{" "}
          (CC0), filtered by motif from 6,057,356 puzzles and replayed move by move before
          shipping. Positional concepts have no puzzle equivalent in that data — not one is tagged —
          so those positions are written by hand and machine-checked for the feature they teach.
        </footer>
      </div>
    </main>
  );
}
