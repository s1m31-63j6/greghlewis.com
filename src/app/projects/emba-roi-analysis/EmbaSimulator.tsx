"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Assumptions } from "./model";
import { deltaVsBaseline, npv, simulate } from "./model";
import { PRESETS, type PresetId } from "./presets";
import { AssumptionControls } from "./AssumptionControls";
import { CashflowChart } from "./CashflowChart";
import { ScenariosChart } from "./ScenariosChart";
import { SensitivityChart } from "./SensitivityChart";
import { MethodDocs } from "./MethodDocs";
import { formatDollarsK, formatSignedDollarsK, formatPercent } from "./format";
import WantMore from "@/app/_subscribe/WantMore";

type TabId = "calculator" | "scenarios" | "sensitivity" | "method";

const TABS: { id: TabId; label: string }[] = [
  { id: "calculator", label: "The Calculator" },
  { id: "scenarios", label: "Five scenarios" },
  { id: "sensitivity", label: "Sensitivity" },
  { id: "method", label: "Method & docs" },
];

// Find the closest matching preset for the active assumptions (or null if
// the user has nudged things off any preset).
function detectPreset(a: Assumptions): PresetId | null {
  for (const preset of PRESETS) {
    const diffs: Array<keyof Assumptions> = [
      "retirementAge",
      "mbaAge",
      "tuition",
      "tuitionReimbursementRate",
      "otherCostsPerWeek",
      "programWeeks",
      "marketReturnRate",
      "inflationRate",
      "startingSalary",
      "startingSavings",
      "savingsRate",
      "tithingRate",
      "incomeTaxRate",
      "investmentIncomeTaxRate",
      "whiteCollarGrowthRate",
      "embaWageGrowthRate",
      "embaWageGrowthYears",
      "savingsDiscipline",
    ];
    const matches = diffs.every((k) => preset.assumptions[k] === a[k]);
    if (matches) return preset.id;
  }
  return null;
}

// Find the wage-growth rate (at the current growth-years setting) that
// brings Δ vs. baseline to zero. Returns null if breakeven sits outside a
// plausible range (0–40%/yr).
function findBreakevenRate(a: Assumptions): number | null {
  const candidates: number[] = [];
  for (let bp = 0; bp <= 400; bp += 5) candidates.push(bp / 1000);
  let lastDelta = -Infinity;
  for (const r of candidates) {
    const { deltaNpv } = deltaVsBaseline({ ...a, embaWageGrowthRate: r });
    if (lastDelta < 0 && deltaNpv >= 0) return r;
    lastDelta = deltaNpv;
  }
  return null;
}

