import type { Metadata } from "next";
import Link from "next/link";

import { PassAndPlay } from "./PassAndPlay";

export const metadata: Metadata = {
  title: "Play a Friend · Greg Lewis",
  description:
    "Two players, one board, one screen. Take turns, take moves back, and watch who's winning as the game goes on.",
};

export default function Page() {
  return (
    <main className="font-round min-h-screen bg-[#FBFBF7]">
      <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        <nav className="mb-6 flex flex-wrap gap-4">
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
            href="/projects/chess-coach/library"
            className="text-xs font-extrabold uppercase tracking-wide text-[#1CB0F6] transition hover:text-[#1899D6]"
          >
            📚 The library
          </Link>
          <Link
            href="/projects/chess-coach/analysis"
            className="text-xs font-extrabold uppercase tracking-wide text-[#1CB0F6] transition hover:text-[#1899D6]"
          >
            🔎 Analysis board
          </Link>
        </nav>

        <header className="mb-7">
          <h1 className="text-4xl font-black leading-tight text-[#4B4B4B] sm:text-5xl">
            Play a Friend 👥
          </h1>
          <p className="mt-2 max-w-2xl text-lg font-bold text-[#777]">
            Two players, one board. Take turns, take moves back when someone wants a do-over, and
            watch the bar to see who&apos;s winning. Nobody gets told what to play — that part is
            still up to you.
          </p>
        </header>

        <PassAndPlay />

        <footer className="mt-10 max-w-3xl text-xs font-bold leading-relaxed text-[#C4C4C4]">
          The odds are worked out by{" "}
          <a
            href="https://github.com/official-stockfish/Stockfish"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Stockfish
          </a>{" "}
          running in your browser. It watches the game to tell you who&apos;s ahead, and that is all
          — it never suggests a move.
        </footer>
      </div>
    </main>
  );
}
