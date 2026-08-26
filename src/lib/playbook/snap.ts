/**
 * Dragged coordinates back into the formation vocabulary.
 *
 * This module is what keeps a coach-built formation a first-class one. A play
 * is never stored as coordinates, and a formation must not be either: the
 * moment a receiver is remembered as "11.2 yards from the ball" instead of
 * "wide", it stops resolving onto the other field sizes, stops mirroring, and
 * stops being searchable as the shape it is. So the builder lets you drag, and
 * every drop is immediately reinterpreted as `side` + a named split + on or
 * off the line — the same fields the shipped formations are written in.
 *
 * The inverse mapping is derived from the forward one rather than restated:
 * `backPoint` is imported and evaluated for each candidate alignment, and the
 * nearest wins. That means a change to how a wing is placed cannot silently
 * disagree with how a wing is recognised.
 *
 * What snapping deliberately loses is precision the model has no way to store,
 * and the builder says so rather than hiding it — the inspector reports the
 * distance between where a player was dropped and where the alignment puts
 * them, so a coach who genuinely wants a 6.2-yard split learns that the
 * vocabulary has `nasty` at 5.6 and can decide whether that is close enough.
 * A stack is the one exception: depth off the line IS storable, so it is kept.
 */

import { sideSign, splitFor, variant as variantOf } from "./field.ts";
import { QB_DEPTH, backPoint } from "./formations.ts";
import type {
  BackAlign,
  BackSpot,
  FieldVariant,
  FieldVariantId,
  QBAlign,
  ReceiverSpot,
  Side,
  SlotId,
  SplitName,
  Vec,
  Yards,
} from "./types.ts";

const SPLITS: SplitName[] = [
  "wide", "plus", "slot", "nasty", "wing", "tight", "attached",
];

const BACK_ALIGNS: BackAlign[] = [
  "i", "dot", "offset", "split", "pistol", "diamond", "wing", "slot",
];

/** Off the line starts here. Anything shallower reads as on it. */
const ON_LINE_YD = 0.5;

/** Below this, a receiver's depth is the alignment's own, not a stack. */
const STACK_YD = 1.6;

export interface SplitMatch {
  name: SplitName;
  /** Where that split actually puts him on this field. */
  yd: Yards;
  /** How far the drop was from it. The builder shows this. */
  offByYd: Yards;
}

/** The named split nearest an absolute distance from the ball. */
export function nearestSplit(absX: number, v: FieldVariant): SplitMatch {
  let best: SplitMatch | null = null;
  for (const name of SPLITS) {
    const yd = splitFor(name, v);
    const offByYd = Math.abs(absX - yd);
    if (!best || offByYd < best.offByYd) best = { name, yd, offByYd };
  }
  return best as SplitMatch;
}

export interface SnappedReceiver {
  side: Side;
  split: SplitName;
  onLine: boolean;
  depthYd?: Yards;
  /** How far the drop sat from the alignment it became. */
  offByYd: Yards;
}

/**
 * A dropped point as a receiver alignment. `point` is in canonical (unflipped)
 * field yards, which is what the builder works in.
 */
export function snapReceiver(
  point: Vec,
  variantId: FieldVariantId,
  { blockingLegal = true }: { blockingLegal?: boolean } = {},
): SnappedReceiver {
  const v = variantOf(variantId);
  const side: Side = point.x < 0 ? "L" : "R";
  const match = nearestSplit(Math.abs(point.x), v);

  // With no line to be on, the distinction does not exist — flag has no
  // legality to enforce, so everyone is off it.
  const onLine = blockingLegal && point.y > -ON_LINE_YD;

  // Depth is kept only when it is doing work the split cannot: a stack.
  const depth = point.y;
  const depthYd = depth < -STACK_YD ? round(depth) : undefined;

  return { side, split: match.name, onLine, depthYd, offByYd: round(match.offByYd) };
}

export interface SnappedBack {
  align: BackAlign;
  side: Side | "mid";
  depthYd?: Yards;
  offByYd: Yards;
  /**
   * True when the drop sat in a place several alignments describe equally well
   * — every mid alignment is x = 0, so `i`, `dot` and `pistol` differ only in
   * the depth they default to, and depth is a field the formation stores
   * anyway. The builder surfaces this as a dropdown rather than pretending the
   * guess was determined.
   */
  ambiguous: boolean;
}

