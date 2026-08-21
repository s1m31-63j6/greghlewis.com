/**
 * Field geometry. This module is the only place in the codebase that knows how
 * big a field is, how many bodies are on it, or how a yard becomes a pixel.
 *
 * The two coordinate spaces, and the only bridge between them:
 *   - **Data is yards.** Origin at the ball, +x the offense's right,
 *     +y downfield. Backfield is negative.
 *   - **SVG is tenths of a yard**, integers, y increasing downward as SVG does.
 *
 * The field renders vertically, offense at the bottom attacking up. That is the
 * coaching-diagram convention and the only orientation that survives a phone in
 * portrait.
 *
 * Flip is a single sign change applied at the end of formation resolution, so
 * left versions of plays are never authored, stored, or indexed. A play call is
 * `{ playId, flip }`.
 */

import type {
  FieldVariant,
  FieldVariantId,
  GapId,
  GapLetter,
  Side,
  SplitName,
  Technique,
  Vec,
  Yards,
  ZoneLandmark,
} from "./types.ts";

/** SVG units per yard. Ten keeps every coordinate an integer. */
export const UPY = 10;

// ─── the variant table ──────────────────────────────────────────────────────

/**
 * `depthScale` and `widthScale` are the load-bearing numbers. Every route in
 * the library is authored once against the 11-man field and multiplied through
 * these, so a 12-yard dig becomes 7.8 yards on a flag field — which is right
 * for a seven-second clock. Two scalars per variant replace what would
 * otherwise be a per-route-per-variant table with a thousand entries.
 *
 * Only 11man, 7man and 5flag ship in the MVP. The other two rows are here
 * because the whole point of the variant table is that adding a team size is
 * data rather than code, and leaving them out would not prove that.
 */
export const VARIANTS: Record<FieldVariantId, FieldVariant> = {
  "11man": {
    id: "11man",
    label: "11-man",
    playersPerSide: 11,
    widthYd: 53.33,
    viewWidthYd: 44,
    window: { behindYd: 10, aheadYd: 24 },
    line: { count: 5, splitYd: 1.2 },
    skillCount: 5,
    depthScale: 1.0,
    widthScale: 1.0,
    maxRouteDepthYd: 28,
    hashSeparationYd: 18.5,
    splits: { wide: 16, plus: 12.5, slot: 8, nasty: 5.6, wing: 4.6, tight: 3.9, attached: 3.2 },
    presumedFront: "over-4-3",
    blockingLegal: true,
    defaultSpeedYps: 7.5,
  },
  "9man": {
    id: "9man",
    label: "9-man",
    playersPerSide: 9,
    widthYd: 40,
    viewWidthYd: 38,
    window: { behindYd: 9, aheadYd: 23 },
    line: { count: 4, splitYd: 1.2 },
    skillCount: 4,
    depthScale: 0.9,
    widthScale: 0.78,
    maxRouteDepthYd: 24,
    hashSeparationYd: 12,
    splits: { wide: 15.6, plus: 12.5, slot: 7.5, nasty: 5, wing: 4.2, tight: 3.5, attached: 3 },
    presumedFront: "5-2",
    blockingLegal: true,
    defaultSpeedYps: 7.3,
  },
  "8man": {
    id: "8man",
    label: "8-man",
    playersPerSide: 8,
    widthYd: 40,
    viewWidthYd: 38,
    window: { behindYd: 9, aheadYd: 22 },
    line: { count: 3, splitYd: 1.3 },
    skillCount: 4,
    depthScale: 0.85,
    widthScale: 0.78,
    maxRouteDepthYd: 22,
    hashSeparationYd: 12,
    splits: { wide: 15.6, plus: 12.5, slot: 7.5, nasty: 5, wing: 4.2, tight: 3.5, attached: 3 },
    presumedFront: "5-2",
    blockingLegal: true,
    defaultSpeedYps: 7.3,
  },
  "7man": {
    id: "7man",
    label: "7-on-7",
    playersPerSide: 7,
    widthYd: 40,
    viewWidthYd: 36,
    window: { behindYd: 8, aheadYd: 21 },
    // A passing-league 7v7 has a snapper and nobody else on the line: seven
    // bodies are the QB, the snapper, and five eligibles. Modelling it any
    // other way is what would stop 11-man passing concepts from porting over,
    // and porting them over is the entire point of 7v7.
    line: { count: 1, splitYd: 0 },
    skillCount: 5,
    depthScale: 0.8,
    widthScale: 0.78,
    maxRouteDepthYd: 20,
    hashSeparationYd: 12,
    splits: { wide: 15, plus: 12, slot: 7.5, nasty: 5, wing: 4, tight: 3.2, attached: 2.6 },
    presumedFront: "3-2-2",
    blockingLegal: false,
    defaultSpeedYps: 7.4,
    passClockSec: 7,
  },
  "5flag": {
    id: "5flag",
    label: "5-on-5 flag",
    playersPerSide: 5,
    widthYd: 30,
    viewWidthYd: 30,
    window: { behindYd: 7, aheadYd: 17 },
    // One snapper, who in every common ruleset is a fully eligible receiver.
    line: { count: 1, splitYd: 0 },
    skillCount: 3,
    depthScale: 0.65,
    widthScale: 0.58,
    maxRouteDepthYd: 15,
    hashSeparationYd: null,
    splits: { wide: 11, plus: 8.5, slot: 5.5, nasty: 3.6, wing: 2.8, tight: 2.2, attached: 1.8 },
    presumedFront: "1-rusher",
    blockingLegal: false,
    defaultSpeedYps: 7.0,
    // Measured from the LOS: a run is illegal when the ball is inside one of
    // these bands, and a forward pass is mandatory. No competitor draws them.
    noRunZones: [
      { fromYd: 0, toYd: 5, label: "No-run zone" },
      { fromYd: -5, toYd: 0, label: "No-run zone" },
    ],
    rushLineYd: 7,
    passClockSec: 7,
  },
};

