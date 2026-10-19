"use client";

/**
 * The timeline: the 10-year Treasury yield and the effective fed funds
 * rate, weekly since 2000, drawn in SVG. Fifteen numbered markers sit in
 * a strip above the plot at each episode's anchor date; hovering the
 * plot gives a crosshair with both values; choosing a marker opens the
 * episode card, which floats beside the marker on wide screens and sits
 * under the chart on narrow ones. A pillar filter above the chart tints
 * the episodes that pillar explains.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import raw from "./data/yields.json";
import { EPISODES, type Episode } from "./episodes";
import { PILLARS, PILLAR_BY_ID, type PillarId } from "./pillars";

type Pt = { t: number; v: number; d: string };
type Data = { asOf: string; start: string; series: Record<"dgs10" | "dff", [string, number][]> };

export const DATA = raw as unknown as Data;
const H_WIDE = 480;
const H_NARROW = 380;
const NARROW = 720;
const M = { top: 72, right: 112, bottom: 30, left: 36 };
const Y_MAX = 7;
const INK = "#000000";
const FF = "#4a6fa5";

const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toPts = (s: [string, number][]): Pt[] => s.map(([d, v]) => ({ t: utc(d), v, d }));
const DGS10 = toPts(DATA.series.dgs10);
const DFF = toPts(DATA.series.dff);
const T0 = utc(DATA.start);
const T1 = utc(DATA.asOf);

const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/** Index of the point nearest in time, by binary search. */
function nearest(pts: Pt[], t: number): number {
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && t - pts[lo - 1].t < pts[lo].t - t) return lo - 1;
  return lo;
}

interface Geometry {
  narrow: boolean;
  H: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  x: (t: number) => number;
  y: (v: number) => number;
}

function geometry(width: number): Geometry {
  const narrow = width < NARROW;
  const H = narrow ? H_NARROW : H_WIDE;
  const m = narrow ? { ...M, top: 26, right: 72, left: 30 } : M;
  const x0 = m.left;
  const x1 = width - m.right;
  const y0 = m.top;
  const y1 = H - m.bottom;
  return {
    narrow, H, x0, x1, y0, y1,
    x: (t) => x0 + ((t - T0) / (T1 - T0)) * (x1 - x0),
    y: (v) => y1 - (v / Y_MAX) * (y1 - y0),
  };
}

/**
 * Markers in a strip above the plot: a greedy two-row layout, so
 * neighbours closer than a marker width drop to the second row instead
 * of overlapping.
 */
function layoutMarkers(g: Geometry) {
  let lastRow0 = -Infinity;
  let lastRow1 = -Infinity;
  return EPISODES.map((e) => {
    const mx = g.x(utc(e.anchor));
    let row = 0;
    if (mx - lastRow0 < 28) row = mx - lastRow1 < 28 ? 0 : 1;
    if (row === 0) lastRow0 = mx;
    else lastRow1 = mx;
    const my = 18 + row * 26;
    const lineY = g.y(DGS10[nearest(DGS10, utc(e.anchor))].v);
    return { e, mx, my, lineY };
  });
}

interface Props {
  active: string | null;
  setActive: (id: string | null) => void;
  filter: PillarId | null;
  setFilter: (id: PillarId | null) => void;
  onPillarJump: (id: PillarId) => void;
}

