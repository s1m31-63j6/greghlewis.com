import type { Metadata } from "next";
import Link from "next/link";

import { PlayCoach } from "./PlayCoach";

export const metadata: Metadata = {
  title: "Chess Coach · Greg Lewis",
  description:
    "Play chess against a coach you can actually beat. Pick a strength, watch your odds move in real time, and see exactly which squares each side controls.",
};

export default function Page() {
  return (
    <main className="font-round min-h-screen bg-[#FBFBF7]">
      <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        <nav className="mb-6">
          <Link
            href="/"
            className="text-xs font-extrabold uppercase tracking-wide text-[#AFAFAF] transition hover:text-[#4B4B4B]"
          >
            ← All projects
          </Link>
          <Link
            href="/projects/chess-coach/library"
            className="ml-4 text-xs font-extrabold uppercase tracking-wide text-[#1CB0F6] transition hover:text-[#1899D6]"
          >
            📚 The library
          </Link>
        </nav>

        <header className="mb-7">
          <h1 className="text-4xl font-black leading-tight text-[#4B4B4B] sm:text-5xl">
            Chess Coach <span className="inline-block">♟️</span>
          </h1>
          <p className="mt-2 max-w-2xl text-lg font-bold text-[#777]">
            An opponent that plays at <em>your</em> level — not a crippled grandmaster. Pick a
            strength, drag a piece to see where it can go, and watch your odds swing with every move.
          </p>
        </header>

        <PlayCoach />

        <footer className="mt-10 max-w-3xl text-xs font-bold leading-relaxed text-[#C4C4C4]">
          Powered by{" "}
          <a
            href="https://github.com/official-stockfish/Stockfish"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Stockfish
          </a>
          , used unmodified via{" "}
          <a
            href="https://github.com/nmrugg/stockfish.js"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            stockfish.js
          </a>{" "}
          under the{" "}
          <a href="/chess-coach/engine/LICENSE-stockfish.txt" className="underline">
            GNU GPL v3
          </a>
          .{" "}
          <Link href="/projects/chess-coach/methodology" className="underline">
            How the strength dial was measured
          </Link>
        </footer>
      </div>
    </main>
  );
}
