"use client";

import { useState } from "react";

import DemandBar from "./DemandBar";
import { fmtDollars } from "./format";
import { NODE_COLOR, NODE_LABEL } from "./sankeyLayout";
import type { AdventureView } from "./useAdventure";

const NODE_SENTENCE: Record<string, string> = {
  startup: "At a startup",
  corporate: "In a corporate job",
  consulting: "In consulting",
  founder: "Running your own company",
  mba: "In business school",
  partner: "A consulting partner",
  exited: "Cashed out of a company",
};

/**
 * The reader's scorecard: where they are, four numbers, two demand bars.
 * Sticky beside the board on desktop; a bottom strip that expands on tap
 * under 900px (the CSS decides which parts show).
 */
export default function AdventurePane({ view }: { view: AdventureView }) {
  const [expanded, setExpanded] = useState(false);
  const { status, year, nodeKey, pay, avg, lifetime, crowdLifetime, wealth, crowdWealth, demand } = view;

  if (status === "start" || !nodeKey) {
    return (
      <aside className="cp-adv-pane empty">
        <div className="cp-kicker">Year 0</div>
        <p className="cp-adv-pane-hint">Pick a first job. The numbers land here as the years go by.</p>
      </aside>
    );
  }

  const vsCrowd = crowdLifetime !== null && crowdLifetime > 0 ? lifetime / crowdLifetime - 1 : null;

  return (
    <aside className={`cp-adv-pane ${expanded ? "expanded" : ""}`}>
      <button
        type="button"
        className="cp-adv-pane-toggle"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="cp-kicker">Year {year}</span>
        <span className="cp-adv-pane-where">
          <span className="cp-swatch" style={{ background: NODE_COLOR[nodeKey] }} aria-hidden />
          {NODE_LABEL[nodeKey]}
        </span>
        <span className="cp-mono cp-adv-pane-strip-num">{fmtDollars(pay)}<small>/yr</small></span>
        <span className="cp-mono cp-adv-pane-strip-num">{fmtDollars(lifetime)}<small>so far</small></span>
        <span className="cp-adv-pane-strip-bars" aria-hidden>
          <DemandBar label="Life demand" value={demand[0]} thin />
          <DemandBar label="Cash strain" value={demand[1]} thin />
        </span>
        <span className="cp-adv-pane-chevron" aria-hidden>{expanded ? "▾" : "▴"}</span>
      </button>

      <div className="cp-adv-pane-full">
        <div className="cp-kicker">Year {year}</div>
        <h3 className="cp-adv-pane-title">
          <span className="cp-swatch" style={{ background: NODE_COLOR[nodeKey] }} aria-hidden />
          {NODE_SENTENCE[nodeKey] ?? NODE_LABEL[nodeKey]}
        </h3>

        <dl className="cp-adv-stats">
          <div>
            <dt className="cp-kicker">Pay this year</dt>
            <dd className="cp-mono">{fmtDollars(pay)}</dd>
          </div>
          <div>
            <dt className="cp-kicker">Average so far</dt>
            <dd className="cp-mono">{fmtDollars(avg)}</dd>
          </div>
          <div>
            <dt className="cp-kicker">Earned so far</dt>
            <dd className="cp-mono">{fmtDollars(lifetime)}</dd>
          </div>
          <div>
            <dt className="cp-kicker">vs the crowd</dt>
            <dd className="cp-mono">
              {crowdLifetime === null ? "—" : fmtDollars(crowdLifetime)}
              {vsCrowd !== null && (
                <small className={vsCrowd >= 0 ? "up" : "down"}>
                  {vsCrowd >= 0 ? "+" : "−"}{Math.round(Math.abs(vsCrowd) * 100)}%
                </small>
              )}
            </dd>
          </div>
          <div>
            <dt className="cp-kicker">Invested wealth</dt>
            <dd className="cp-mono">{fmtDollars(wealth)}</dd>
          </div>
          <div>
            <dt className="cp-kicker">Crowd&apos;s wealth</dt>
            <dd className="cp-mono">{crowdWealth === null ? "—" : fmtDollars(crowdWealth)}</dd>
          </div>
        </dl>
        <p className="cp-adv-pane-foot">
          The crowd is the median of every simulated career standing at this same node in year {year}. Wealth
          compounds savings, windfalls and employer retirement money at a real return.
        </p>

        <DemandBar label="Life demand" value={demand[0]} />
        <DemandBar label="Cash strain" value={demand[1]} />
      </div>
    </aside>
  );
}
