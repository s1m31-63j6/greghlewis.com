import type { Metadata } from "next";
import Link from "next/link";

import { AnalysisBoard } from "./AnalysisBoard";
import WantMore from "@/app/_subscribe/WantMore";

export const metadata: Metadata = {
  title: "Analysis Board · Greg Lewis",
  description:
    "Move either side, paste in a position from your own game, and see the engine's top choices with the odds attached.",
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
            href="/projects/chess-coach/library"
            className="text-xs font-extrabold uppercase tracking-wide text-[#1CB0F6] transition hover:text-[#1899D6]"
          >
            📚 The library
          </Link>
          <WantMore
            project="chess-coach"
            className="ml-auto rounded-full border-2 border-[#E5E5E5] px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-[#AFAFAF] transition hover:border-[#1CB0F6] hover:text-[#1CB0F6]"
          />
        </nav>

        <header className="mb-7">
          <h1 className="text-4xl font-black leading-tight text-[#4B4B4B] sm:text-5xl">
            Analysis Board 🔎
          </h1>
          <p className="mt-2 max-w-2xl text-lg font-bold text-[#777]">
            Move either side, as often as you like. Paste in a position from your own game and the
            engine shows its top four moves — with what each one does to your chances.
          </p>
        </header>

        <AnalysisBoard />

        <footer className="mt-10 max-w-3xl text-xs font-bold leading-relaxed text-[#C4C4C4]">
          Runs entirely in your browser on{" "}
          <a
            href="https://github.com/official-stockfish/Stockfish"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Stockfish
          </a>{" "}
          compiled to WebAssembly — nothing is sent anywhere.
        </footer>
      </div>
    </main>
  );
}
