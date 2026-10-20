"use client";

/**
 * The timeline: the 10-year as an ink-A halftone, the Fed's rate as a flat
 * ink-B area over it, weekly since 2000. Fifteen numbered markers in a
 * strip above the plot; choosing one floods it with ink and re-inks the
 * panel beside the chart with that episode. The panel shows an index of
 * episodes when none is chosen.
 */

import { useMemo, type KeyboardEvent } from "react";

import { Caption } from "@/app/_paper/Paper";

import { Axes, Callout, Crosshair, Dim, Halftone, HitArea, Readout, S, T0, areaPath, at, fmt, geometry, last, linePath, nearest, useHover, useWidth, utc, type G, type Row } from "./chart";
import { EPISODES, type Episode } from "./episodes";
import { PILLAR_BY_ID, type PillarId } from "./pillars";

const DGS10 = S.dgs10;
const DFF = S.dff;
const ROWS: Row[] = [
  { label: "10-year", pts: DGS10, swatch: "halftone" },
  { label: "Fed funds", pts: DFF, swatch: "flat" },
];

/** Markers in a strip above the plot: neighbours closer than a marker width drop to a second row. */
function layoutMarkers(g: G) {
  let lastRow0 = -Infinity;
  let lastRow1 = -Infinity;
  return EPISODES.map((e) => {
    const mx = g.x(utc(e.anchor));
    let row = 0;
    if (mx - lastRow0 < 28) row = mx - lastRow1 < 28 ? 0 : 1;
    if (row === 0) lastRow0 = mx;
    else lastRow1 = mx;
    return { e, mx, my: 16 + row * 26, lineY: g.y(DGS10[nearest(DGS10, utc(e.anchor))].v) };
  });
}

interface Props {
  active: string | null;
  setActive: (id: string | null) => void;
  onIdea: (id: PillarId) => void;
}

