/**
 * Turning resolved yards into SVG path data.
 *
 * Sharp corners are the default and that is not a style preference: a five-yard
 * out with a rounded corner is a different play. Miter joins, butt caps, and
 * straight `L` segments unless a route explicitly asks to be curved.
 *
 * Every stroke in the app carries `vector-effect="non-scaling-stroke"` so a
 * 2.2px line stays 2.2px at six times zoom. Dash arrays do NOT get that
 * treatment in every engine, so anything dashed divides its pattern by the
 * camera scale explicitly — see `dashFor`.
 */

import { UPY, toSvg } from "./field.ts";
import type { Corner, CurveMode, FieldVariant, PathStyle, Vec } from "./types.ts";

export interface Pt {
  x: number;
  y: number;
}

export function toPts(points: Vec[], v: FieldVariant): Pt[] {
  return points.map((p) => toSvg(p, v));
}

/** Catmull-Rom through the points, converted to cubic Béziers. */
function splineD(p: Pt[]): string {
  if (p.length < 3) return `M ${p[0].x} ${p[0].y} L ${p[p.length - 1].x} ${p[p.length - 1].y}`;
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** A polyline with the corners softened by a fixed radius. */
function roundedD(p: Pt[], r: number): string {
  if (p.length < 3) return `M ${p[0].x} ${p[0].y} L ${p[p.length - 1].x} ${p[p.length - 1].y}`;
  let d = `M ${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1];
    const b = p[i];
    const c = p[i + 1];
    const la = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const lc = Math.hypot(c.x - b.x, c.y - b.y) || 1;
    const ra = Math.min(r, la / 2, lc / 2);
    const s = { x: b.x - ((b.x - a.x) / la) * ra, y: b.y - ((b.y - a.y) / la) * ra };
    const e = { x: b.x + ((c.x - b.x) / lc) * ra, y: b.y + ((c.y - b.y) / lc) * ra };
    d += ` L ${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${b.x.toFixed(1)} ${b.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
  }
  const last = p[p.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

export function pathD(pts: Pt[], curve: CurveMode, corner: Corner = "sharp"): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (curve === "spline") return splineD(pts);
  if (corner === "round") return roundedD(pts, 0.8 * UPY);
  return pts.map((q, i) => `${i ? "L" : "M"} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ");
}

/**
 * A zigzag along the path, which is the motion convention Playmaker X uses and
 * a fair number of coaches read faster than a dashed line. The last stretch is
 * left straight so the arrowhead has something to sit on.
 */
export function zigzagD(pts: Pt[], amplitude = 5, wavelength = 7): string {
  if (pts.length < 2) return pathD(pts, "polyline");
  const a = pts[0];
  const b = pts[pts.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < wavelength * 2) return pathD(pts, "polyline");
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const nx = -uy;
  const ny = ux;
  const tail = Math.min(8, len * 0.25);
  const zig = len - tail;
  const n = Math.max(2, Math.round(zig / wavelength));
  let d = `M ${a.x.toFixed(1)} ${a.y.toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const t = (i / n) * zig;
    const s = i % 2 ? 1 : -1;
    d += ` L ${(a.x + ux * t + nx * amplitude * s).toFixed(1)} ${(a.y + uy * t + ny * amplitude * s).toFixed(1)}`;
  }
  d += ` L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  return d;
}

/** Unit heading of the final segment, which every terminator is drawn against. */
export function heading(pts: Pt[]): { x: number; y: number } {
  if (pts.length < 2) return { x: 0, y: -1 };
  const b = pts[pts.length - 1];
  let a = pts[pts.length - 2];
  // Skip degenerate final segments so a settle cap does not point at nothing.
  for (let i = pts.length - 2; i >= 0 && Math.hypot(b.x - a.x, b.y - a.y) < 0.5; i--) a = pts[i];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

/** Filled triangle. `long` is along the heading, `wide` across it. */
export function arrowPoints(tip: Pt, h: { x: number; y: number }, long: number, wide: number): string {
  const bx = tip.x - h.x * long;
  const by = tip.y - h.y * long;
  const nx = -h.y;
  const ny = h.x;
  return [
    `${tip.x.toFixed(1)},${tip.y.toFixed(1)}`,
    `${(bx + nx * wide).toFixed(1)},${(by + ny * wide).toFixed(1)}`,
    `${(bx - nx * wide).toFixed(1)},${(by - ny * wide).toFixed(1)}`,
  ].join(" ");
}

/** The perpendicular bar that means "block this man". */
export function tbarPoints(end: Pt, h: { x: number; y: number }, halfWidth: number) {
  const nx = -h.y;
  const ny = h.x;
  return {
    x1: end.x + nx * halfWidth,
    y1: end.y + ny * halfWidth,
    x2: end.x - nx * halfWidth,
    y2: end.y - ny * halfWidth,
  };
}

/** An open chevron, for a ball path or a motion terminus. */
export function chevronD(tip: Pt, h: { x: number; y: number }, long: number, wide: number): string {
  const bx = tip.x - h.x * long;
  const by = tip.y - h.y * long;
  const nx = -h.y;
  const ny = h.x;
  return (
    `M ${(bx + nx * wide).toFixed(1)} ${(by + ny * wide).toFixed(1)} ` +
    `L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} ` +
    `L ${(bx - nx * wide).toFixed(1)} ${(by - ny * wide).toFixed(1)}`
  );
}

/**
 * Dash patterns divided by the camera scale. `vector-effect` keeps the WIDTH
 * constant under zoom but does not reliably keep the PATTERN constant, so this
 * is computed rather than declared.
 */
export function dashFor(style: PathStyle, k = 1): string | undefined {
  if (style === "dashed") return `${6 / k} ${4 / k}`;
  if (style === "dotted") return `${1 / k} ${6 / k}`;
  return undefined;
}

export function lengthOf(pts: Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

/**
 * Position along a polyline at arc-length `t` in [0,1]. The animation player
 * samples this into a fixed table once per path so its frame loop makes no DOM
 * calls at all.
 */
export function pointAt(pts: Pt[], t: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1 || t <= 0) return pts[0];
  const total = lengthOf(pts);
  if (t >= 1 || total === 0) return pts[pts.length - 1];
  let target = total * t;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (target <= seg) {
      const f = seg === 0 ? 0 : target / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
      };
    }
    target -= seg;
  }
  return pts[pts.length - 1];
}

/** Where a condition label sits: just past the branch point, off to one side. */
export function labelAnchor(pts: Pt[]): { x: number; y: number; angle: number } {
  const p = pointAt(pts, 0.62);
  const h = heading(pts);
  return { x: p.x - h.y * 9, y: p.y + h.x * 9, angle: (Math.atan2(h.y, h.x) * 180) / Math.PI };
}
