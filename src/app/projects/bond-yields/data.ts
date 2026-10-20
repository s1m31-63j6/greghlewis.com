/**
 * The paper's data and the small pure helpers over it. No React here, so
 * server components (the methodology page) can read dates and levels too.
 */

import raw from "./data/yields.json";


export type Pt = { t: number; v: number; d: string };
export type Key = "dgs10" | "dff" | "dgs2" | "dfii10" | "t10yie" | "tp" | "cpi" | "unrate" | "rstar";
type Data = { asOf: string; start: string; series: Record<Key, [string, number][]> };

export const DATA = raw as unknown as Data;

export const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toPts = (s: [string, number][]): Pt[] => s.map(([d, v]) => ({ t: utc(d), v, d }));

export const S = Object.fromEntries(Object.entries(DATA.series).map(([k, s]) => [k, toPts(s)])) as Record<Key, Pt[]>;
export const T0 = utc(DATA.start);
export const T1 = utc(DATA.asOf);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string, day = true) => {
  const [y, m, d] = iso.split("-").map(Number);
  return day ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${y}`;
};
export const fmt = (v: number, digits = 2) => v.toFixed(digits);
export const last = (pts: Pt[]) => pts[pts.length - 1];

/** Index of the point nearest in time, by binary search. */
export function nearest(pts: Pt[], t: number): number {
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
export const at = (pts: Pt[], t: number) => pts[nearest(pts, t)];
export const extreme = (pts: Pt[], which: "min" | "max") =>
  pts.reduce((best, p) => ((which === "min" ? p.v < best.v : p.v > best.v) ? p : best), pts[0]);
