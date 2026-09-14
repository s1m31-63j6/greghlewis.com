import type { Metadata } from "next";
import Link from "next/link";

import { TrackRecord } from "./TrackRecord";

export const metadata: Metadata = {
  title: "Start/Sit — Track record · Greg Lewis",
  description: "How the market's lines did against what happened, week by week.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <nav className="mb-8 flex items-center justify-between gap-4">
        <Link href="/projects/start-sit" className="text-xs uppercase tracking-wider text-slate-500 transition hover:text-slate-900">
          ← Back to the advisor
        </Link>
        <Link href="/projects/start-sit/methodology" className="text-xs uppercase tracking-wider text-slate-500 transition hover:text-slate-900">
          Methodology
        </Link>
      </nav>
      <header className="mb-8">
        <h1 className="font-serif text-3xl leading-tight text-slate-900 sm:text-4xl">Track record</h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          Every week the lines are scored against what happened: how close the expected
          points came, whether the floor-to-ceiling band held, whether the touchdown prices
          were honest, and how often the verdict was right at each size of gap. Nothing here
          is smoothed. Where a number is bad it stays bad, and the method changes only when the
          evidence says so.
        </p>
      </header>
      <TrackRecord />
    </main>
  );
}
