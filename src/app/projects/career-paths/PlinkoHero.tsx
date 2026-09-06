"use client";

/**
 * Tab one: the controls, the board, and the direct labels that say what the
 * three settled distributions mean.
 */

import { useEffect, useMemo, useState } from "react";

import type { Persona, Stage, Track3 } from "./engine/types.ts";
import { fmtDollars } from "./format";
import PlinkoBoard, { trackStats, type TrackStats } from "./PlinkoBoard";
import type { Model } from "./useModel";
import type { TrackRun } from "./useSimulation";

export interface PlinkoHeroProps {
  model: Model | null;
  runs: TrackRun[] | null;
  persona: Persona;
  stage: Stage | null;
  stay: boolean;
  onPersona: (p: Persona) => void;
  onStage: (s: Stage | null) => void;
  onStay: (b: boolean) => void;
  onReplay: () => void;
  active: boolean;
}

const STAGES: { id: Stage | null; label: string }[] = [
  { id: null, label: "Blended" },
  { id: "seed", label: "Seed" },
  { id: "seriesAB", label: "Series A-B" },
  { id: "growth", label: "Growth" },
  { id: "bootstrapped", label: "Bootstrapped" },
  { id: "pe", label: "PE-backed" },
];

const LABELS: Record<Track3, string> = { startup: "Startup", corporate: "Corporate", consulting: "Consulting" };
const COLORS: Record<Track3, string> = { startup: "var(--startup)", corporate: "var(--corporate)", consulting: "var(--consulting)" };

function title(stats: TrackStats[], stay: boolean): string {
  const by = Object.fromEntries(stats.map((s) => [s.track, s])) as Record<Track3, TrackStats>;
  const su = by.startup;
  const gap = by.corporate.median - su.median;
  const cmp = gap > 5000
    ? `${fmtDollars(gap)} a year below a corporate start`
    : gap < -5000 ? `${fmtDollars(-gap)} a year above a corporate start` : "within a rounding error of a corporate start";
  const tail = su.leap1M > 0
    ? `${su.leap1M} of the 1,000 startup careers had a single year over $1M, and ${su.over1M === 0 ? "none" : su.over1M} averaged that much over thirty.`
    : "No startup career had a single year over $1M.";
  return `A startup first job landed at a median of ${fmtDollars(su.median)} a year over thirty years, ${cmp}${stay ? ", with nobody switching tracks" : ""}. ${tail}`;
}

export default function PlinkoHero(p: PlinkoHeroProps) {
  const [replayKey, setReplayKey] = useState(0);
  const [skip, setSkip] = useState(false);
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  const stats = useMemo(() => (p.runs ? p.runs.map(trackStats) : null), [p.runs]);

  return (
    <div className="cp-plinko" data-tour="plinko">
      <div className="cp-controls" data-tour="controls">
        <div className="cp-control">
          <span className="cp-kicker">The graduate</span>
          <div className="cp-seg">
            {(["nontechnical", "technical"] as Persona[]).map((id) => (
              <button
                key={id} type="button" className={`cp-btn ${p.persona === id ? "active" : ""}`}
                onClick={() => p.onPersona(id)} data-tel="cp-persona" data-tel-project="career-paths"
              >
                {id === "technical" ? "Technical" : "Non-technical"}
              </button>
            ))}
          </div>
        </div>
        <div className="cp-control">
          <span className="cp-kicker">The startup&apos;s stage</span>
          <div className="cp-seg">
            {STAGES.map((s) => (
              <button
                key={s.label} type="button" className={`cp-btn ${p.stage === s.id ? "active" : ""}`}
                onClick={() => p.onStage(s.id)} data-tel="cp-stage" data-tel-project="career-paths"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="cp-control">
          <span className="cp-kicker">Switching</span>
          <label className="cp-toggle">
            <input type="checkbox" checked={p.stay} onChange={(e) => p.onStay(e.target.checked)} data-tel="cp-stay" data-tel-project="career-paths" />
            Stay the course for 30 years
          </label>
        </div>
        <div className="cp-control" style={{ marginLeft: "auto" }}>
          <span className="cp-kicker">Drop</span>
          <div className="cp-seg">
            <button type="button" className="cp-btn" onClick={() => { setSkip(false); setReplayKey((k) => k + 1); p.onReplay(); }} data-tel="cp-replay" data-tel-project="career-paths">
              Replay
            </button>
            <button type="button" className="cp-btn" onClick={() => { setSkip(true); setReplayKey((k) => k + 1); }} data-tel="cp-skip" data-tel-project="career-paths">
              Skip to the end
            </button>
          </div>
        </div>
      </div>

      {stats && (
        <>
          <p className="cp-chart-title">{title(stats, p.stay)}</p>
          <p className="cp-chart-sub">
            Each ball is one simulated career. It falls one row per year, sitting at that year&apos;s realized pay
            (salary plus any equity actually turned into cash, in 2026 dollars, log scale), then settles on its
            thirty-year average.
          </p>
        </>
      )}

      {p.runs && stats ? (
        <PlinkoBoard runs={p.runs} stats={stats} active={p.active} replayKey={replayKey} reduced={reduced || skip} />
      ) : (
        <div className="cp-loading">Simulating three thousand careers…</div>
      )}

      {stats && (
        <>
          <div className="cp-plinko-legend">
            {stats.map((s) => (
              <span key={s.track}>
                <span className="cp-swatch" style={{ background: COLORS[s.track] }} />
                {LABELS[s.track]} <span className="cp-num">1,000 careers</span>
              </span>
            ))}
            <span className="cp-num">Hover a settled ball for its story</span>
          </div>
          <div className="cp-plinko-stats" data-tour="stats">
            {stats.map((s) => (
              <div className="cp-plinko-stat" key={s.track}>
                <div className="cp-kicker">
                  <span className="cp-swatch" style={{ background: COLORS[s.track] }} />
                  {LABELS[s.track]} first
                </div>
                <dl>
                  <dt>Median 30-yr average</dt><dd>{fmtDollars(s.median)}</dd>
                  <dt>10th to 90th percentile</dt><dd>{fmtDollars(s.p10)} to {fmtDollars(s.p90)}</dd>
                  <dt>Averaged under $100K</dt><dd>{s.under100K} of 1,000</dd>
                  <dt>Any single year over $1M</dt><dd>{s.leap1M} of 1,000</dd>
                  <dt>Averaged over $1M</dt><dd>{s.over1M} of 1,000</dd>
                </dl>
              </div>
            ))}
          </div>
          <p className="cp-plinko-foot">
            The three cohorts share one model: the same pay curves, layoff odds, promotion clocks and, at each
            milestone, the same chances of switching tracks, going to business school or founding something.
            Only the first job differs. Stage changes re-drop the startup balls alone. Sources for every number
            are on the <a href="/projects/career-paths/methodology">methodology page</a>.
          </p>
        </>
      )}
    </div>
  );
}
