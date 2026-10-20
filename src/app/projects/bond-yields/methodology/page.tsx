import type { Metadata } from "next";

import { DottedRule, InkLink, PaperShell } from "@/app/_paper/Paper";

import { DATA, fmtDate } from "../data";
import { INKS, PAPER_NO, PROJECT } from "../paper";
import "../styles.css";
import "./methodology.css";

export const metadata: Metadata = {
  title: "Intro to Bond Yields — How it was built · Greg Lewis",
  description: "The data behind the paper, where the five ideas come from, and how the page is printed.",
};

const FRED = (id: string) => <InkLink href={`https://fred.stlouisfed.org/series/${id}`}>{id}</InkLink>;

export default function Page() {
  return (
    <PaperShell
      no={PAPER_NO}
      title="How it was built"
      note="The notes behind Intro to Bond Yields: where each series comes from, whose ideas the five ideas are, and how the page is printed."
      inks={INKS}
      project={PROJECT}
      meta={[
        { label: "Paper", value: `No. ${PAPER_NO}` },
        { label: "Author", value: "Greg Lewis" },
        { label: "Revised", value: fmtDate(DATA.asOf) },
        { label: "Data", value: <InkLink href="https://fred.stlouisfed.org/">FRED, St. Louis Fed</InkLink> },
      ]}
      links={[
        { href: "/projects/bond-yields", label: "Back to the paper" },
        { href: `/updates?from=${PROJECT}`, label: "Want more?", tel: "want-more" },
      ]}
    >
      <DottedRule />
      <section className="by-sec bym">
        <h2 className="wp-h2">Data</h2>
        <p>
          Every chart draws a snapshot of public series, taken {fmtDate(DATA.asOf)}. The timeline uses the 10-year constant-maturity
          yield ({FRED("DGS10")}) and the effective fed funds rate ({FRED("DFF")}). The fundamentals use the 10-year TIPS yield
          ({FRED("DFII10")}) and breakeven inflation ({FRED("T10YIE")}), the 2-year yield ({FRED("DGS2")}), the consumer price index
          ({FRED("CPIAUCSL")}, shown as the change over twelve months) and the unemployment rate ({FRED("UNRATE")}), and the Kim-Wright
          term premium ({FRED("THREEFYTP10")}). The resting rate is the New York Fed&rsquo;s{" "}
          <InkLink href="https://www.newyorkfed.org/research/policy/rstar">Laubach-Williams estimate</InkLink>, quarterly, one-sided.
        </p>
        <p>
          Daily series are reduced to the last observation of each week. One script fetches everything and writes one JSON file into
          the page bundle, so the page has no server and the &ldquo;revised&rdquo; date in the footer is the one thing that moves.
        </p>

        <h2 className="wp-h2">The five ideas</h2>
        <p>
          The split of a long yield into the expected path of the Fed&rsquo;s rate plus a term premium follows Ben Bernanke&rsquo;s
          2013 speech <em>Long-Term Interest Rates</em> and his 2015 Brookings series <em>Why Are Interest Rates So Low?</em>. The split
          of any yield into a real return plus expected inflation is Irving Fisher&rsquo;s. The Fed&rsquo;s job as a balance of inflation
          and unemployment is the dual mandate, read through a Taylor-rule lens. The term premium shown is the Federal Reserve
          Board&rsquo;s Kim-Wright model; the New York Fed&rsquo;s ACM model tells the same story with different levels. The resting rate is
          r*, estimated rather than observed, and the chart shows one estimate of it.
        </p>

        <h2 className="wp-h2">The episodes</h2>
        <p>
          Levels on the episode cards are read from the weekly series the chart draws, rounded to a tenth; intraday records are named
          as such. Figures for 2026 (the real-return share of the move, TIPS and breakeven levels, global comparisons, data-centre
          spending) are from published analyses of the 2026 sell-off, as of October 2026.
        </p>

        <h2 className="wp-h2">The print</h2>
        <p>
          The page is a Next.js app. Charts are hand-written SVG: an ink-A halftone for the series the market sets, a flat ink-B area for
          the one the Fed sets, and never more than the two inks overlapping. The look is the site&rsquo;s Working Papers system: one
          typeface, two printed inks per paper, dotted rules, and interactions that draw rather than snap.
        </p>
      </section>
    </PaperShell>
  );
}