export const MVP_VARIANTS: FieldVariantId[] = ["5flag", "7man", "11man"];

export function variant(id: FieldVariantId): FieldVariant {
  return VARIANTS[id];
}

// ─── yards <-> svg ──────────────────────────────────────────────────────────

/** The viewBox for a variant, in tenths of a yard. */
export function viewBox(v: FieldVariant): string {
  const w = Math.round(v.viewWidthYd * UPY);
  const h = Math.round((v.window.aheadYd + v.window.behindYd) * UPY);
  return `0 0 ${w} ${h}`;
}

export function svgX(x: Yards, v: FieldVariant): number {
  return (x + v.viewWidthYd / 2) * UPY;
}

export function svgY(y: Yards, v: FieldVariant): number {
  return (v.window.aheadYd - y) * UPY;
}

export function toSvg(p: Vec, v: FieldVariant): { x: number; y: number } {
  return { x: svgX(p.x, v), y: svgY(p.y, v) };
}

/** The inverse, for pointer input. */
export function fromSvg(sx: number, sy: number, v: FieldVariant): Vec {
  return {
    x: sx / UPY - v.viewWidthYd / 2,
    y: v.window.aheadYd - sy / UPY,
  };
}

/** Where the line of scrimmage sits, in SVG units. */
export function losY(v: FieldVariant): number {
  return v.window.aheadYd * UPY;
}

// ─── clamping ───────────────────────────────────────────────────────────────

/** Keeps a point on the field, with a small margin so a glyph is not cut. */
export function clampToField(p: Vec, v: FieldVariant, marginYd = 0.5): Vec {
  // Clamped to the drawing window rather than the sideline: a route that runs
  // off the diagram is unreadable even when it is perfectly legal football.
  const halfW = Math.min(v.widthYd, v.viewWidthYd) / 2 - marginYd;
  return {
    x: Math.min(halfW, Math.max(-halfW, p.x)),
    y: Math.min(v.maxRouteDepthYd, Math.max(-v.window.behindYd + marginYd, p.y)),
  };
}

/**
 * Rescale a depth for a variant. The `clamp` floor is the entire edge-case
 * story: a one-yard flat stays a one-yard flat rather than collapsing to zero.
 */
export function scaleDepth(depthYd: Yards, v: FieldVariant): Yards {
  return Math.min(v.maxRouteDepthYd, Math.max(1, depthYd * v.depthScale));
}

export function scaleWidth(lateralYd: Yards, v: FieldVariant): Yards {
  return lateralYd * v.widthScale;
}

/**
 * Rescale a user's edit delta when a play authored on one variant is viewed on
 * another. This is what keeps a drag portable: a nudge made on a 7-man field
 * still looks right on an 11-man field.
 */
export function rescaleDelta(
  d: { dx: Yards; dy: Yards },
  from: FieldVariant,
  to: FieldVariant,
): { dx: Yards; dy: Yards } {
  return {
    dx: (d.dx / from.widthScale) * to.widthScale,
    dy: (d.dy / from.depthScale) * to.depthScale,
  };
}

// ─── splits ─────────────────────────────────────────────────────────────────

export function splitFor(name: SplitName, v: FieldVariant): Yards {
  return v.splits[name];
}

export function sideSign(side: Side): 1 | -1 {
  return side === "R" ? 1 : -1;
}

// ─── gaps ───────────────────────────────────────────────────────────────────

/** Distance from the ball to the middle of each gap, on an 11-man line. */
const GAP_X: Record<GapLetter, Yards> = { A: 0.9, B: 2.4, C: 4.0, D: 5.6 };

export function gapLetter(gap: GapId): GapLetter {
  return gap.split("-")[1] as GapLetter;
}

export function gapIsPlayside(gap: GapId): boolean {
  return gap.startsWith("playside");
}

/**
 * Where a gap sits. `level` 1 is on the line, level 2 is linebacker depth —
 * which is what a climb block or a wrapping guard is aiming at.
 */
