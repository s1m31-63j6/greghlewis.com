"use client";

/**
 * Intro to Bond Yields: the page.
 *
 * The chart leads. Under it, the five ideas that explain the chart, as a
 * carousel. State that crosses the two lives here: which episode is open,
 * which idea is highlighted, and which idea card should flash when an
 * episode card's tag sends the reader down to it.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import WantMore from "@/app/_subscribe/WantMore";

import IdeaCarousel from "./IdeaCarousel";
import YieldChart, { DATA, fmtDate } from "./YieldChart";
import type { PillarId } from "./pillars";

export const PROJECT = "bond-yields";

const last = <T,>(xs: T[]) => xs[xs.length - 1];
const [, ten] = last(DATA.series.dgs10);
const [, ff] = last(DATA.series.dff);

export default function BondYields() {
  const [active, setActive] = useState<string | null>(null);
  const [filter, setFilter] = useState<PillarId | null>(null);
  const [flash, setFlash] = useState<PillarId | null>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);

  // An episode card's idea tag: scroll the carousel to that idea and light it up.
  const jumpToPillar = useCallback((id: PillarId) => {
    document.getElementById(`idea-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "start" });
    setFlash(id);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
  }, []);

  // An idea card's episode chip: open that episode on the chart, filtered by the idea.
  const jumpToEpisode = useCallback((episodeId: string, pillar: PillarId) => {
    setFilter(pillar);
    setActive(episodeId);
    document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="by-page" data-tel-project={PROJECT}>
      <div className="by-container">
        <nav className="by-topnav">
          <Link href="/">← back to projects</Link>
          <div className="by-topnav-right">
            <WantMore project={PROJECT} className="by-want" />
          </div>
        </nav>

        <header className="by-header">
          <p className="by-kicker">Econ 101 · Treasuries · 2000 to today</p>
          <h1 className="by-display">Intro to Bond Yields</h1>
          <p className="by-dek">
            The US government borrows by selling Treasury bonds. The yield is the interest rate it pays. Today the
            10-year Treasury pays {ten.toFixed(1)}%, while the Fed&rsquo;s overnight rate is {ff.toFixed(1)}%. This
            page shows how we got here, then the five ideas that explain every turn along the way.
          </p>
          <dl className="by-now">
            <div><dt>10-year Treasury</dt><dd>{ten.toFixed(2)}%</dd></div>
            <div><dt>Fed funds (effective)</dt><dd>{ff.toFixed(2)}%</dd></div>
            <div><dt>Gap</dt><dd>{(ten - ff >= 0 ? "+" : "") + (ten - ff).toFixed(2)}</dd></div>
            <div className="by-now-asof"><dt>Data through</dt><dd>{fmtDate(DATA.asOf)}</dd></div>
          </dl>
        </header>

        <section className="by-part" id="timeline">
          <div className="by-part-head">
            <h2>Twenty-six years of the 10-year</h2>
            <p className="by-part-lede">
              The thin line is the Fed&rsquo;s rate. The thick line is the 10-year Treasury yield, which the market
              sets. Click a numbered marker to see what happened and which ideas explain it.
            </p>
          </div>
          <YieldChart active={active} setActive={setActive} filter={filter} setFilter={setFilter} onPillarJump={jumpToPillar} />
        </section>

        <section className="by-part" id="ideas">
          <div className="by-part-head">
            <h2>Five ideas that explain the chart</h2>
            <p className="by-part-lede">
              Put together: a 10-year yield is roughly the average Fed rate the market expects over the next ten
              years, plus extra pay for the ten-year wait. The five ideas below explain each piece of that and why it moves.
            </p>
          </div>
          <IdeaCarousel flash={flash} onEpisode={jumpToEpisode} />
        </section>

        <footer className="by-sources">
          <span className="by-kicker">Sources and notes</span>
          <ul>
            <li>Rates: FRED series DGS10 (10-year constant maturity) and DFF (effective fed funds), weekly closes, snapshot taken {fmtDate(DATA.asOf)}.</li>
            <li>The split of a yield into expected Fed rates plus a term premium follows Ben Bernanke&rsquo;s <em>Why Are Interest Rates So Low?</em> series (Brookings, 2015) and his 2013 speech <em>Long-Term Interest Rates</em>.</li>
            <li>Term-premium estimates cited are the New York Fed&rsquo;s ACM model and the Federal Reserve Board&rsquo;s Kim-Wright model. Resting-rate estimates are the New York Fed&rsquo;s Laubach-Williams model and the Richmond Fed&rsquo;s.</li>
            <li>2026 figures (the real-return share of the move, TIPS and breakeven levels, global comparisons, data-centre spending) are from published analyses of the 2026 sell-off by UHERO and others, as of October 2026. Episode levels are rounded from the weekly series; intraday records are named as such.</li>
            <li>This is an explainer, not advice.</li>
          </ul>
        </footer>
      </div>
    </div>
  );
}
