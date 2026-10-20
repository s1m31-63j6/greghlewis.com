"use client";

/**
 * The paper's chart toolkit: one geometry and the few printed marks every
 * chart here is built from. Ink A is a halftone or a line, ink B is a flat
 * area, and at most the two ever overlap. Hand-rolled SVG, no chart library.
 * Data and the pure helpers live in data.ts and are re-exported here.
 */

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { T1, at, fmt, fmtDate, last, type Pt } from "./data";

export * from "./data";

/* ── Geometry ────────────────────────────────────────────────────────── */

export interface G {
  W: number; H: number; narrow: boolean;
  x0: number; x1: number; y0: number; y1: number;
  t0: number; t1: number; v0: number; v1: number;
  x: (t: number) => number;
  y: (v: number) => number;
}

export const NARROW = 720;

export function geometry(W: number, o: { t0: number; v0: number; v1: number; t1?: number; H?: number; right?: number; top?: number }): G {
  const narrow = W < NARROW;
  const H = o.H ?? (narrow ? 340 : 440);
  const left = narrow ? 26 : 32;
  const right = narrow ? Math.round((o.right ?? 150) * 0.72) : (o.right ?? 150);
  const top = o.top ?? 36;
  const bottom = 30;
  const [x0, x1, y0, y1] = [left, W - right, top, H - bottom];
  const t0 = o.t0;
  const t1 = o.t1 ?? T1;
  return {
    W, H, narrow, x0, x1, y0, y1, t0, t1, v0: o.v0, v1: o.v1,
    x: (t) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0),
    y: (v) => y1 - ((v - o.v0) / (o.v1 - o.v0)) * (y1 - y0),
  };
}

/** The container's width, for a chart that fills it. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ── Paths ───────────────────────────────────────────────────────────── */