export function gapAnchor(
  gap: GapId,
  playsideSign: 1 | -1,
  v: FieldVariant,
  level: 1 | 2 = 1,
): Vec {
  const sign = gapIsPlayside(gap) ? playsideSign : (-playsideSign as 1 | -1);
  return {
    x: sign * GAP_X[gapLetter(gap)] * v.widthScale,
    y: level === 1 ? 1.0 : 4.5 * v.depthScale,
  };
}

// ─── defensive line techniques ──────────────────────────────────────────────

/**
 * Technique numbers already are a symbolic alignment vocabulary, so they get
 * the same treatment as receiver splits. The offset is measured from the
 * referenced lineman: negative is inside shade, positive is outside.
 */
const TECHNIQUE_X: Record<Technique, Yards> = {
  "0": 0,
  "1": 0.5,
  "2i": -0.4,
  "2": 0,
  "3": 0.6,
  "4i": -0.4,
  "4": 0,
  "5": 0.6,
  "6": 0,
  "7": -0.4,
  "9": 0.9,
};

/** Which offensive lineman a technique is conventionally measured against. */
const TECHNIQUE_OVER: Record<Technique, "C" | "G" | "T" | "TE"> = {
  "0": "C",
  "1": "C",
  "2i": "G",
  "2": "G",
  "3": "G",
  "4i": "T",
  "4": "T",
  "5": "T",
  "6": "TE",
  "7": "TE",
  "9": "TE",
};

export function techniqueOffset(t: Technique, v: FieldVariant): Yards {
  return TECHNIQUE_X[t] * v.widthScale;
}

export function techniqueAnchorSlot(t: Technique): "C" | "G" | "T" | "TE" {
  return TECHNIQUE_OVER[t];
}

// ─── coverage landmarks ─────────────────────────────────────────────────────

/**
 * Real coaching landmarks, not decorative blobs. Hook/curl is two yards inside
 * the hash at ten deep; seam-curl-flat is two yards outside it. Depths are in
 * 11-man yards and get scaled like everything else.
 */
const LANDMARKS: Record<
  ZoneLandmark,
  { x: number; y: Yards; rx: number; ry: Yards }
> = {
  flat: { x: 13, y: 6, rx: 6, ry: 5 },
  curl: { x: 11, y: 12, rx: 5, ry: 5 },
  "curl-flat": { x: 12, y: 9, rx: 6.5, ry: 7 },
  hook: { x: 5, y: 10, rx: 5, ry: 5 },
  "hook-curl": { x: 7.5, y: 11, rx: 6, ry: 5.5 },
  "middle-hook": { x: 0, y: 12, rx: 6, ry: 6 },
  "seam-curl-flat": { x: 11.5, y: 10, rx: 6, ry: 6 },
  "deep-third": { x: 15, y: 22, rx: 8.5, ry: 8 },
  "deep-half": { x: 13, y: 22, rx: 12, ry: 8 },
  "deep-quarter": { x: 8, y: 21, rx: 6.5, ry: 8 },
  "deep-middle": { x: 0, y: 23, rx: 9, ry: 8 },
  "low-hole": { x: 0, y: 6, rx: 5, ry: 4 },
  robber: { x: 0, y: 9, rx: 7, ry: 4.5 },
};

export function landmark(
  name: ZoneLandmark,
  side: Side | "mid",
  v: FieldVariant,
  depthOverride?: Yards,
): { cx: Yards; cy: Yards; rx: Yards; ry: Yards } {
  const l = LANDMARKS[name];
  const sign = side === "mid" ? 0 : sideSign(side);
  return {
    cx: sign * l.x * v.widthScale,
    cy: (depthOverride ?? l.y) * v.depthScale,
    rx: l.rx * v.widthScale,
    ry: l.ry * v.depthScale,
  };
}

// ─── hashes and yard lines, for the field render ────────────────────────────

/** Yard lines visible in the window, as offsets from the LOS. */
export function yardLines(v: FieldVariant): { yd: Yards; major: boolean }[] {
  const out: { yd: Yards; major: boolean }[] = [];
  const lo = Math.ceil(-v.window.behindYd / 5) * 5;
  const hi = Math.floor(v.window.aheadYd / 5) * 5;
  for (let yd = lo; yd <= hi; yd += 5) {
    out.push({ yd, major: yd % 10 === 0 });
  }
  return out;
}

/** One-yard hash marks, skipping the yard lines they sit between. */
export function hashYards(v: FieldVariant): Yards[] {
  if (v.hashSeparationYd === null) return [];
  const out: Yards[] = [];
  const lo = Math.ceil(-v.window.behindYd);
  const hi = Math.floor(v.window.aheadYd);
  for (let yd = lo; yd <= hi; yd += 1) {
    if (yd % 5 !== 0) out.push(yd);
  }
  return out;
}

export function hashX(v: FieldVariant): [number, number] | null {
  if (v.hashSeparationYd === null) return null;
  const half = v.hashSeparationYd / 2;
  return [-half, half];
}