export default function YieldChart({ active, setActive, filter, setFilter, onPillarJump }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => geometry(width), [width]);
  const { narrow, H, x0, x1, y0, y1, x, y } = g;
  const paths = useMemo(() => {
    const line = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${g.x(p.t).toFixed(1)},${g.y(p.v).toFixed(1)}`).join("");
    return { dgs10: line(DGS10), dff: line(DFF) };
  }, [g]);
  const markers = useMemo(() => layoutMarkers(g), [g]);

  const activeEp = active ? EPISODES.find((e) => e.id === active) ?? null : null;
  const activeIdx = activeEp ? EPISODES.indexOf(activeEp) : -1;
  const tagged = (e: Episode) => !filter || e.forces.some((f) => f.pillar === filter);

  const onMove = (ev: React.PointerEvent<SVGRectElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - r.left + x0;
    const t = T0 + ((px - x0) / (x1 - x0)) * (T1 - T0);
    setHover(nearest(DGS10, t));
  };

  const onMarkerKey = (ev: KeyboardEvent<SVGGElement>, i: number) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      setActive(active === EPISODES[i].id ? null : EPISODES[i].id);
    } else if (ev.key === "ArrowRight" && i < EPISODES.length - 1) {
      ev.preventDefault();
      setActive(EPISODES[i + 1].id);
    } else if (ev.key === "ArrowLeft" && i > 0) {
      ev.preventDefault();
      setActive(EPISODES[i - 1].id);
    } else if (ev.key === "Escape") {
      setActive(null);
    }
  };

  // Hover readout
  const hp = hover !== null ? DGS10[hover] : null;
  const hff = hp ? DFF[nearest(DFF, hp.t)] : null;

  // Direct labels at the right edge, nudged apart if they collide.
  const last10 = DGS10[DGS10.length - 1];
  const lastFF = DFF[DFF.length - 1];
  let ly10 = y(last10.v);
  let lyFF = y(lastFF.v);
  if (Math.abs(ly10 - lyFF) < 30) {
    const mid = (ly10 + lyFF) / 2;
    ly10 = ly10 <= lyFF ? mid - 15 : mid + 15;
    lyFF = ly10 <= lyFF ? mid + 15 : mid - 15;
  }

  const years: number[] = [];
  for (let yr = 2000; yr <= 2026; yr++) years.push(yr);
  const labelEvery = narrow ? 4 : 2;

  const card = activeEp ? (
    <EpisodeCard
      ep={activeEp}
      idx={activeIdx}
      filter={filter}
      onPrev={activeIdx > 0 ? () => setActive(EPISODES[activeIdx - 1].id) : undefined}
      onNext={activeIdx < EPISODES.length - 1 ? () => setActive(EPISODES[activeIdx + 1].id) : undefined}
      onClose={() => setActive(null)}
      onPillar={onPillarJump}
    />
  ) : null;

  return (
    <div className="by-chart">
      <div className="by-chips" role="group" aria-label="Highlight an idea">
        <span className="by-chips-label">Highlight an idea</span>
        <button type="button" className="by-chip" aria-pressed={filter === null} onClick={() => setFilter(null)}>
          All
        </button>
        {PILLARS.map((p) => (
          <button
            type="button"
            key={p.id}
            className="by-chip"
            style={{ "--chip": p.color } as React.CSSProperties}
            aria-pressed={filter === p.id}
            onClick={() => setFilter(filter === p.id ? null : p.id)}
            data-tel="by-filter"
            data-tel-project="bond-yields"
          >
            <span className="by-chip-dot" aria-hidden="true" />
            {p.n} {p.tag}
          </button>
        ))}
      </div>

      <div className="by-chart-grid">
      <div className="by-chart-wrap" ref={wrapRef}>
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label="Ten-year Treasury yield and effective fed funds rate, weekly, 2000 to today, with fifteen numbered episodes"
          onPointerLeave={() => setHover(null)}
        >
          {/* Episode bands */}
          {EPISODES.map((e) => {
            const isActive = e.id === active;
            const tinted = filter && tagged(e);
            if (!isActive && !tinted) return null;
            const bx0 = x(utc(e.start));
            const bx1 = x(utc(e.end));
            return (
              <rect
                key={e.id}
                x={bx0}
                y={y0}
                width={Math.max(2, bx1 - bx0)}
                height={y1 - y0}
                fill={tinted ? PILLAR_BY_ID[filter].color : INK}
                opacity={isActive ? (tinted ? 0.16 : 0.06) : 0.08}
              />
            );
          })}

          {/* Grid and axes */}
          {Array.from({ length: Y_MAX + 1 }, (_, v) => (
            <g key={v}>
              <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} stroke={v === 0 ? INK : "#e6e6e6"} strokeWidth={v === 0 ? 1 : 1} />
              {v > 0 && (
                <text x={x0 - 6} y={y(v) + 4} textAnchor="end" className="by-axis">
                  {v}%
                </text>
              )}
            </g>
          ))}
          {years.map((yr) => {
            const tx = x(Date.UTC(yr, 0, 1));
            const major = (yr - 2000) % labelEvery === 0;
            return (
              <g key={yr}>
                <line x1={tx} x2={tx} y1={y1} y2={y1 + (major ? 7 : 4)} stroke={INK} />
                {major && (
                  <text x={tx} y={y1 + 21} textAnchor="middle" className="by-axis">
                    {yr}
                  </text>
                )}
              </g>
            );
          })}

          {/* Lines */}
          <path d={paths.dff} fill="none" stroke={FF} strokeWidth={1.4} strokeLinejoin="round" />
          <path d={paths.dgs10} fill="none" stroke={INK} strokeWidth={1.9} strokeLinejoin="round" />

          {/* Direct labels */}
          <g className="by-direct">
            <text x={x1 + 8} y={ly10 + 4} fill={INK}>
              <tspan className="by-direct-name">{narrow ? "10-year" : "10-year Treasury"}</tspan>
              <tspan x={x1 + 8} dy={14} className="by-direct-val">{fmtPct(last10.v, 2)}</tspan>
            </text>
            <text x={x1 + 8} y={lyFF + 4} fill={FF}>
              <tspan className="by-direct-name">Fed funds</tspan>
              <tspan x={x1 + 8} dy={14} className="by-direct-val">{fmtPct(lastFF.v, 2)}</tspan>
            </text>
          </g>

          {/* Hover crosshair */}
          {hp && hff && (
            <g pointerEvents="none">
              <line x1={x(hp.t)} x2={x(hp.t)} y1={y0} y2={y1} stroke={INK} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
              <circle cx={x(hp.t)} cy={y(hp.v)} r={4.5} fill={INK} stroke="#fff" strokeWidth={2} />
              <circle cx={x(hff.t)} cy={y(hff.v)} r={4.5} fill={FF} stroke="#fff" strokeWidth={2} />
            </g>
          )}

          {/* Hit area for hover (under the markers) */}
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />

          {/* Episode markers: a numbered strip on wide screens; on narrow
              ones, dots on the line (the index beside the chart carries
              the numbers). */}
          {markers.map(({ e, mx, my, lineY }, i) => {
            const isActive = e.id === active;
            const on = tagged(e);
            const color = filter && on ? PILLAR_BY_ID[filter].color : INK;
            const lit = isActive || (filter && on);
            return (
              <g
                key={e.id}
                className="by-marker"
                opacity={on ? 1 : 0.28}
                tabIndex={0}
                role="button"
                aria-pressed={isActive}
                aria-label={`Episode ${e.n}: ${e.title}, ${e.when}`}
                onClick={() => setActive(isActive ? null : e.id)}
                onKeyDown={(ev) => onMarkerKey(ev, i)}
                data-tel="by-episode"
                data-tel-project="bond-yields"
              >
                {narrow ? (
                  <>
                    <circle cx={mx} cy={lineY} r={12} fill="transparent" />
                    <circle cx={mx} cy={lineY} r={isActive ? 6 : 4} fill={lit ? color : "#fff"} stroke={color} strokeWidth={1.5} />
                  </>
                ) : (
                  <>
                    <line x1={mx} x2={mx} y1={my + 11} y2={lineY} stroke={color} strokeWidth={1} strokeDasharray={isActive ? undefined : "2 3"} opacity={isActive ? 0.9 : 0.45} />
                    <circle cx={mx} cy={lineY} r={isActive ? 4 : 2.5} fill={color} stroke="#fff" strokeWidth={1.5} />
                    <circle cx={mx} cy={my} r={11} fill={lit ? color : "#fff"} stroke={color} strokeWidth={isActive ? 2 : 1.25} />
                    <text x={mx} y={my + 3.5} textAnchor="middle" className="by-marker-num" fill={lit ? "#fff" : color}>
                      {e.n}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {hp && hff && (
          <div
            className="by-readout"
            style={{ left: Math.min(x(hp.t) + 14, width - 170), top: y1 - 86 }}
            aria-hidden="true"
          >
            <div className="by-readout-date">{fmtDate(hp.d)}</div>
            <div className="by-readout-row"><span className="by-swatch" style={{ background: INK }} />10-year<b>{fmtPct(hp.v, 2)}</b></div>
            <div className="by-readout-row"><span className="by-swatch" style={{ background: FF }} />Fed funds<b>{fmtPct(hff.v, 2)}</b></div>
            <div className="by-readout-row by-readout-gap">Gap<b>{(hp.v - hff.v >= 0 ? "+" : "") + (hp.v - hff.v).toFixed(2)}</b></div>
          </div>
        )}

      </div>

      <aside className="by-panel" aria-label="Episode">
        {card ?? <EpisodeIndex filter={filter} onPick={setActive} />}
      </aside>
      </div>

      <p className="by-chart-note">
        Weekly closes. 10-year: constant-maturity Treasury yield (FRED DGS10). Fed funds: effective rate (FRED DFF).
        Data through {fmtDate(DATA.asOf)}.
      </p>

      <details className="by-table">
        <summary>View as a table (year-end values)</summary>
        <table>
          <thead>
            <tr><th>Year</th><th>10-year</th><th>Fed funds</th><th>Gap</th></tr>
          </thead>
          <tbody>
            {years.map((yr) => {
              const t = Math.min(Date.UTC(yr, 11, 31), T1);
              const a = DGS10[nearest(DGS10, t)];
              const b = DFF[nearest(DFF, t)];
              return (
                <tr key={yr}>
                  <td>{yr}{t === T1 ? " (to date)" : ""}</td><td>{fmtPct(a.v, 2)}</td><td>{fmtPct(b.v, 2)}</td><td>{(a.v - b.v).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function EpisodeIndex({ filter, onPick }: { filter: PillarId | null; onPick: (id: string) => void }) {
  return (
    <div className="by-index">
      <span className="by-kicker">Fifteen episodes · pick one</span>
      <ol>
        {EPISODES.map((e) => {
          const on = !filter || e.forces.some((f) => f.pillar === filter);
          return (
            <li key={e.id} className={on ? undefined : "is-dim"}>
              <button type="button" onClick={() => onPick(e.id)} data-tel="by-episode" data-tel-project="bond-yields">
                <span className="by-index-n" style={{ background: filter && on ? PILLAR_BY_ID[filter].color : undefined }}>{e.n}</span>
                <span className="by-index-title">{e.title}</span>
                <span className="by-index-when">{e.when}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function EpisodeCard({
  ep, idx, filter, onPrev, onNext, onClose, onPillar,
}: {
  ep: Episode;
  idx: number;
  filter: PillarId | null;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onPillar: (id: PillarId) => void;
}) {
  return (
    <article className="by-card" aria-live="polite">
      <header className="by-card-head">
        <span className="by-kicker">Episode {ep.n} of {EPISODES.length} · {ep.when}</span>
        <button type="button" className="by-card-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <h3 className="by-card-title">{ep.title}</h3>
      <p className="by-card-levels">{ep.levels}</p>
      {ep.body.map((p, i) => (
        <p key={i} className="by-card-body">{p}</p>
      ))}
      <div className="by-card-forces">
        <span className="by-kicker">What explains it</span>
        <ul>
          {ep.forces.map((f) => {
            const p = PILLAR_BY_ID[f.pillar];
            return (
              <li key={f.pillar} className={filter === f.pillar ? "is-filter" : undefined}>
                <button
                  type="button"
                  className="by-tag"
                  style={{ "--tag": p.color } as React.CSSProperties}
                  onClick={() => onPillar(p.id)}
                  title={`Read idea ${p.n}`}
                >
                  <span className="by-chip-dot" aria-hidden="true" />{p.n} {p.tag}
                </button>
                <span className="by-force-note">{f.note}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <footer className="by-card-nav">
        <button type="button" className="by-btn" onClick={onPrev} disabled={!onPrev}>← {idx > 0 ? EPISODES[idx - 1].n : ""}</button>
        <button type="button" className="by-btn" onClick={onNext} disabled={!onNext}>{idx < EPISODES.length - 1 ? EPISODES[idx + 1].n : ""} →</button>
      </footer>
    </article>
  );
}
