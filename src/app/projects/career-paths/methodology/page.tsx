import type { Metadata } from "next";
import Link from "next/link";

import WantMore from "@/app/_subscribe/WantMore";

import params from "../../../../../public/career-paths/params.json";
import reference from "../../../../../public/career-paths/reference.json";
import validation from "../../../../../public/career-paths/validation.json";
import { flatten, type SourcedRow } from "../engine/params.ts";
import { fmtDollars } from "../format";
import "../styles.css";
import "./methodology.css";

export const metadata: Metadata = {
  title: "Should You Join a Startup? — Methodology · Greg Lewis",
  description:
    "How the career simulation works: one engine for the plinko and the sankey, every parameter "
    + "with its source, the benchmarks it is held to, and where it is honest about guessing.",
};

type Cohort = {
  n: number;
  avg30: { mean: number; median: number; p10: number; p90: number; over1M: number };
  ltv: { median: number; p10: number; p90: number };
  equity: { median: number; p90: number; anyPayday: number };
};
type Check = { check: string; value: number; low: number; high: number; ok: boolean; source: string };

const COHORTS = reference.cohorts as Record<string, Cohort>;
const CHECKS = validation.checks as Check[];
const ROWS: SourcedRow[] = flatten(params);

const GROUPS: [string, string, (p: string) => boolean][] = [
  ["pay", "Starting pay and pay curves", (p) => p.startsWith("start") || p.startsWith("levelMult") || p.startsWith("ability") || p === "discountRate"],
  ["ladders", "Promotion clocks, counseling out, layoffs", (p) => p.startsWith("promotion") || p.startsWith("layoff")],
  ["startup", "Startup stages and equity", (p) => p.startsWith("startup") || p.startsWith("vest") || p.startsWith("cliff") || p.startsWith("secondaryFrac") || p.startsWith("stageMix") || p.startsWith("rejoin")],
  ["moves", "Business school, founding, and switching", (p) => p.startsWith("gradschool") || p.startsWith("founder") || p.startsWith("choice")],
  ["demand", "Life and cash demand", (p) => p.startsWith("demand")],
];

function fmtValue(v: unknown): string {
  if (typeof v !== "number") return String(v);
  if (Number.isInteger(v) && v >= 1000) return v >= 100_000 ? fmtDollars(v) : v.toLocaleString();
  if (v > 0 && v < 1 && v.toString().length > 6) return v.toExponential(2);
  return v.toString();
}

function fmtCheck(v: number): string {
  if (v > 1000) return fmtDollars(v);
  if (v === 0 || v === 1) return v.toString();
  return v < 1 && v > 0 ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);
}

function CohortRow({ label, c }: { label: string; c: Cohort }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{fmtDollars(c.avg30.p10)}</td>
      <td className="num">{fmtDollars(c.avg30.median)}</td>
      <td className="num">{fmtDollars(c.avg30.p90)}</td>
      <td className="num">{fmtDollars(c.ltv.median)}</td>
      <td className="num">{c.equity.anyPayday}</td>
      <td className="num">{c.avg30.over1M}</td>
    </tr>
  );
}

const PERSONAS = [["nontechnical", "Non-technical grad"], ["technical", "Technical grad"]] as const;
const TRACKS = [["startup", "Startup"], ["corporate", "Corporate"], ["consulting", "Consulting"]] as const;
const STAGES = [["seed", "seed"], ["seriesAB", "Series A-B"], ["growth", "growth"], ["bootstrapped", "bootstrapped"], ["pe", "PE-backed"]] as const;

