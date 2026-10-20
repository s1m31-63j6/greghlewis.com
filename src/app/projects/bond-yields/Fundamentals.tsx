"use client";

/**
 * Bond Fundamentals: the five ideas as five tabs, each a chart that shows
 * the idea rather than a paragraph that tells it. Every chart is the same
 * print: ink-A halftone or line, ink-B flat area, one or two callouts, the
 * current level as the one big number.
 */

import { useMemo } from "react";

import { Caption, SwipeSelect } from "@/app/_paper/Paper";

import {
  Axes, BigNumber, Callout, Crosshair, Dim, Halftone, HitArea, Readout, S, T0, NARROW,
  areaPath, at, extreme, fmt, fmtDate, geometry, last, linePath, useHover, useWidth, utc, type G, type Pt, type Row,
} from "./chart";
import { PILLARS, PILLAR_BY_ID, type PillarId } from "./pillars";

const FRED = (id: string) => ({ label: `FRED ${id}`, href: `https://fred.stlouisfed.org/series/${id}` });

interface ChartProps { width: number }

export default function Fundamentals({ tab, setTab }: { tab: PillarId; setTab: (id: PillarId) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const Chart = CHARTS[tab];
  return (
    <>
      <div className="by-sec-head">
        <h2 className="wp-h2">Bond Fundamentals</h2>
        <SwipeSelect label="Idea" options={PILLARS.map((p) => ({ value: p.id, label: p.tab }))} value={tab} onChange={setTab} tel="by-tab" />
      </div>
      <p className="wp-lab by-idea-note">{PILLAR_BY_ID[tab].note}</p>
      <div ref={ref} className={`by-chart${width < NARROW ? " is-narrow" : ""}`}>
        <div key={tab} className="wp-reink"><Chart width={width} /></div>
      </div>
    </>
  );
}

/** Two levels in the right margin, nudged apart when they would overlap. */
function apart(g: G, a: number, b: number): [number, number] {
  let [ya, yb] = [g.y(a), g.y(b)];
  if (Math.abs(ya - yb) < 56) {
    const mid = (ya + yb) / 2;
    [ya, yb] = ya <= yb ? [mid - 28, mid + 28] : [mid + 28, mid - 28];
  }
  return [ya, yb];
}

function Plot({ g, hover, rows, label, extra, children }: {
  g: G; hover: ReturnType<typeof useHover>; rows: Row[]; label: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="by-plot">
      <svg width={g.W} height={g.H} viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label} onPointerLeave={hover.clear}>
        <Halftone id="by-ht2" />
        {children}
        {hover.t !== null && <Crosshair g={g} t={hover.t} rows={rows} />}
        <HitArea g={g} onMove={hover.onMove} />
      </svg>
      {hover.t !== null && <Readout g={g} t={hover.t} rows={rows} extra={extra} />}
    </div>
  );
}

/* ── I. A yield is a real return plus inflation ──────────────────────── */

const REAL = S.dfii10;
const BE = S.t10yie;
const NOM: Pt[] = REAL.map((p) => ({ ...p, v: p.v + at(BE, p.t).v }));

function RealInflation({ width }: ChartProps) {
  const g = useMemo(() => geometry(width, { t0: REAL[0].t, v0: 0, v1: 6 }), [width]);
  const hover = useHover(g);
  const rows: Row[] = [
    { label: "10-year", pts: NOM, swatch: "line" },
    { label: "Real return", pts: REAL, swatch: "halftone" },
    { label: "Expected inflation", pts: BE, swatch: "flat" },
  ];
  const low = extreme(REAL, "min");
  const [nom, be, real] = [last(NOM), last(BE), last(REAL)];
  const dx = g.x1 + 16;
  return (
    <>
      <Plot g={g} hover={hover} rows={rows} label="The 10-year yield split into real return and expected inflation, 2003 to today">
        <path d={areaPath(g, NOM)} fill="url(#by-ht2)" />
        <path d={areaPath(g, BE)} fill="var(--b)" />
        <path d={linePath(g, NOM)} fill="none" stroke="var(--a)" strokeWidth={1.6} strokeLinejoin="round" />
        <Axes g={g} ticks={[1, 3, 5]} firstYear={2003} />
        {!g.narrow && (
          <Callout g={g} t={low.t} v={at(NOM, low.t).v} label="Inflation above the yield: real return below zero"
            sub={`${fmt(low.v)}% in ${fmtDate(low.d, false)}`} dy={-175} dx={40} anchor="end" />
        )}
        <Dim g={g} x={dx} va={be.v} vb={nom.v} label="" />
        <Dim g={g} x={dx} va={0} vb={be.v} label="" />
        <text x={dx - 6} y={g.y(nom.v) - 12} className="by-dim-l">{fmt(nom.v)} = the yield</text>
        <BigNumber x={dx + 18} y={(g.y(be.v) + g.y(nom.v)) / 2 + 8} value={fmt(real.v)} label="real return" />
        <BigNumber x={dx + 18} y={(g.y(0) + g.y(be.v)) / 2 + 8} value={fmt(be.v)} label={g.narrow ? "inflation" : "expected inflation"} tone="ink" />
      </Plot>
      <Caption title="A yield is a real return plus inflation"
        legend={[{ swatch: "halftone", label: "Real return" }, { swatch: "flat", label: "Expected inflation" }]}
        sources={[FRED("DFII10"), FRED("T10YIE")]} />
    </>
  );
}

