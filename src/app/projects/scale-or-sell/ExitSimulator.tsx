"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Assumptions } from "./model";
import { metricsAtSale, simulate } from "./model";
import { PRESETS, type PresetId } from "./presets";
import { AssumptionControls } from "./AssumptionControls";
import { TrajectoryChart } from "./TrajectoryChart";
import { ScenariosChart } from "./ScenariosChart";
import { SensitivityChart } from "./SensitivityChart";
import { MethodDocs } from "./MethodDocs";
import {
  formatDollarsM,
  formatMultiple,
  formatPercent,
  formatSignedDollarsM,
} from "./format";

type TabId = "calculator" | "scenarios" | "sensitivity" | "method";

const TABS: { id: TabId; label: string }[] = [
  { id: "calculator", label: "The Calculator" },
  { id: "scenarios", label: "Five paths" },
  { id: "sensitivity", label: "Sensitivity" },
  { id: "method", label: "Method & docs" },
];

// The calculator preset row hides scenarios that don't make sense as
// "starting points" for tuning — patient build is just build-to-sell with a
// later date, and aggressive is just a stronger lift. The full set still
// shows up on the Five Paths tab.
const CALCULATOR_PRESET_IDS: PresetId[] = [
  "sell-now",
  "organic-glide",
  "build-to-sell",
];

function detectPreset(a: Assumptions): PresetId | null {
  for (const preset of PRESETS) {
    const diffs: Array<keyof Assumptions> = [
      "startingArr",
      "startingHeadcount",
      "saleTargetMonths",
      "organicGrowthMonthly",
      "restructureLift",
      "rampMonths",
      "ebitdaMargin",
      "ebitdaMultiple",
      "contractorArrCapacity",
    ];
    const matches = diffs.every((k) => preset.assumptions[k] === a[k]);
    if (matches) return preset.id;
  }
  return null;
}

