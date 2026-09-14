"use client";

import { useEffect, useState } from "react";

interface Summ { n: number; mae?: number; bias?: number }
interface Week {
  week: number;
  games: number;
  evaluatedAt: string;
  snapshots: { sha: string; builtAt: string; snapshot: string; priced: number;
    story: { bias: number; mae: number }; band: Record<string, { n: number; inside?: number; below?: number; above?: number }> }[];
  final: {
    sha: string; builtAt: string;
    perStat: Record<string, { n: number; mae: number; bias: number; overRate: number }>;
    band: Record<string, { n: number; inside?: number; below?: number; above?: number }>;
    touchdowns: { n: number; brier?: number; brierRaw?: number; baseRate?: number; meanP?: number; meanPRaw?: number;
      buckets?: { from: number; to: number; n: number; predicted: number; scored: number }[] };
    points: Record<string, { ours: Summ; bookFantasyLine: Summ; lastSeasonAvg: Summ; pickemOnly: Summ }>;
    verdict: { pairs: number; overallHit: number; brierPWin: number;
      byGap: { from: number; to: number | null; n: number; hitRate: number; meanPWin: number }[];
      byPWin: { from: number; to: number; n: number; predicted: number; won: number }[];
      suggested: { minGap: number; hitRate: number; n: number } | null };
    story: { n: number; bias: number; mae: number;
      hot: { name: string; pos: string; team: string; projected: number; actual: number; diff: number }[];
      cold: { name: string; pos: string; team: string; projected: number; actual: number; diff: number }[] };
    perBook: Record<string, Record<string, { n: number; mae: number }>>;
    booksFrom: string | null;
  };
}
interface Eval { weeks: Record<string, Week>; target: { bandInside: number; verdictHit: number } }