export default function YieldChart({ active, setActive, onIdea }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const g = useMemo(() => geometry(width, { t0: T0, v0: 0, v1: 7, H: width < 720 ? 340 : 480, right: 96, top: 76 }), [width]);
  const { narrow, x1, y0, y1, x } = g;
  const hover = useHover(g);
  const markers = useMemo(() => layoutMarkers(g), [g]);
  const paths = useMemo(() => ({ ten: areaPath(g, DGS10), ff: areaPath(g, DFF), line: linePath(g, DGS10) }), [g]);

  const activeEp = active ? EPISODES.find((e) => e.id === active) ?? null : null;
  const activeIdx = activeEp ? EPISODES.indexOf(activeEp) : -1;

  const onMarkerKey = (ev: KeyboardEvent<SVGGElement>, i: number) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setActive(active === EPISODES[i].id ? null : EPISODES[i].id); }
    else if (ev.key === "ArrowRight" && i < EPISODES.length - 1) { ev.preventDefault(); setActive(EPISODES[i + 1].id); }
    else if (ev.key === "ArrowLeft" && i > 0) { ev.preventDefault(); setActive(EPISODES[i - 1].id); }
    else if (ev.key === "Escape") setActive(null);
  };

  const ten = last(DGS10);
  const ff = last(DFF);
  // The one printed note: the Fed's rate above the 10-year, mid-2007.
  const noteT = utc("2007-02-16");

  return (
    <div className={`by-chart${narrow ? " is-narrow" : ""}`}>
      <div className="by-chart-grid">
        <div className="by-plot" ref={ref}>
          <svg width={width} height={g.H} viewBox={`0 0 ${width} ${g.H}`} role="img"
            aria-label="Ten-year Treasury yield and effective fed funds rate, weekly, 2000 to today, with fifteen numbered episodes"
            onPointerLeave={hover.clear}>
            <Halftone id="by-ht" />

            {activeEp && (
              <rect x={x(utc(activeEp.start))} y={y0} width={Math.max(2, x(utc(activeEp.end)) - x(utc(activeEp.start)))} height={y1 - y0} fill="var(--a)" opacity={0.07} />
            )}

            <path d={paths.ten} fill="url(#by-ht)" />
            <path d={paths.ff} fill="var(--b)" />
            <path d={paths.line} fill="none" stroke="var(--a)" strokeWidth={1.6} strokeLinejoin="round" />
            <Axes g={g} ticks={[1, 3, 5, 7]} firstYear={2000} />

            {!narrow && <Callout g={g} t={noteT} v={at(DFF, noteT).v} label="The Fed above the 10-year" sub="The market expects cuts" dy={-70} />}
            <Dim g={g} x={x1 + 22} va={ten.v} vb={ff.v} label={fmt(ten.v - ff.v)} />

            {hover.t !== null && <Crosshair g={g} t={hover.t} rows={ROWS} />}
            <HitArea g={g} onMove={hover.onMove} />

            {markers.map(({ e, mx, my, lineY }, i) => {
              const on = e.id === active;
              return (
                <g key={e.id} className={`by-marker${on ? " is-on" : ""}`} tabIndex={0} role="button" aria-pressed={on}
                  aria-label={`Episode ${e.n}: ${e.title}, ${e.when}`}
                  onClick={() => setActive(on ? null : e.id)} onKeyDown={(ev) => onMarkerKey(ev, i)}
                  data-tel="by-episode" data-tel-project="bond-yields">
                  {narrow ? (
                    <>
                      <circle cx={mx} cy={lineY} r={12} fill="transparent" />
                      <circle cx={mx} cy={lineY} r={4} className="by-marker-dot" />
                    </>
                  ) : (
                    <>
                      <line x1={mx} x2={mx} y1={my + 11} y2={lineY} className="by-marker-leader" />
                      <circle cx={mx} cy={lineY} r={2.5} className="by-marker-foot" />
                      <g className="by-marker-ring" style={{ transformOrigin: `${mx}px ${my}px` }}>
                        <circle cx={mx} cy={my} r={11} className="by-marker-o" />
                        <circle cx={mx} cy={my} r={on ? 11 : 0} className="by-marker-flood" />
                        <text x={mx} y={my + 3.5} textAnchor="middle" className="by-marker-n">{Number(e.n)}</text>
                      </g>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          {hover.t !== null && (
            <Readout g={g} t={hover.t} rows={ROWS}
              extra={<small>Gap<em>{fmt(at(DGS10, hover.t).v - at(DFF, hover.t).v)}</em></small>} />
          )}
        </div>

        <aside className="by-panel" aria-label="Episode" aria-live="polite">
          <div key={active ?? "index"} className="wp-reink">
            {activeEp ? (
              <EpisodeCard ep={activeEp} idx={activeIdx} onPick={setActive} onIdea={onIdea} />
            ) : (
              <EpisodeIndex onPick={setActive} />
            )}
          </div>
        </aside>
      </div>

      <Caption
        title="Twenty-six years of the 10-year"
        legend={[{ swatch: "halftone", label: "10-year, set by the market" }, { swatch: "flat", label: "Fed funds, set by the Fed" }]}
        sources={[{ label: "FRED DGS10", href: "https://fred.stlouisfed.org/series/DGS10" }, { label: "DFF", href: "https://fred.stlouisfed.org/series/DFF" }]}
      />
    </div>
  );
}

function EpisodeIndex({ onPick }: { onPick: (id: string) => void }) {
  return (
    <ol className="by-index">
      {EPISODES.map((e) => (
        <li key={e.id}>
          <button type="button" className="wp-hov by-index-b" onClick={() => onPick(e.id)} data-tel="by-episode" data-tel-project="bond-yields">
            <span><i>{Number(e.n)}</i>{e.title}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function EpisodeCard({ ep, idx, onPick, onIdea }: { ep: Episode; idx: number; onPick: (id: string | null) => void; onIdea: (id: PillarId) => void }) {
  const prev = EPISODES[idx - 1];
  const next = EPISODES[idx + 1];
  return (
    <article className="by-card">
      <span className="wp-lab">No. {Number(ep.n)} · {ep.when}</span>
      <h3 className="wp-h2">{ep.title}</h3>
      <p className="wp-big by-card-big">{ep.big}</p>
      <p className="wp-lab">{ep.sub}</p>
      <p className="by-card-body">{ep.body}</p>
      <ul className="by-card-ideas">
        {ep.ideas.map((id) => {
          const p = PILLAR_BY_ID[id];
          return (
            <li key={id}>
              <button type="button" className="wp-hov" onClick={() => onIdea(id)} data-tel="by-idea" data-tel-project="bond-yields">
                <span><i>{p.numeral}</i>{p.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="by-card-nav">
        <button type="button" className="wp-hov" onClick={() => onPick(prev ? prev.id : null)} aria-label={prev ? `Episode ${Number(prev.n)}` : "Close"}>
          <span>{prev ? `← ${Number(prev.n)}` : "← Index"}</span>
        </button>
        {next && (
          <button type="button" className="wp-hov" onClick={() => onPick(next.id)} aria-label={`Episode ${Number(next.n)}`}>
            <span>{Number(next.n)} →</span>
          </button>
        )}
      </footer>
    </article>
  );
}