export const linePath = (g: G, pts: Pt[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${g.x(p.t).toFixed(1)},${g.y(p.v).toFixed(1)}`).join("");

/** Area between a baseline value and the series; `side` keeps only the part above or below it. */
export function areaPath(g: G, pts: Pt[], base = 0, side?: "above" | "below") {
  const clamp = (v: number) => (side === "above" ? Math.max(v, base) : side === "below" ? Math.min(v, base) : v);
  const top = pts.map((p, i) => `${i ? "L" : "M"}${g.x(p.t).toFixed(1)},${g.y(clamp(p.v)).toFixed(1)}`).join("");
  const by = g.y(base).toFixed(1);
  return `${top}L${g.x(last(pts).t).toFixed(1)},${by}L${g.x(pts[0].t).toFixed(1)},${by}Z`;
}

/* ── Marks ───────────────────────────────────────────────────────────── */

/** Ink-A dot screen. Reference it as fill={`url(#${id})`}. */
export function Halftone({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width={5} height={5} patternUnits="userSpaceOnUse">
        <circle cx={2.5} cy={2.5} r={1.4} fill="var(--a)" />
      </pattern>
    </defs>
  );
}

export function Axes({ g, ticks, firstYear }: { g: G; ticks: number[]; firstYear: number }) {
  const years: number[] = [firstYear];
  for (let yr = 2008; yr <= 2026; yr += 8) if (yr > firstYear + 2) years.push(yr);
  return (
    <g className="by-axes" aria-hidden="true">
      {ticks.map((v) => (
        <text key={v} x={g.x0 - 8} y={g.y(v) + 4} textAnchor="end" className="wp-ax">{v}</text>
      ))}
      <line x1={g.x0} x2={g.x1} y1={g.y1} y2={g.y1} stroke="var(--wp-ink)" strokeWidth={1} />
      {g.v0 < 0 && <line x1={g.x0} x2={g.x1} y1={g.y(0)} y2={g.y(0)} stroke="var(--wp-ink)" strokeWidth={0.75} strokeDasharray="2 3" />}
      {years.map((yr) => (
        <text key={yr} x={g.x(Date.UTC(yr, 0, 1))} y={g.y1 + 20} textAnchor="middle" className="wp-ax">{yr}</text>
      ))}
    </g>
  );
}

/** A leader line from a label down to a point on the data. */
export function Callout({ g, t, v, label, sub, dy = -58, dx = 0, anchor = "middle" }: {
  g: G; t: number; v: number; label: string; sub?: string; dy?: number; dx?: number; anchor?: "start" | "middle" | "end";
}) {
  const [cx, cy] = [g.x(t), g.y(v)];
  const ly = cy + dy;
  return (
    <g className="by-callout" aria-hidden="true">
      <line x1={cx} x2={cx} y1={ly + (sub ? 24 : 8)} y2={cy - 4} stroke="var(--wp-ink)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={3} fill="var(--wp-paper)" stroke="var(--wp-ink)" strokeWidth={1.5} />
      <text x={cx + dx} y={ly} textAnchor={anchor} className="by-callout-l">{label}</text>
      {sub && <text x={cx + dx} y={ly + 16} textAnchor={anchor} className="by-callout-s">{sub}</text>}
    </g>
  );
}

/** A number that earns its size: the current level, printed in the right margin. */
export function BigNumber({ x, y, value, label, tone = "a" }: { x: number; y: number; value: string; label: string; tone?: "a" | "ink" }) {
  return (
    <g className={`by-bign is-${tone}`} aria-hidden="true">
      {tone === "ink" && <rect x={x} y={y + 3} width={value.length * 19} height={4} fill="var(--b)" />}
      <text x={x} y={y} className="by-big">{value}</text>
      <text x={x} y={y + 18} className="wp-lab">{label}</text>
    </g>
  );
}

/** A measured gap: vertical dimension line with arrowheads and a bold label. */
export function Dim({ g, x, va, vb, label }: { g: G; x: number; va: number; vb: number; label: string }) {
  const [ya, yb] = [g.y(va), g.y(vb)];
  const [top, bot] = [Math.min(ya, yb), Math.max(ya, yb)];
  const arrow = (y: number, up: boolean) => `M${x - 4},${up ? y + 9 : y - 9}L${x},${y}L${x + 4},${up ? y + 9 : y - 9}`;
  return (
    <g className="by-dim" aria-hidden="true" stroke="var(--wp-ink)" strokeWidth={1.25} fill="none">
      <line x1={x} x2={x} y1={top} y2={bot} />
      <path d={arrow(top, true)} /><path d={arrow(bot, false)} />
      <line x1={x - 10} x2={x + 10} y1={top} y2={top} strokeWidth={1} /><line x1={x - 10} x2={x + 10} y1={bot} y2={bot} strokeWidth={1} />
      <text x={x + 12} y={(top + bot) / 2 + 5} className="by-dim-l" stroke="none" fill="var(--wp-ink)">{label}</text>
    </g>
  );
}

/* ── Hover: a crosshair and a readout that grows from the plot ───────── */

export function useHover(g: G) {
  const [t, setT] = useState<number | null>(null);
  const onMove = (ev: PointerEvent<SVGRectElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - r.left;
    setT(g.t0 + (px / r.width) * (g.t1 - g.t0));
  };
  return { t, onMove, clear: () => setT(null) };
}

export function HitArea({ g, onMove }: { g: G; onMove: (ev: PointerEvent<SVGRectElement>) => void }) {
  return <rect x={g.x0} y={g.y0} width={g.x1 - g.x0} height={g.y1 - g.y0} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />;
}

export interface Row { label: string; pts: Pt[]; swatch: "halftone" | "flat" | "line"; digits?: number }

/** The crosshair (inside the svg) and the readout card (an HTML sibling). */
export function Crosshair({ g, t, rows }: { g: G; t: number; rows: Row[] }) {
  const x = g.x(at(rows[0].pts, t).t);
  return (
    <g pointerEvents="none" aria-hidden="true">
      <line x1={x} x2={x} y1={g.y0} y2={g.y1} stroke="var(--wp-ink)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
      {rows.map((r) => {
        const p = at(r.pts, t);
        return <circle key={r.label} cx={g.x(p.t)} cy={g.y(p.v)} r={4.5} fill={r.swatch === "flat" ? "var(--b)" : "var(--a)"} stroke="var(--wp-paper)" strokeWidth={2} />;
      })}
    </g>
  );
}

export function Readout({ g, t, rows, extra }: { g: G; t: number; rows: Row[]; extra?: ReactNode }) {
  const p0 = at(rows[0].pts, t);
  const x = g.x(p0.t);
  const flip = x > g.W - 200;
  return (
    <div className="wp-tip by-readout" style={{ left: flip ? x - 14 : x + 14, top: g.y0 + 8, transform: flip ? "translateX(-100%)" : undefined, "--ox": flip ? "100%" : "0%", "--oy": "0%" } as React.CSSProperties}>
      <b>{fmtDate(p0.d)}</b>
      {rows.map((r) => {
        const p = at(r.pts, t);
        return <small key={r.label}><span className={`by-sw is-${r.swatch}`} />{r.label}<em>{fmt(p.v, r.digits ?? 2)}</em></small>;
      })}
      {extra}
    </div>
  );
}