const STAT_LABEL: Record<string, string> = {
  pass_yds: "Passing yards", pass_tds: "Passing TDs", ints: "Interceptions", rush_yds: "Rushing yards",
  rush_att: "Carries", rec: "Receptions", rec_yds: "Receiving yards",
};
const pct = (x?: number) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const num = (x?: number, d = 1) => (x == null ? "—" : x.toFixed(d));
const signed = (x?: number, d = 1) => (x == null ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(d)}`);
const cell = (s: Summ) => ("mae" in s && s.mae != null ? `${num(s.mae)} / ${signed(s.bias)}` : "—");

/** Predicted vs realized, one hue, direct labels with n. */
function Reliability({ rows, xLabel, yLabel }: {
  rows: { x: number; y: number; n: number }[]; xLabel: string; yLabel: string;
}) {
  const W = 380, H = 240, P = 36, PR = 70;
  const sx = (v: number) => P + v * (W - P - PR);
  const sy = (v: number) => H - P - v * (H - 2 * P);
  // Labels sit right of a point unless it is in the crowded top-right, where
  // they go left; ties in height are nudged apart in draw order.
  const placed = rows.map((r) => ({ ...r, y: r.y }));
  const seen: number[] = [];
  const labelY = (y: number) => {
    let yy = sy(y) + 3;
    while (seen.some((v) => Math.abs(v - yy) < 11)) yy -= 11;
    seen.push(yy);
    return yy;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px]" role="img" aria-label={`${yLabel} against ${xLabel}`}>
      <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="#c9cbc6" strokeDasharray="3 3" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <text x={sx(t)} y={H - P + 14} fontSize="9" textAnchor="middle" fill="#8b9098">{Math.round(t * 100)}%</text>
          <text x={P - 6} y={sy(t) + 3} fontSize="9" textAnchor="end" fill="#8b9098">{Math.round(t * 100)}%</text>
        </g>
      ))}
      {placed.map((r, i) => {
        const left = r.x > 0.62;
        return (
          <g key={i}>
            <circle cx={sx(r.x)} cy={sy(r.y)} r={Math.max(4, Math.min(11, Math.sqrt(r.n)))} fill="#1b4f7a" fillOpacity="0.85" />
            <text x={sx(r.x) + (left ? -13 : 13)} y={labelY(r.y)} fontSize="9.5" fill="#3b3f47" textAnchor={left ? "end" : "start"}>
              {pct(r.y)} of {r.n}
            </text>
          </g>
        );
      })}
      <text x={W / 2} y={H - 4} fontSize="9.5" textAnchor="middle" fill="#6b7079">{xLabel}</text>
      <text x={10} y={12} fontSize="9.5" fill="#6b7079">{yLabel}</text>
    </svg>
  );
}

export function TrackRecord() {
  const [data, setData] = useState<Eval | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/start-sit/eval.json").then((r) => r.json()).then(setData).catch(() => setError("No evaluation has been published yet."));
  }, []);
  if (error) return <p className="text-slate-600">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  const weeks = Object.values(data.weeks).sort((a, b) => b.week - a.week);

  return (
    <div className="space-y-14 text-[15px] leading-relaxed text-slate-700">
      {weeks.map((w) => {
        const f = w.final;
        const band = f.band.half;
        return (
          <section key={w.week} className="space-y-8">
            <h2 className="font-serif text-2xl text-slate-900">Week {w.week} <span className="text-base text-slate-500">· {w.games} games · lines as of {f.builtAt.slice(0, 16).replace("T", " ")} UTC</span></h2>

            <div>
              <h3 className="mb-2 font-serif text-xl text-slate-900">The week</h3>
              <p>
                Actual half-PPR scoring ran <strong>{signed(f.story.bias)} points per player</strong> against the
                market across {f.story.n} fully priced players, with a mean absolute error of {num(f.story.mae)}.
                The floor-to-ceiling band held <strong>{pct(band.inside)}</strong> of the time (target {pct(data.target.bandInside)});
                {" "}{pct(band.above)} finished above the ceiling and {pct(band.below)} below the floor.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {(["hot", "cold"] as const).map((k) => (
                  <div key={k}>
                    <p className="mb-1 text-xs uppercase tracking-wider text-slate-500">{k === "hot" ? "Biggest overs" : "Biggest unders"}</p>
                    <ul className="text-sm">
                      {f.story[k].slice(0, 6).map((r) => (
                        <li key={r.name} className="flex justify-between border-b border-slate-100 py-1">
                          <span>{r.name} <span className="text-slate-400">{r.pos} {r.team}</span></span>
                          <span className="font-mono text-[13px]">{num(r.projected)} → {num(r.actual)} <span className={r.diff > 0 ? "text-emerald-700" : "text-red-700"}>({signed(r.diff)})</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-serif text-xl text-slate-900">Who predicted best</h3>
              <p className="mb-3">Mean absolute error and bias in full-PPR points, by position. Lower error is better; bias is actual minus projected.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-1">Pos</th><th>Market (ours)</th><th>Books&rsquo; fantasy line</th><th>2025 average</th></tr></thead>
                  <tbody>
                    {Object.entries(f.points).map(([pos, t]) => (
                      <tr key={pos} className="border-t border-slate-100 font-mono text-[13px]">
                        <td className="py-1 font-sans font-semibold">{pos}</td>
                        <td>{cell(t.ours)} <span className="text-slate-400">n={t.ours.n}</span></td>
                        <td>{cell(t.bookFantasyLine)}</td>
                        <td>{cell(t.lastSeasonAvg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Object.keys(f.perBook).length > 0 && (
                <>
                  <p className="mt-4 mb-2">By book, mean absolute error of the posted line{f.booksFrom === "raw pull" ? " (from a Saturday pull; the pipeline began archiving per-book lines after week 1)" : ""}:</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="py-1">Book</th><th>All lines</th>{["rush_yds", "rec", "rec_yds", "pass_yds"].map((s) => <th key={s}>{STAT_LABEL[s]}</th>)}</tr></thead>
                      <tbody>
                        {Object.entries(f.perBook).sort((a, b) => a[1].all.mae - b[1].all.mae).map(([book, t]) => (
                          <tr key={book} className="border-t border-slate-100 font-mono text-[13px]">
                            <td className="py-1 font-sans">{book}</td>
                            <td>{num(t.all.mae, 2)} <span className="text-slate-400">n={t.all.n}</span></td>
                            {["rush_yds", "rec", "rec_yds", "pass_yds"].map((s) => <td key={s}>{t[s] ? num(t[s].mae, 2) : "—"}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-serif text-xl text-slate-900">Each market</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-1">Stat</th><th>n</th><th>MAE</th><th>Bias</th><th>Went over the line</th></tr></thead>
                  <tbody>
                    {Object.entries(f.perStat).map(([k, t]) => (
                      <tr key={k} className="border-t border-slate-100 font-mono text-[13px]">
                        <td className="py-1 font-sans">{STAT_LABEL[k] ?? k}</td><td>{t.n}</td><td>{num(t.mae)}</td><td>{signed(t.bias)}</td><td>{pct(t.overRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-serif text-xl text-slate-900">Touchdowns</h3>
                <p className="mb-2">
                  {f.touchdowns.n} priced players; {pct(f.touchdowns.baseRate)} scored. The scaled price predicted {pct(f.touchdowns.meanP)},
                  the raw price {pct(f.touchdowns.meanPRaw)}. Brier {num(f.touchdowns.brier, 3)} scaled, {num(f.touchdowns.brierRaw, 3)} raw (lower is better).
                </p>
                {f.touchdowns.buckets && (
                  <Reliability rows={f.touchdowns.buckets.map((b) => ({ x: b.predicted, y: b.scored, n: b.n }))}
                    xLabel="predicted chance to score" yLabel="share who scored" />
                )}
              </div>
              <div>
                <h3 className="mb-2 font-serif text-xl text-slate-900">The verdict</h3>
                <p className="mb-2">
                  Across {f.verdict.pairs} same-position pairs the higher projection won {pct(f.verdict.overallHit)}.
                  {f.verdict.suggested
                    ? ` The favorite first clears ${pct(data.target.verdictHit)} at a gap of ${f.verdict.suggested.minGap} points (${pct(f.verdict.suggested.hitRate)} of ${f.verdict.suggested.n}).`
                    : " No gap bucket cleared the target this week."}
                </p>
                <Reliability rows={f.verdict.byPWin.map((b) => ({ x: b.predicted, y: b.won, n: b.n }))}
                  xLabel="simulated P(A beats B)" yLabel="share where A did" />
                <ul className="mt-2 text-sm">
                  {f.verdict.byGap.map((b) => (
                    <li key={b.from} className="flex justify-between border-b border-slate-100 py-1 font-mono text-[13px]">
                      <span className="font-sans">gap {b.from}–{b.to ?? "∞"} pts</span>
                      <span>won {pct(b.hitRate)} · sim said {pct(b.meanPWin)} · n={b.n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-serif text-xl text-slate-900">Snapshot timing</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-1">Snapshot</th><th>Built (UTC)</th><th>Priced</th><th>Points MAE</th><th>Bias</th><th>Band held</th></tr></thead>
                  <tbody>
                    {w.snapshots.map((s) => (
                      <tr key={s.sha} className="border-t border-slate-100 font-mono text-[13px]">
                        <td className="py-1 font-sans">{s.snapshot} <span className="text-slate-400">{s.sha}</span></td>
                        <td>{s.builtAt.slice(0, 16).replace("T", " ")}</td><td>{s.priced}</td><td>{num(s.story.mae)}</td><td>{signed(s.story.bias)}</td><td>{pct(s.band.half.inside)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
