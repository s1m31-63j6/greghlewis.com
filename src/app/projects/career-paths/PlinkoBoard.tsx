"use client";

/**
 * The plinko board: three thousand careers falling through thirty rows.
 *
 * Canvas for the balls, DOM for every piece of text. Each ball's x in row t
 * is its realized pay in year t on the log axis, so a liquidity event reads
 * as a leap to the right and an MBA as two years pinned to the left wall.
 * After row 30 the ball slides into a stacked histogram of its 30-year
 * average, one sub-column per track inside each bin.
 *
 * Time comes from performance.now(), not a frame count: a background tab
 * stalls requestAnimationFrame, and on return the drop should simply be
 * over, not resume mid-air.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { avgFirst } from "./engine/engine.ts";
import { mulberry32 } from "./engine/rng.ts";
import type { Career, Track3 } from "./engine/types.ts";
import { TRACKS3 } from "./engine/types.ts";
import { fmtDollars } from "./format";
import { N_BINS, TICKS, binOf, easeInOut, unit } from "./scale";
import type { TrackRun } from "./useSimulation";

const ROWS = 30;
const DROP_MS = 7000;
const FALL_MS = 2400;
const SETTLE_MS = 320;

const COLORS: Record<Track3, string> = { startup: "#d55e00", corporate: "#0072b2", consulting: "#009e73" };
const LABELS: Record<Track3, string> = { startup: "Startup", corporate: "Corporate", consulting: "Consulting" };

interface Geometry {
  w: number; h: number; left: number; right: number;
  rowsTop: number; rowPitch: number; bandTop: number; bandBottom: number; ball: number;
}

function geometry(w: number): Geometry {
  const narrow = w < 640;
  const rowPitch = narrow ? 8 : 11;
  const bandH = narrow ? 150 : 220;
  const rowsTop = 30;
  const bandTop = rowsTop + ROWS * rowPitch + 64;
  return {
    w, h: bandTop + bandH + 6, left: 34, right: w - 8,
    rowsTop, rowPitch, bandTop, bandBottom: bandTop + bandH, ball: narrow ? 2 : 3,
  };
}

interface Layout {
  n: number;
  track: Uint8Array;
  xs: Float32Array;        // n * ROWS
  settleX: Float32Array;
  settleY: Float32Array;
  release: Float32Array;   // ms after the clock starts; NaN = already settled
  slot: Int32Array;        // bin*3+track -> first ball index via order
  order: Int32Array;       // balls sorted by (bin, track, stack)
  stack: Int32Array;       // stack index per ball
}

export interface TrackStats {
  track: Track3; median: number; p10: number; p90: number; over1M: number; under100K: number; leap1M: number;
}

export function trackStats(run: TrackRun): TrackStats {
  const a = run.careers.map((c) => avgFirst(c, ROWS)).sort((x, y) => x - y);
  const q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  let leap = 0;
  for (const c of run.careers) {
    for (let i = 0; i < ROWS; i++) if (c.realized[i] >= 1_000_000) { leap++; break; }
  }
  return {
    track: run.track, median: q(0.5), p10: q(0.1), p90: q(0.9),
    over1M: a.filter((x) => x >= 1_000_000).length,
    under100K: a.filter((x) => x < 100_000).length,
    leap1M: leap,
  };
}

function buildLayout(runs: TrackRun[], g: Geometry, seed: number, prev: Layout | null, changed: Set<Track3>): Layout {
  const n = runs.reduce((s, r) => s + r.careers.length, 0);
  const track = new Uint8Array(n);
  const xs = new Float32Array(n * ROWS);
  const settleX = new Float32Array(n);
  const settleY = new Float32Array(n);
  const release = new Float32Array(n);
  const stack = new Int32Array(n);
  const span = g.right - g.left;
  const binW = span / N_BINS;
  const sub = binW / 3;

  // Per (bin, track) stacks. A track's stacking depends only on its own balls,
  // so re-simulating one track never moves another's settled positions.
  const counts = new Int32Array(N_BINS * 3);
  const bins = new Int32Array(n);
  let i = 0;
  runs.forEach((r, ti) => {
    for (const c of r.careers) {
      track[i] = ti;
      for (let y = 0; y < ROWS; y++) xs[i * ROWS + y] = g.left + unit(c.realized[y]) * span;
      const b = binOf(avgFirst(c, ROWS));
      bins[i] = b;
      stack[i] = counts[b * 3 + ti]++;
      i++;
    }
  });
  let maxCount = 1;
  for (const c of counts) if (c > maxCount) maxCount = c;
  const pitch = Math.min(g.ball + 0.5, (g.bandBottom - g.bandTop - 4) / maxCount);
  for (let k = 0; k < n; k++) {
    settleX[k] = g.left + bins[k] * binW + track[k] * sub + sub / 2;
    settleY[k] = g.bandBottom - 2 - stack[k] * pitch - g.ball / 2;
  }

  const rng = mulberry32(seed);
  const window = DROP_MS - FALL_MS - SETTLE_MS - 200;
  for (let k = 0; k < n; k++) {
    const t = TRACKS3[track[k]];
    release[k] = prev === null || changed.has(t) ? rng() * window : NaN;
  }

  const order = new Int32Array(n);
  for (let k = 0; k < n; k++) order[k] = k;
  order.sort((a, b) => (bins[a] * 3 + track[a]) - (bins[b] * 3 + track[b]) || stack[a] - stack[b]);
  const slot = new Int32Array(N_BINS * 3 + 1).fill(-1);
  for (let k = 0; k < n; k++) {
    const key = bins[order[k]] * 3 + track[order[k]];
    if (slot[key] < 0) slot[key] = k;
  }
  return { n, track, xs, settleX, settleY, release, slot, order, stack };
}

function ballAt(L: Layout, g: Geometry, px: number, py: number): number {
  const span = g.right - g.left;
  const binW = span / N_BINS;
  if (px < g.left || px > g.right || py < g.bandTop || py > g.bandBottom) return -1;
  const b = Math.min(N_BINS - 1, Math.floor((px - g.left) / binW));
  const ti = Math.min(2, Math.floor(((px - g.left) - b * binW) / (binW / 3)));
  const first = L.slot[b * 3 + ti];
  if (first < 0) return -1;
  let best = -1;
  let bestD = 6;
  for (let k = first; k < L.n; k++) {
    const id = L.order[k];
    if (L.track[id] !== ti) break;
    const d = Math.abs(L.settleY[id] - py);
    if (d < bestD) { bestD = d; best = id; }
    if (L.settleY[id] < py - 6) break;
  }
  return best;
}

export interface PlinkoBoardProps {
  runs: TrackRun[];
  stats: TrackStats[];
  active: boolean;
  /** Bumps to replay every ball. */
  replayKey: number;
  reduced: boolean;
  onSettled?: () => void;
}