/* ── II. A 10-year yield is a bet on where the Fed is going ──────────── */

const TWO = S.dgs2;
const DFF = S.dff;

function BetOnFed({ width }: ChartProps) {
  const g = useMemo(() => geometry(width, { t0: T0, v0: 0, v1: 7 }), [width]);
  const hover = useHover(g);
  const rows: Row[] = [{ label: "2-year", pts: TWO, swatch: "halftone" }, { label: "Fed funds", pts: DFF, swatch: "flat" }];
  const firstHike = utc("2022-03-11");
  const [two, ff] = [last(TWO), last(DFF)];
  const [yTwo, yFf] = apart(g, two.v, ff.v);
  return (
    <>
      <Plot g={g} hover={hover} rows={rows} label="The 2-year Treasury yield and the fed funds rate, 2000 to today"
        extra={<small>Gap<em>{fmt(at(TWO, hover.t ?? 0).v - at(DFF, hover.t ?? 0).v)}</em></small>}>
        <path d={areaPath(g, TWO)} fill="url(#by-ht2)" />
        <path d={areaPath(g, DFF)} fill="var(--b)" />
        <path d={linePath(g, TWO)} fill="none" stroke="var(--a)" strokeWidth={1.6} strokeLinejoin="round" />
        <Axes g={g} ticks={[1, 3, 5, 7]} firstYear={2000} />
        {!g.narrow && (
          <Callout g={g} t={firstHike} v={at(TWO, firstHike).v} label="The 2-year moves first"
            sub="Up a point and a half before the first hike, March 2022" dy={-76} dx={30} anchor="end" />
        )}
        <BigNumber x={g.x1 + 18} y={yTwo + 8} value={fmt(two.v)} label="the 2-year" />
        <BigNumber x={g.x1 + 18} y={yFf + 8} value={fmt(ff.v)} label="fed funds" tone="ink" />
      </Plot>
      <Caption title="The 2-year makes the same bet, with less waiting"
        legend={[{ swatch: "halftone", label: "2-year, set by the market" }, { swatch: "flat", label: "Fed funds, set by the Fed" }]}
        sources={[FRED("DGS2"), FRED("DFF")]} />
    </>
  );
}

/* ── III. The Fed's job is to balance inflation and unemployment ─────── */

const CPI = S.cpi;
const UN = S.unrate;

function FedsJob({ width }: ChartProps) {
  const g = useMemo(() => geometry(width, { t0: T0, v0: -2, v1: 15 }), [width]);
  const hover = useHover(g);
  const rows: Row[] = [{ label: "Inflation", pts: CPI, swatch: "line", digits: 1 }, { label: "Unemployment", pts: UN, swatch: "flat", digits: 1 }];
  const hiCpi = extreme(CPI, "max");
  const hiUn = extreme(UN, "max");
  const [cpi, un] = [last(CPI), last(UN)];
  const [yCpi, yUn] = apart(g, cpi.v, un.v);
  return (
    <>
      <Plot g={g} hover={hover} rows={rows} label="Inflation over the prior year and the unemployment rate, monthly, 2000 to today">
        <path d={areaPath(g, UN)} fill="var(--b)" />
        <line x1={g.x0} x2={g.x1} y1={g.y(2)} y2={g.y(2)} stroke="var(--a)" strokeWidth={1} strokeDasharray="1.5 3.5" />
        <text x={g.x0 + 6} y={g.y(2) - 6} className="wp-ax">2% inflation target</text>
        <path d={linePath(g, CPI)} fill="none" stroke="var(--a)" strokeWidth={1.8} strokeLinejoin="round" />
        <Axes g={g} ticks={[0, 5, 10, 15]} firstYear={2000} />
        {!g.narrow && (
          <>
            <Callout g={g} t={hiUn.t} v={hiUn.v} label={`Unemployment at ${fmt(hiUn.v, 1)}%: the Fed cut to zero`} sub={fmtDate(hiUn.d, false)} dy={-14} dx={-16} anchor="end" />
            <Callout g={g} t={hiCpi.t} v={hiCpi.v} label={`Inflation at ${fmt(hiCpi.v, 1)}%: the Fed raised fast`} sub={fmtDate(hiCpi.d, false)} dy={-60} dx={20} anchor="end" />
          </>
        )}
        <BigNumber x={g.x1 + 18} y={yCpi + 8} value={fmt(cpi.v, 1)} label="inflation" />
        <BigNumber x={g.x1 + 18} y={yUn + 8} value={fmt(un.v, 1)} label="unemployment" tone="ink" />
      </Plot>
      <Caption title="The Fed's two goals: inflation near 2%, people employed"
        legend={[{ swatch: "line", label: "Inflation, over a year" }, { swatch: "flat", label: "Unemployment" }]}
        sources={[FRED("CPIAUCSL"), FRED("UNRATE")]} />
    </>
  );
}