/**
 * A dropped point as a backfield alignment.
 *
 * TWO STAGES, because the two axes carry different weight. Lateral position is
 * the real discriminator: a back at x = 0 is in a mid alignment and a back 3.4
 * yards outside the ball is split, and no depth changes that. Depth is a free
 * parameter — `depthYd` can express any of it — so it only breaks ties within
 * a family, and whatever it cannot express is stored verbatim.
 *
 * Weighing both axes at once, which is the obvious first implementation, gets
 * this wrong in a way that shows up immediately on real formations: an I-back
 * authored six yards deep drifts to `diamond` because that alignment's default
 * depth happened to sit nearer, even though its x is 2.2 yards off.
 */
export function snapBack(
  point: Vec,
  qbAt: Vec,
  variantId: FieldVariantId,
): SnappedBack {
  const v = variantOf(variantId);
  const sides: (Side | "mid")[] = ["mid", "L", "R"];

  const candidates = BACK_ALIGNS.flatMap((align) =>
    sides.map((side) => {
      const at = backPoint({ slot: "RB", align, side, priority: 1 }, qbAt, v);
      return { align, side, at, dx: Math.abs(at.x - point.x) };
    }),
  );

  // 1. Lateral family.
  const closestX = Math.min(...candidates.map((c) => c.dx));
  const family = candidates.filter((c) => c.dx - closestX < 0.35);

  // 2. Depth breaks the tie inside it.
  const best = family.reduce((a, b) =>
    Math.abs(b.at.y - point.y) < Math.abs(a.at.y - point.y) ? b : a,
  );

  const dy = point.y - best.at.y;
  const depthYd = Math.abs(dy) > 0.4 ? round(point.y) : undefined;

  return {
    align: best.align,
    side: best.side,
    depthYd,
    offByYd: round(closestX),
    ambiguous: new Set(family.map((c) => c.align)).size > 1,
  };
}

/** The quarterback's alignment from his depth. */
export function snapQb(point: Vec, variantId: FieldVariantId): { align: QBAlign; depthYd?: Yards } {
  const v = variantOf(variantId);
  const aligns: QBAlign[] = ["under", "pistol", "gun"];
  let best: { align: QBAlign; y: number; d: number } | null = null;
  for (const align of aligns) {
    const y = QB_DEPTH[align] * v.depthScale;
    const d = Math.abs(point.y - y);
    if (!best || d < best.d) best = { align, y, d };
  }
  const q = best as { align: QBAlign; y: number; d: number };
  return { align: q.align, depthYd: Math.abs(point.y - q.y) > 0.6 ? round(point.y) : undefined };
}

/**
 * Receiver order, outside in, per side.
 *
 * Not cosmetic: coverage rules are written by number from the sideline in
 * ("carry #2 vertical"), so a formation whose numbering does not match its
 * shape would describe a defence that nobody plays. Recomputed on every drop
 * rather than tracked, because the shape is the only source of truth for it.
 */
export function renumber(receivers: ReceiverSpot[], variantId: FieldVariantId): ReceiverSpot[] {
  const v = variantOf(variantId);
  const out: ReceiverSpot[] = [];
  for (const side of ["L", "R"] as Side[]) {
    const mine = receivers.filter((r) => r.side === side);
    mine
      .sort((a, b) => splitFor(b.split, v) - splitFor(a.split, v))
      .forEach((r, i) => out.push({ ...r, order: (Math.min(i + 1, 4) as 1 | 2 | 3 | 4) }));
  }
  return out;
}

/** Where a snapped receiver will actually be drawn, for the ghost preview. */
export function receiverPoint(r: SnappedReceiver, variantId: FieldVariantId): Vec {
  const v = variantOf(variantId);
  return {
    x: sideSign(r.side) * splitFor(r.split, v),
    y: r.depthYd ?? (r.onLine ? 0 : -1.0),
  };
}

/** Slots a formation may hand out, in the order a coach tends to want them. */
export const RECEIVER_SLOTS: SlotId[] = ["X", "Z", "H", "Y", "F", "V"];
export const BACK_SLOTS: SlotId[] = ["RB", "FB", "A1", "A2"];

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