export default function PlinkoBoard({ runs, stats, active, replayKey, reduced, onSettled }: PlinkoBoardProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layout = useRef<Layout | null>(null);
  const geom = useRef<Geometry>(geometry(900));
  const seen = useRef<Record<Track3, Career[] | null>>({ startup: null, corporate: null, consulting: null });
  const t0 = useRef<number>(0);
  const raf = useRef<number>(0);
  const [width, setWidth] = useState(900);
  const [settled, setSettled] = useState(false);
  const [hover, setHover] = useState<{ id: number; x: number; y: number; track: Track3 } | null>(null);
  const lastReplay = useRef(replayKey);

  const careers = useMemo(() => runs.flatMap((r) => r.careers), [runs]);

  // Static layer: row hairlines and the band's baseline, redrawn on resize.
  const staticLayer = useRef<HTMLCanvasElement | null>(null);
  const drawStatic = useCallback((g: Geometry, dpr: number) => {
    const c = staticLayer.current ?? document.createElement("canvas");
    staticLayer.current = c;
    c.width = Math.round(g.w * dpr);
    c.height = Math.round(g.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    ctx.strokeStyle = "#eeeeee";
    ctx.lineWidth = 1;
    for (let r = 0; r < ROWS; r++) {
      const y = Math.round(g.rowsTop + r * g.rowPitch) + 0.5;
      ctx.beginPath(); ctx.moveTo(g.left, y); ctx.lineTo(g.right, y); ctx.stroke();
    }
    ctx.strokeStyle = "#000000";
    const yb = Math.round(g.bandBottom) + 0.5;
    ctx.beginPath(); ctx.moveTo(g.left, yb); ctx.lineTo(g.right, yb); ctx.stroke();
    ctx.strokeStyle = "#d9d9d9";
    const yt = Math.round(g.bandTop - 2) + 0.5;
    ctx.beginPath(); ctx.moveTo(g.left, yt); ctx.lineTo(g.right, yt); ctx.stroke();
  }, []);

  const draw = useCallback((now: number, hoverId: number) => {
    const cv = canvas.current;
    const L = layout.current;
    if (!cv || !L) return true;
    const g = geom.current;
    const ctx = cv.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    if (staticLayer.current) ctx.drawImage(staticLayer.current, 0, 0, g.w, g.h);

    const t = now - t0.current;
    let allDone = true;
    const b = g.ball;
    for (let ti = 0; ti < 3; ti++) {
      ctx.fillStyle = COLORS[TRACKS3[ti]];
      ctx.beginPath();
      for (let k = 0; k < L.n; k++) {
        if (L.track[k] !== ti) continue;
        let x: number;
        let y: number;
        const rel = L.release[k];
        const p = Number.isNaN(rel) ? Infinity : (t - rel) / FALL_MS;
        if (p < 0) continue;
        if (p < 1) {
          allDone = false;
          const row = Math.floor(p * ROWS);
          const frac = p * ROWS - row;
          const x0 = L.xs[k * ROWS + row];
          const x1 = row + 1 < ROWS ? L.xs[k * ROWS + row + 1] : L.settleX[k];
          x = x0 + (x1 - x0) * easeInOut(frac);
          y = g.rowsTop + row * g.rowPitch + frac * g.rowPitch;
        } else if (p !== Infinity && (t - rel - FALL_MS) < SETTLE_MS) {
          allDone = false;
          const q = easeInOut((t - rel - FALL_MS) / SETTLE_MS);
          const x0 = L.settleX[k];
          const y0 = g.rowsTop + ROWS * g.rowPitch;
          x = x0;
          y = y0 + (L.settleY[k] - y0) * q;
        } else {
          x = L.settleX[k];
          y = L.settleY[k];
        }
        ctx.rect(x - b / 2, y - b / 2, b, b);
      }
      ctx.fill();
    }

    if (hoverId >= 0) {
      const c = careers[hoverId];
      if (c) {
        ctx.strokeStyle = COLORS[TRACKS3[L.track[hoverId]]];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let r = 0; r < ROWS; r++) {
          const x = L.xs[hoverId * ROWS + r];
          const y = g.rowsTop + r * g.rowPitch;
          if (r === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineTo(L.settleX[hoverId], L.settleY[hoverId]);
        ctx.stroke();
        ctx.fillStyle = "#000";
        ctx.fillRect(L.settleX[hoverId] - 3, L.settleY[hoverId] - 3, 6, 6);
      }
    }
    return allDone;
  }, [careers]);

  const hoverRef = useRef(-1);
  // The frame callback lives in a ref so it can re-schedule itself while the
  // `loop` identity handed to effects stays stable.
  const loopRef = useRef<() => void>(() => {});
  useEffect(() => {
    loopRef.current = () => {
      const done = draw(performance.now(), hoverRef.current);
      if (done) {
        raf.current = 0;
        setSettled(true);
        onSettled?.();
      } else {
        raf.current = requestAnimationFrame(() => loopRef.current());
      }
    };
  }, [draw, onSettled]);
  const loop = useCallback(() => loopRef.current(), []);

  const start = useCallback((skipToEnd: boolean) => {
    t0.current = performance.now() - (skipToEnd ? DROP_MS + 1000 : 0);
    setSettled(false);
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(loop);
  }, [loop]);

  // Size the canvas to its container and rebuild geometry.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Relayout on width or data change; decide which balls re-drop.
  useEffect(() => {
    if (!active || width <= 0) return;
    const g = geometry(width);
    geom.current = g;
    const cv = canvas.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(g.w * dpr);
    cv.height = Math.round(g.h * dpr);
    cv.style.height = `${g.h}px`;
    drawStatic(g, dpr);

    const changed = new Set<Track3>();
    for (const r of runs) if (seen.current[r.track] !== r.careers) changed.add(r.track);
    const replay = lastReplay.current !== replayKey;
    lastReplay.current = replayKey;
    const prev = layout.current;
    const resizeOnly = prev !== null && changed.size === 0 && !replay;
    layout.current = buildLayout(runs, g, replayKey * 7919 + 17, resizeOnly ? prev : (replay ? null : prev), changed);
    for (const r of runs) seen.current[r.track] = r.careers;
    if (resizeOnly) {
      // Keep the clock; only positions changed. Resume the loop if nothing is
      // scheduled (strict mode's rehearsal unmount cancels the first frame).
      if (!raf.current) raf.current = requestAnimationFrame(loop);
      return;
    }
    start(reduced);
  }, [runs, width, active, replayKey, reduced, drawStatic, loop, start]);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!settled || !layout.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const id = ballAt(layout.current, geom.current, px, py);
    if (id !== hoverRef.current) {
      hoverRef.current = id;
      draw(performance.now(), id);
      setHover(id >= 0 ? { id, x: px, y: py, track: TRACKS3[layout.current.track[id]] } : null);
    }
  };
  const onLeave = () => {
    if (hoverRef.current !== -1) {
      hoverRef.current = -1;
      draw(performance.now(), -1);
      setHover(null);
    }
  };

  const g = geometry(width);
  const span = g.right - g.left;
  const px = (v: number) => g.left + unit(v) * span;

  return (
    <div className="cp-plinko-board" ref={wrap}>
      <canvas ref={canvas} onMouseMove={onMove} onMouseLeave={onLeave} aria-label="Plinko board of simulated careers" role="img" />
      <div className="cp-plinko-overlay">
        {[1, 5, 10, 15, 20, 25, 30].map((yr) => (
          <span key={yr} className="cp-plinko-year" style={{ top: g.rowsTop + (yr - 1) * g.rowPitch }}>
            {yr === 1 ? "yr 1" : yr}
          </span>
        ))}
        {(width < 640 ? TICKS.filter((v) => ![30_000, 200_000, 2_000_000].includes(v)) : TICKS).map((v) => (
          <span key={v} className="cp-plinko-tick" style={{ left: px(v), top: g.bandBottom + 8 }}>
            {fmtDollars(v)}
          </span>
        ))}
        {stats.map((s, i) => (
          <span key={s.track}>
            <span
              className="cp-plinko-median"
              style={{ left: px(s.median), top: g.bandTop - 58 + i * 13, color: COLORS[s.track], opacity: settled ? 1 : 0 }}
            >
              {LABELS[s.track]} median {fmtDollars(s.median)}
            </span>
            <span
              className="cp-plinko-bracket"
              style={{ left: px(s.p10), width: Math.max(0, px(s.p90) - px(s.p10)), top: g.bandTop - 14 + i * 4, color: COLORS[s.track], opacity: settled ? 1 : 0 }}
              title={`${LABELS[s.track]}: 10th to 90th percentile`}
            />
          </span>
        ))}
        <span className="cp-plinko-year" style={{ top: g.bandTop + 6, left: 0, color: "#6b6b6b" }}>avg</span>
      </div>
      {hover && careers[hover.id] && (
        <div
          className="cp-plinko-tip"
          style={{ left: Math.min(hover.x + 12, Math.max(0, width - 290)), top: Math.max(0, hover.y - 10 - 120) }}
        >
          <div className="cp-kicker" style={{ color: COLORS[hover.track] }}>
            One career · {LABELS[hover.track]} first
          </div>
          <div>{storyOf(careers[hover.id])}</div>
          <div className="cp-mono" style={{ marginTop: 4, fontSize: 11 }}>
            30-yr average {fmtDollars(avgFirst(careers[hover.id], ROWS))}
          </div>
        </div>
      )}
    </div>
  );
}

const STORY: Record<string, (yr: number, amt: number) => string> = {
  fail: (yr) => `startup shut down yr ${yr}`,
  exit: (yr, amt) => `exit paid ${fmtDollars(amt)} yr ${yr}`,
  tender: (yr, amt) => `tender ${fmtDollars(amt)} yr ${yr}`,
  layoff: (yr) => `laid off yr ${yr}`,
  partner: (yr) => `partner yr ${yr}`,
  counseled: (yr) => `counseled out yr ${yr}`,
  mba: (yr) => `MBA yr ${yr}`,
  switch: (yr) => `switched jobs yr ${yr}`,
  found: (yr) => `founded a company yr ${yr}`,
};

function storyOf(c: Career): string {
  const bits = c.events
    .filter((e) => e.kind in STORY && e.year <= ROWS && !(e.kind === "tender" && e.amount < 5000))
    .slice(0, 6)
    .map((e) => STORY[e.kind](e.year, e.amount));
  return bits.length ? bits.join(" · ") : "an uneventful thirty years";
}