export default function Methodology() {
  const measured = ROWS.filter((r) => r.kind === "measured").length;
  const estimated = ROWS.filter((r) => r.kind === "estimated").length;
  const sources = Array.from(new Map(ROWS.filter((r) => r.url).map((r) => [r.url!, r.source])).entries());

  return (
    <div className="cp-page cp-method">
      <div className="cp-container">
        <nav className="cp-topnav">
          <Link href="/projects/career-paths">← back to the simulation</Link>
          <WantMore project="career-paths" className="cp-want" />
        </nav>

        <header className="cp-method-header">
          <div className="cp-kicker">Methodology</div>
          <h1 className="cp-display">How the careers are simulated</h1>
          <p className="cp-lede">
            One engine drives both the plinko and the choose-your-own sankey. This page walks through
            it step by step, lists every parameter with its source, shows the benchmarks the model is
            held to, and says plainly where it is guessing.
          </p>
        </header>

        <div className="cp-method-body">
          <section id="what">
            <h2>1. What one ball is</h2>
            <p>
              A ball is one career: a fresh graduate who takes a first job at a startup, a corporation
              or a consulting firm, then lives through thirty-five years of pay, promotions, layoffs,
              shutdowns, exits and the occasional decision to do something else. The plinko drops
              1,000 balls per first job and shows the first thirty years. The sankey walks one ball at
              a time through the same engine with the reader making the choices.
            </p>
            <p>
              The three cohorts are identical in every respect except the first job. Same pay curves,
              same promotion clocks, same odds of a layoff, the same chance at each milestone of
              moving to another track, going to business school or founding a company. That is the
              point: the plinko isolates the first decision, then lets the rest of a working life
              happen to it.
            </p>
          </section>

          <section id="year">
            <h2>2. What happens in a year</h2>
            <p>Each year, in this order:</p>
            <ol>
              <li><b>Leave school.</b> A ball two years into an MBA graduates, lands one rung higher on the track it chose, and carries a pay lift.</li>
              <li><b>Milestone choice.</b> After years 3, 5, 10, 15, 20 and 30 the ball may stay, switch to another track, go to business school (through year 5), or found a company (years 5 to 15). In the plinko the choice is sampled from a track-specific propensity that decays with age; in the sankey the reader pins it.</li>
              <li><b>The company rolls.</b> Every company the ball still holds equity in raises its next round on schedule (diluting the holding and moving up a stage, if it graduates), shuts down, exits, or runs a tender. The employer rolls first.</li>
              <li><b>Consequences.</b> A shutdown or a layoff costs a few months of pay and a persistent scar; a startup employee then either joins another startup or goes corporate. An exit pays out and folds the ball into the acquirer. Otherwise the promotion clock ticks, and in consulting the counseled-out roll follows a missed promotion.</li>
              <li><b>Pay.</b> Starting pay for the persona, times the rung multiplier, times a persistent ability draw, times the scar or lift, times a small annual noise, plus any equity turned into cash that year.</li>
            </ol>
            <p>
              The ball&apos;s x position in row t of the plinko is that year&apos;s realized pay on a log axis.
              An MBA pins it to the left wall for two years; a liquidity event throws it right. It
              settles on its thirty-year average.
            </p>
          </section>

          <section id="equity">
            <h2>3. Equity is a lottery ticket, not salary</h2>
            <p>
              The single most common mistake in a career comparison is to count a startup grant at its
              paper value as if it were pay. Here a grant is a ticket that pays only when its company
              exits, and then only this much:
            </p>
            <pre className="cp-method-code">{`vested  = 0 before the one-year cliff, then years / 4, capped at 1
diluted = grant % x (1 - dilution) for every round raised since the hire
common  = max(0, exit value - preference stack)
payout  = diluted x vested x common x (1 - strike / preferred price)`}</pre>
            <p>
              Leaving before the exit keeps the ticket only if the options are exercised, which Carta
              finds most people do not do. Kept tickets keep rolling, so a ball can leap right years
              after it moved on. Tenders at growth and PE stages let a fifth of a vested holding out
              early. Bootstrapped and PE-backed employers grant nothing to a new hire, which is the
              honest reading of the sources.
            </p>
            <h3>Where a naive model lies, and what this one does instead</h3>
            <ul>
              <li>Carta&apos;s round, valuation and exit tables describe companies still on Carta. Shutdown rates come from cohort data (Carta graduation rates, PitchBook&apos;s Series C cohort, BLS survival), and the exit medians are shaded down for undisclosed acquihires.</li>
              <li>Per-round dilution of 12 to 22 percent shrinks a seed grant three to five times by the time a company exits.</li>
              <li>A 1x non-participating preference stack (96 percent of rounds) zeroes common at any sale below the money raised. Roughly half of seed-era exits leave employees with nothing.</li>
              <li>Consulting attrition is not failure: counseled-out consultants land one rung up in corporate jobs, which is where most of the value of consulting shows up.</li>
              <li>Without a persistent ability draw every distribution is far too narrow; with it, and no correlation to track, the spread inside a cohort is honest and the difference between cohorts is still the first job.</li>
            </ul>
          </section>

          <section id="results">
            <h2>4. Reference results</h2>
            <p>
              One thousand careers per cohort under a fixed seed, first thirty years. These are the
              numbers the browser must reproduce (section 7).
            </p>
            {PERSONAS.map(([pid, plabel]) => (
              <div key={pid} className="cp-table-wrap">
                <table className="cp-table">
                  <thead>
                    <tr>
                      <th>{plabel}</th>
                      <th className="num">p10</th>
                      <th className="num">Median</th>
                      <th className="num">p90</th>
                      <th className="num">Lifetime median</th>
                      <th className="num">$100K+ payday</th>
                      <th className="num">Avg over $1M</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TRACKS.map(([t, tl]) => (
                      <CohortRow key={t} label={`${tl} first, realistic`} c={COHORTS[`${pid}|${t}|blended|free`]} />
                    ))}
                    {TRACKS.map(([t, tl]) => (
                      <CohortRow key={`${t}-stay`} label={`${tl} first, never switching`} c={COHORTS[`${pid}|${t}|blended|stay`]} />
                    ))}
                    {STAGES.map(([s, sl]) => (
                      <CohortRow key={s} label={`Startup at ${sl}, never switching`} c={COHORTS[`${pid}|startup|${s}|stay`]} />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <p className="cp-method-small">
              p10, median and p90 are of the thirty-year average of realized annual pay in 2026
              dollars. Lifetime is the undiscounted thirty-five-year sum. A payday is $100K or more of
              equity cash in any year.
            </p>
          </section>

          <section id="benchmarks">
            <h2>5. Benchmarks the model is held to</h2>
            <p>
              <code>verify.py</code> runs 4,000 careers per check and exits nonzero if any lands
              outside the range the sources support. All {CHECKS.length} pass in the shipped build.
            </p>
            <div className="cp-table-wrap">
              <table className="cp-table">
                <thead>
                  <tr><th>Check</th><th className="num">Value</th><th className="num">Range</th><th>Basis</th></tr>
                </thead>
                <tbody>
                  {CHECKS.map((c) => (
                    <tr key={c.check}>
                      <td>{c.check}</td>
                      <td className="num">{fmtCheck(c.value)}</td>
                      <td className="num">{fmtCheck(c.low)} to {fmtCheck(c.high)}</td>
                      <td className="cp-method-small">{c.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="parameters">
            <h2>6. Every parameter and where it came from</h2>
            <p>
              {ROWS.length} values. <b>{measured}</b> are read directly off a source, <b>{estimated}</b>{" "}
              are estimates with the reasoning stated, and the rest are derived from other rows. The
              research notes behind them are in the repository under{" "}
              <code>projects/career-paths/research/</code>. All money is 2026 real dollars.
            </p>
            {GROUPS.map(([gid, glabel, pick]) => {
              const rows = ROWS.filter((r) => pick(r.path));
              return (
                <details key={gid} className="cp-method-group" open={gid === "startup"}>
                  <summary>
                    <span>{glabel}</span>
                    <span className="cp-num">{rows.length} values</span>
                  </summary>
                  <div className="cp-table-wrap">
                    <table className="cp-table cp-method-params">
                      <thead>
                        <tr><th>Parameter</th><th className="num">Value</th><th>Kind</th><th>Source and note</th></tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.path}>
                            <td className="cp-mono cp-method-path">{r.path}</td>
                            <td className="num">{fmtValue(r.value)}</td>
                            <td><span className={`cp-method-kind ${r.kind}`}>{r.kind}</span></td>
                            <td className="cp-method-small">
                              {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.source}</a> : r.source}
                              {r.note ? <span className="cp-method-note"> {r.note}</span> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </section>

          <section id="two">
            <h2>7. Two implementations, one model</h2>
            <p>
              The engine is written in Python and ported line for line to TypeScript so the browser can
              re-simulate when the reader changes the persona or the stage. Two implementations are two
              chances to be wrong, so both are driven from the same seeded generator (mulberry32, four
              lines in each language) and a parity test requires 500 careers to agree exactly on every
              event, track and rung, and to within one part in a billion on every dollar. A second gate
              re-runs the reference cohorts above through the shipped TypeScript and fails if any
              statistic drifts by more than half a percent. Both run before every publish.
            </p>
          </section>

          <section id="limits">
            <h2>8. Limitations</h2>
            <ul>
              <li><b>Balls are assigned, people self-select.</b> Somebody who takes a seed-stage job at 22 is not a random graduate. The ability draw widens every cohort but is uncorrelated with the first job; the real world may not be.</li>
              <li><b>&ldquo;Corporate&rdquo; is a blend.</b> For the technical persona it mixes big-tech pay with the far larger population of engineers elsewhere; for the non-technical persona it is a Fortune 500 analyst track. A reader with a specific offer in hand should compare against that offer, not the blend.</li>
              <li><b>Pre-tax, real dollars, no geography.</b> Nothing here is after tax, and a $200K year in San Francisco is not a $200K year in Columbus.</li>
              <li><b>Survivor bias in the sources.</b> Most private-market data comes from Carta, which sees companies that are alive, organized and venture-backed. The failure mass is spliced in from cohort data and that splice is an estimate.</li>
              <li><b>Consulting&apos;s exit premium is folklore.</b> No study measures what a counseled-out consultant earns against a peer who never consulted; the one-rung bump is a judgment call.</li>
              <li><b>Milestone choices are the least sourced part.</b> The propensity to switch, go to school or found is estimated from turnover and enrollment rates, and the &ldquo;stay the course&rdquo; toggle exists so a reader can remove that layer entirely.</li>
            </ul>
          </section>

          <section id="sources">
            <h2>9. Sources</h2>
            <ul className="cp-method-sources">
              {sources.map(([url, name]) => (
                <li key={url}><a href={url} target="_blank" rel="noreferrer">{name}</a></li>
              ))}
            </ul>
            <p className="cp-method-small">
              Stack: Python 3.12 for the reference engine and calibration, TypeScript for the browser port,
              canvas for the plinko, hand-laid SVG for the sankey, Amazon Bedrock (Claude Sonnet 4.6) for
              the &ldquo;ask about this&rdquo; box on the brief, grounded in the brief&apos;s own text.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