export default function ExitSimulator() {
  const [tab, setTab] = useState<TabId>("calculator");
  const [assumptions, setAssumptions] = useState<Assumptions>(
    PRESETS.find((p) => p.id === "build-to-sell")!.assumptions,
  );

  const activePresetId = useMemo(
    () => detectPreset(assumptions),
    [assumptions],
  );

  // Always run all three paths so the chart can show the comparison even
  // when the user has nudged the sliders off any preset.
  const buildRows = useMemo(
    () => simulate(assumptions, { withRestructure: true }),
    [assumptions],
  );
  const organicRows = useMemo(
    () => simulate(assumptions, { withRestructure: false }),
    [assumptions],
  );
  const sellNowValue = useMemo(
    () =>
      assumptions.startingArr *
      assumptions.ebitdaMargin *
      assumptions.ebitdaMultiple,
    [assumptions],
  );

  const showRestructureLine =
    activePresetId !== "sell-now" && activePresetId !== "organic-glide";

  // The "active scenario" exit value: the line the headline numbers anchor
  // to. Sell-now and organic-glide use their respective trajectories; every
  // other state assumes the build path.
  const activeFinalRows = showRestructureLine ? buildRows : organicRows;
  const activeMetrics = metricsAtSale(activeFinalRows);
  const activeExitValue =
    activePresetId === "sell-now" ? sellNowValue : activeMetrics.exitValue;

  // Δ vs. sell now is the editorial number — the founder's headline question.
  const deltaVsSellNow = activeExitValue - sellNowValue;
  // Δ vs. organic glide isolates the contribution of the restructuring
  // decision specifically, holding the timing constant.
  const deltaVsOrganic =
    activeExitValue - organicRows[organicRows.length - 1].exitValue;

  const activePresetLabel =
    activePresetId === null
      ? "Custom scenario"
      : PRESETS.find((p) => p.id === activePresetId)!.label;

  return (
    <div className="exit-page">
      <div className="exit-top-nav">
        <Link href="/">← back to projects</Link>
      </div>

      <header className="exit-masthead">
        <div className="exit-masthead-inner">
          <p className="exit-kicker">Strategic analysis · 2025</p>
          <h1 className="exit-h1">Sell now, or build to sell?</h1>
          <p className="exit-dek">
            A founder-led B2B services firm at $25M ARR, doubling year over
            year, weighing a strategic sale three years out — and whether
            investing in management infrastructure clears its own cost
            before the exit.
          </p>
        </div>
      </header>

      <nav className="exit-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`exit-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === "calculator" && (
          <section className="exit-panel">
            <div className="exit-container">
              <div className="exit-lede">
                <h2>Run a scenario</h2>
                <p className="exit-subhead">
                  Pick a preset or nudge the sliders. The chart shows the
                  exit valuation month by month under each path, against
                  the &ldquo;sell now&rdquo; benchmark.
                </p>
              </div>

              <div className="exit-pillrow" role="tablist" aria-label="Scenario preset">
                {CALCULATOR_PRESET_IDS.map((id) => {
                  const p = PRESETS.find((p) => p.id === id)!;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`exit-pill ${activePresetId === p.id ? "active" : ""}`}
                      onClick={() => setAssumptions(p.assumptions)}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {activePresetId === null && (
                  <span
                    className="exit-pill active"
                    style={{ cursor: "default" }}
                  >
                    Custom
                  </span>
                )}
              </div>

              <div className="exit-stat-row">
                <div className="exit-stat-cell">
                  <div className="k">Exit value at sale</div>
                  <div className="v accent">
                    {formatDollarsM(activeExitValue)}
                  </div>
                  <div className="sub">
                    {activePresetLabel} · {formatMultiple(assumptions.ebitdaMultiple)} EBITDA multiple.
                  </div>
                </div>
                <div className="exit-stat-cell">
                  <div className="k">Sell-now benchmark</div>
                  <div className="v">{formatDollarsM(sellNowValue)}</div>
                  <div className="sub">
                    Today&rsquo;s EBITDA at today&rsquo;s multiple.
                  </div>
                </div>
                <div className="exit-stat-cell">
                  <div className="k">Δ vs sell now</div>
                  <div className={`v ${deltaVsSellNow >= 0 ? "pos" : "neg"}`}>
                    {formatSignedDollarsM(deltaVsSellNow)}
                  </div>
                  <div className="sub">
                    What the wait is worth, all-in.
                  </div>
                </div>
                <div className="exit-stat-cell">
                  <div className="k">Δ vs organic glide</div>
                  <div className={`v ${deltaVsOrganic >= 0 ? "pos" : "neg"}`}>
                    {formatSignedDollarsM(deltaVsOrganic)}
                  </div>
                  <div className="sub">
                    What restructuring contributes, holding timing fixed.
                  </div>
                </div>
              </div>

              <div className="exit-sim-grid">
                <AssumptionControls
                  assumptions={assumptions}
                  onChange={setAssumptions}
                />
                <div>
                  <div className="exit-chart-block">
                    <h3>Exit valuation over time, by path</h3>
                    <p className="exit-caption">
                      Dotted red line: a flat sell-now benchmark. Dashed pale
                      blue: organic compounding only. Solid navy: build-to-sell
                      with the restructure lift applied. The gap between the
                      navy and pale-blue lines is what the management
                      infrastructure contributes; the gap to the red dotted
                      line is what the wait pays for.
                    </p>
                    <div className="exit-plot">
                      <TrajectoryChart
                        buildRows={buildRows}
                        organicRows={organicRows}
                        sellNowValue={sellNowValue}
                        saleTargetMonths={assumptions.saleTargetMonths}
                        withRestructure={showRestructureLine}
                      />
                    </div>
                  </div>

                  <div className="exit-notebox">
                    <h4>Reading this chart honestly</h4>
                    <p>
                      The three lines look closer than the dollar values
                      suggest because compounding is patient: most of the
                      separation between paths happens in the back half of
                      the build. The early months show the cost of
                      restructuring — partial lift, full management
                      overhead — and the late months show the payoff. A
                      sale that lands during the &ldquo;trough&rdquo; of
                      the build curve will look like a bad decision in
                      hindsight even when the strategy was correct.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "scenarios" && (
          <section className="exit-panel">
            <div className="exit-container">
              <div className="exit-lede">
                <h2>Five paths, same chart</h2>
                <p className="exit-subhead">
                  Held against the same starting state: a Sell-now benchmark,
                  an Organic glide, a median Build-to-sell case, an
                  Aggressive variant with a stronger lift and faster ramp,
                  and a Patient variant that waits an extra year before
                  the exit.
                </p>
              </div>

              <div className="exit-chart-block">
                <h3>Exit valuation over time, by scenario</h3>
                <p className="exit-caption">
                  Each line uses its own assumptions, but they share the
                  same starting ARR and the same EBITDA multiple. Lines end
                  at their respective sale-target months. The visible
                  separation between presets is what the timing decision is
                  worth before any execution risk is priced in.
                </p>
                <div className="exit-plot" style={{ height: 480 }}>
                  <ScenariosChart />
                </div>
              </div>

              <div className="exit-notebox">
                <h4>Where the presets come from</h4>
                <p>
                  <strong>Sell now</strong> is the firm&rsquo;s current
                  EBITDA at the current multiple — the do-nothing baseline,
                  held flat across the chart so the comparison reads
                  cleanly.
                </p>
                <p>
                  <strong>Organic glide</strong> reinvests cashflow but
                  doesn&rsquo;t change the operating model. Pure
                  compounding at the trailing growth rate.
                </p>
                <p>
                  <strong>Build to sell</strong> is the recommendation
                  case: a 1.3%/mo growth lift coming online over ten months
                  as new managers and directors come up to speed.
                </p>
                <p>
                  <strong>Aggressive</strong> is the bull case for the same
                  strategy — a stronger lift, ramped twice as fast.
                  Available to firms with deep bench strength or aggressive
                  hiring capacity; rare in practice.
                </p>
                <p>
                  <strong>Patient build</strong> takes the median lift but
                  waits an extra year before selling. Lets compounding
                  carry more of the weight, at the cost of a year of
                  founder time and a year of market risk.
                </p>
              </div>
            </div>
          </section>
        )}

        {tab === "sensitivity" && (
          <section className="exit-panel">
            <div className="exit-container">
              <div className="exit-lede">
                <h2>Where does the math change?</h2>
                <p className="exit-subhead">
                  Holding all other assumptions at the active
                  scenario&rsquo;s values, sweep the two most consequential
                  variables: how much extra growth restructuring actually
                  unlocks, and how long the founders are willing to wait
                  before selling.
                </p>
              </div>

              <div className="exit-chart-block">
                <h3>Δ exit value vs. sell now, by lift and patience</h3>
                <p className="exit-caption">
                  Cells show the additional exit value over the sell-now
                  benchmark. Time dominates: even a half-strength lift
                  produces a much larger delta with another year of
                  compounding. A zero-lift column (the leftmost) is the
                  organic-glide path — useful for separating
                  &ldquo;wait longer&rdquo; from &ldquo;restructure&rdquo;
                  as independent decisions.
                </p>
                <div className="exit-plot" style={{ height: 380 }}>
                  <SensitivityChart base={assumptions} />
                </div>
              </div>

              <div className="exit-notebox">
                <h4>The two variables that quietly do the work</h4>
                <p>
                  Reading across rows, doubling the lift roughly doubles the
                  delta within a given horizon. Reading down columns, adding
                  twelve months of patience does the same thing — at zero
                  execution cost. Founders who underestimate the cost of
                  waiting tend to overestimate the cost of restructuring.
                </p>
                <p>
                  Two cells that almost-tie:{" "}
                  <em>(strong lift, short horizon)</em> and{" "}
                  <em>(modest lift, long horizon)</em>. Mathematically
                  similar; operationally very different. The first asks the
                  organization for a hard execution sprint. The second asks
                  the founders for patience and discipline. Which one a
                  given firm should pick is not a question the model can
                  answer.
                </p>
              </div>
            </div>
          </section>
        )}

        {tab === "method" && (
          <section className="exit-panel">
            <div className="exit-container">
              <div className="exit-lede">
                <h2>Method &amp; docs</h2>
                <p className="exit-subhead">
                  What the model captures, what it deliberately leaves out,
                  and the analytical claim it&rsquo;s built to support.
                </p>
              </div>
              <MethodDocs />
            </div>
          </section>
        )}
      </main>

      <footer className="exit-footer">
        <div className="exit-container">
          <p>Greg Lewis · Strategic analysis · 2025</p>
          <p className="meta">
            All identifying details about the source engagement have been
            removed. Numbers are abstracted to round figures; the structural
            model is faithful to the analysis the founders actually used.
            Projections are deterministic and run client-side; no values are
            stored or transmitted.{" "}
            {Math.round(assumptions.organicGrowthMonthly * 1200) / 100}% annualized organic ·{" "}
            {formatPercent(assumptions.ebitdaMargin)} EBITDA margin ·{" "}
            {formatMultiple(assumptions.ebitdaMultiple)} multiple.
          </p>
        </div>
      </footer>
    </div>
  );
}