export default function EmbaSimulator() {
  const [tab, setTab] = useState<TabId>("calculator");
  const [assumptions, setAssumptions] = useState<Assumptions>(
    PRESETS[1].assumptions, // Median payoff as the open state
  );

  const activePresetId = useMemo(() => detectPreset(assumptions), [assumptions]);
  const activePresetLabel = useMemo(() => {
    if (!activePresetId) return "Custom scenario";
    return PRESETS.find((p) => p.id === activePresetId)!.label;
  }, [activePresetId]);

  const { scenarioRows, baselineRows, deltaNpv } = useMemo(
    () => deltaVsBaseline(assumptions),
    [assumptions],
  );

  const scenarioNpv = useMemo(() => npv(scenarioRows), [scenarioRows]);
  const baselineNpv = useMemo(() => npv(baselineRows), [baselineRows]);

  const breakevenRate = useMemo(
    () => findBreakevenRate(assumptions),
    [assumptions],
  );

  const yearsToRetirement = assumptions.retirementAge - assumptions.mbaAge;

  return (
    <div className="emba-page">
      <div className="emba-top-nav">
        <Link href="/">← back to projects</Link>
      </div>

      <header className="emba-masthead">
        <div className="emba-masthead-inner">
          <div className="emba-kicker-row">
            <p className="emba-kicker">Decision analysis · 2024</p>
            <WantMore project="emba-roi-analysis" className="emba-want-more" />
          </div>
          <h1 className="emba-h1">Is the EMBA Worth It?</h1>
          <p className="emba-dek">
            A scenario calculator for a mid-career professional weighing
            whether a top-tier Executive MBA pays back over a 25-to-30-year
            horizon — sweeping cost, salary boost, lost wages, market
            returns, and the savings discipline that quietly does most of
            the work.
          </p>
        </div>
      </header>

      <nav className="emba-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`emba-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === "calculator" && (
          <section className="emba-panel">
            <div className="emba-container">
              <div className="emba-lede">
                <h2>Run a scenario</h2>
                <p className="emba-subhead">
                  Pick a preset or nudge the sliders. The chart shows the
                  real-terms investment balance year by year, against the
                  same household&rsquo;s trajectory with no program.
                </p>
              </div>

              <div className="emba-pillrow" role="tablist" aria-label="Scenario preset">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`emba-pill ${activePresetId === p.id ? "active" : ""}`}
                    onClick={() => setAssumptions(p.assumptions)}
                  >
                    {p.label}
                  </button>
                ))}
                {activePresetId === null && (
                  <span
                    className="emba-pill active"
                    style={{ cursor: "default" }}
                  >
                    Custom
                  </span>
                )}
              </div>

              <div className="emba-stat-row">
                <div className="emba-stat-cell">
                  <div className="k">Year-{yearsToRetirement} nest egg</div>
                  <div className="v">{formatDollarsK(scenarioNpv)}</div>
                  <div className="sub">In today&rsquo;s dollars.</div>
                </div>
                <div className="emba-stat-cell">
                  <div className="k">Baseline (no program)</div>
                  <div className="v">{formatDollarsK(baselineNpv)}</div>
                  <div className="sub">Same household, no EMBA.</div>
                </div>
                <div className="emba-stat-cell">
                  <div className="k">Δ vs baseline</div>
                  <div
                    className={`v ${deltaNpv >= 0 ? "pos" : "neg"}`}
                  >
                    {formatSignedDollarsK(deltaNpv)}
                  </div>
                  <div className="sub">
                    {deltaNpv >= 0
                      ? "Program clears the market-return hurdle."
                      : "Program underperforms the market-return baseline."}
                  </div>
                </div>
                <div className="emba-stat-cell">
                  <div className="k">Breakeven wage growth</div>
                  <div className="v">
                    {breakevenRate === null
                      ? "—"
                      : formatPercent(breakevenRate, 1)}
                  </div>
                  <div className="sub">
                    {breakevenRate === null
                      ? "No realistic wage growth would clear the hurdle."
                      : `Per year, over ${assumptions.embaWageGrowthYears} years.`}
                  </div>
                </div>
              </div>

              <div className="emba-sim-grid">
                <AssumptionControls
                  assumptions={assumptions}
                  onChange={setAssumptions}
                />
                <div>
                  <div className="emba-chart-block">
                    <h3>Real-terms investment balance over time</h3>
                    <p className="emba-caption">
                      Solid line: the active scenario&rsquo;s investment account
                      in year-0 dollars. Dotted line: the same household with
                      no program. The shaded band is the gap.
                    </p>
                    <div className="emba-plot">
                      <CashflowChart
                        scenarioRows={scenarioRows}
                        baselineRows={baselineRows}
                        scenarioLabel={activePresetLabel}
                      />
                    </div>
                  </div>

                  <div className="emba-notebox">
                    <h4>Reading this chart honestly</h4>
                    <p>
                      The two lines look close because both are dominated by
                      market returns on the starting balance. The story is
                      the <em>gap</em>, not the slope. A $50k delta over 25
                      years of compounding is a meaningful claim about the
                      program; a $5k delta is rounding error against
                      assumption uncertainty.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "scenarios" && (
          <section className="emba-panel">
            <div className="emba-container">
              <div className="emba-lede">
                <h2>Five scenarios, same chart</h2>
                <p className="emba-subhead">
                  Held against the same baseline household: a Modest, Median,
                  and Strong realized payoff; a Career-pivot case paying full
                  freight on a longer horizon; and the no-program baseline
                  itself, plotted dotted in gray.
                </p>
              </div>

              <div className="emba-chart-block">
                <h3>Investment balance over time, by scenario</h3>
                <p className="emba-caption">
                  Each line uses each scenario&rsquo;s own assumptions —
                  including the Career-pivot case&rsquo;s longer 30-year
                  horizon. The visible separation between presets is what
                  the EMBA decision is worth, before any non-monetary
                  considerations.
                </p>
                <div className="emba-plot" style={{ height: 480 }}>
                  <ScenariosChart />
                </div>
              </div>

              <div className="emba-notebox">
                <h4>Where the presets come from</h4>
                <p>
                  <strong>Modest / Median / Strong</strong> use a $150k
                  starting salary, $45k of prior savings, age-40 program
                  start, 50% employer reimbursement, and 5/10/15% wage
                  growth for 3/4/5 years — covering the realistic range of
                  published industry outcomes.
                </p>
                <p>
                  <strong>Career pivot</strong> models a mid-30s candidate
                  paying full tuition out of pocket, with median wage growth
                  but a longer 30-year window to retirement. It exposes how
                  much of the &ldquo;is it worth it&rdquo; question is
                  actually about who&rsquo;s funding the program.
                </p>
                <p>
                  <strong>Baseline</strong> takes the same household and
                  applies only standard 4% white-collar growth. No tuition,
                  no boost. This is the reference line everything else is
                  measured against.
                </p>
              </div>
            </div>
          </section>
        )}

        {tab === "sensitivity" && (
          <section className="emba-panel">
            <div className="emba-container">
              <div className="emba-lede">
                <h2>Where does it break even?</h2>
                <p className="emba-subhead">
                  Holding all other assumptions at the active scenario&rsquo;s
                  values, sweep the two most consequential variables: how
                  much wage growth the program produces, and how long it
                  lasts before reverting to standard white-collar growth.
                </p>
              </div>

              <div className="emba-chart-block">
                <h3>Δ vs. baseline (real-terms nest egg) at retirement</h3>
                <p className="emba-caption">
                  Red cells underperform the no-program baseline; green
                  cells exceed it. The contour between the two is the honest
                  answer to whether the EMBA pays back at any given pair of
                  wage-growth and duration assumptions.
                </p>
                <div className="emba-plot" style={{ height: 380 }}>
                  <SensitivityChart base={assumptions} />
                </div>
              </div>

              <div className="emba-notebox">
                <h4>Two assumptions that quietly do the work</h4>
                <p>
                  Toggle the <strong>savings discipline</strong> control on
                  the Calculator tab and re-open this chart. Under the
                  constant-rate default, breakeven sits in aggressive
                  territory — sustained double-digit growth for several
                  years. Under the &ldquo;save the marginal gain&rdquo;
                  alternative, the green region expands dramatically: even
                  modest wage gains become highly profitable, because the
                  household is banking 100% of the after-tax marginal income
                  rather than letting lifestyle absorb it.
                </p>
                <p>
                  The realistic answer for most households is somewhere
                  between the two — closer to the constant rate than to
                  perfect marginal discipline, but not all the way to either.
                </p>
              </div>
            </div>
          </section>
        )}

        {tab === "method" && (
          <section className="emba-panel">
            <div className="emba-container">
              <div className="emba-lede">
                <h2>Method &amp; docs</h2>
                <p className="emba-subhead">
                  How the model is structured, what it captures, and the
                  large categories of value it deliberately leaves on the
                  table.
                </p>
              </div>
              <MethodDocs />
            </div>
          </section>
        )}
      </main>

      <footer className="emba-footer">
        <div className="emba-container">
          <p>Greg Lewis · Decision analysis · 2024</p>
          <p className="meta">
            All projections are deterministic and run client-side in the
            browser. Adjust any slider and the chart recomputes immediately;
            no values are stored or transmitted.
          </p>
        </div>
      </footer>
    </div>
  );
}