/* ── IV. Lenders charge extra to lock money up for ten years ─────────── */

const TP = S.tp;

function TermPremium({ width }: ChartProps) {
  const g = useMemo(() => geometry(width, { t0: T0, v0: -1, v1: 2 }), [width]);
  const hover = useHover(g);
  const rows: Row[] = [{ label: "Term premium", pts: TP, swatch: "halftone" }];
  const low = extreme(TP, "min");
  const tp = last(TP);
  return (
    <>
      <Plot g={g} hover={hover} rows={rows} label="The 10-year term premium, Kim-Wright estimate, weekly, 2000 to today">
        <path d={areaPath(g, TP, 0, "above")} fill="url(#by-ht2)" />
        <path d={areaPath(g, TP, 0, "below")} fill="var(--b)" />
        <path d={linePath(g, TP)} fill="none" stroke="var(--a)" strokeWidth={1.6} strokeLinejoin="round" />
        <Axes g={g} ticks={[-1, 0, 1, 2]} firstYear={2000} />
        {!g.narrow && (
          <>
            <Callout g={g} t={low.t} v={low.v} label="Below zero: lenders asked for nothing extra" sub="The Fed was buying, and the world wanted safety" dy={-180} dx={30} anchor="end" />
            <Callout g={g} t={tp.t} v={tp.v} label="Highest since 2010" sub="Heavy borrowing, and no Fed buying" dy={-64} dx={10} anchor="end" />
          </>
        )}
        <BigNumber x={g.x1 + 18} y={g.y(tp.v) + 8} value={fmt(tp.v)} label={g.narrow ? "extra pay" : "extra pay for ten years"} />
      </Plot>
      <Caption title="Extra pay for waiting: the term premium"
        legend={[{ swatch: "halftone", label: "Investors ask extra" }, { swatch: "flat", label: "Investors ask nothing" }]}
        sources={[FRED("THREEFYTP10")]} />
    </>
  );
}

/* ── V. Every economy has a resting rate ─────────────────────────────── */

const RSTAR = S.rstar;

function RestingRate({ width }: ChartProps) {
  const g = useMemo(() => geometry(width, { t0: T0, v0: 0, v1: 4 }), [width]);
  const hover = useHover(g);
  const rows: Row[] = [{ label: "Resting rate", pts: RSTAR, swatch: "halftone" }];
  const low = extreme(RSTAR, "min");
  const r = last(RSTAR);
  return (
    <>
      <Plot g={g} hover={hover} rows={rows} label="The natural rate of interest, Laubach-Williams estimate, quarterly, 2000 to today">
        <path d={areaPath(g, RSTAR)} fill="url(#by-ht2)" />
        <path d={linePath(g, RSTAR)} fill="none" stroke="var(--a)" strokeWidth={1.6} strokeLinejoin="round" />
        <Axes g={g} ticks={[1, 2, 3]} firstYear={2000} />
        {!g.narrow && (
          <>
            <Callout g={g} t={low.t} v={low.v} label="Under 1% through the 2010s" sub="An ageing, saving world" dy={-110} />
            <Callout g={g} t={r.t} v={r.v} label="Revised up" sub="Data centres and deficits" dy={-70} dx={10} anchor="end" />
          </>
        )}
        <BigNumber x={g.x1 + 18} y={g.y(r.v) + 8} value={fmt(r.v)} label="the resting rate" />
      </Plot>
      <Caption title="Where the Fed's rate settles once a cycle is over"
        legend={[{ swatch: "halftone", label: "r*, after inflation" }]}
        sources={[{ label: "New York Fed, Laubach-Williams", href: "https://www.newyorkfed.org/research/policy/rstar" }]} />
    </>
  );
}

const CHARTS: Record<PillarId, (p: ChartProps) => React.JSX.Element> = {
  fisher: RealInflation,
  expectations: BetOnFed,
  reaction: FedsJob,
  premium: TermPremium,
  neutral: RestingRate,
};
