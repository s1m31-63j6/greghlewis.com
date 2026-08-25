/**
 * Formations, and how they become coordinates.
 *
 * A formation is structured data, never an opaque name: QB alignment, backs,
 * receiver distribution, strength, tags. Storing it that way buys auto-naming,
 * auto-flip, search, and personnel validation for free, and it is what lets one
 * authored formation resolve sensibly onto three different field sizes.
 *
 * The BODY BUDGET is the mechanism that makes cross-variant work. A formation
 * lists more skill players than a small-sided field has room for and gives each
 * one a `priority`; the resolver keeps the first `variant.skillCount` and
 * reports the rest, so the UI can say "3 receivers, 2 on 7-man" rather than
 * silently dropping someone.
 *
 * Receiver x comes from the variant's SPLITS TABLE, not from arithmetic on
 * `order`. That is the whole reason the table exists: a #2 in a bunch and a #2
 * in trips are different distances from the ball, and no formula recovers that.
 */

import {
  clampToField,
  sideSign,
  splitFor,
  variant as variantOf,
} from "./field.ts";
import type {
  BackSpot,
  FieldVariant,
  FieldVariantId,
  Formation,
  GlyphKind,
  PlayerRole,
  ReceiverSpot,
  ResolvedPlayer,
  SlotId,
  Vec,
} from "./types.ts";

/** Line names by count, outside in. Flag has a snapper and nothing else. */
const LINE_NAMES: Record<number, SlotId[]> = {
  0: [],
  1: ["C"],
  3: ["LG", "C", "RG"],
  4: ["LG", "C", "RG", "RT"],
  5: ["LT", "LG", "C", "RG", "RT"],
};

const QB_DEPTH: Record<Formation["qb"]["align"], number> = {
  under: -1.2,
  pistol: -3.5,
  gun: -5.0,
};

function glyphFor(slot: SlotId, style: "solid" | "classic" | "letters"): GlyphKind {
  if (slot === "C") return style === "solid" ? "square" : "circle";
  if (slot === "QB") return style === "solid" ? "double-ring" : "circle";
  return "circle";
}

function roleFor(slot: SlotId): PlayerRole {
  if (slot === "QB") return "qb";
  if (["C", "LG", "RG", "LT", "RT"].includes(slot)) return "ol";
  if (["RB", "FB", "A1", "A2"].includes(slot)) return "back";
  return "receiver";
}

/** Where a back sits, relative to the QB. */
function backPoint(spot: BackSpot, qb: Vec, v: FieldVariant): Vec {
  const s = spot.side === "mid" ? 0 : sideSign(spot.side);
  const d = v.depthScale;
  const w = v.widthScale;
  switch (spot.align) {
    case "i":
      return { x: 0, y: spot.depthYd ?? qb.y - 2.5 * d };
    case "dot":
      return { x: 0, y: spot.depthYd ?? qb.y - 1.8 * d };
    case "offset":
      return { x: s * 2.6 * w, y: spot.depthYd ?? qb.y - 0.3 };
    case "split":
      return { x: s * 3.4 * w, y: spot.depthYd ?? qb.y - 0.2 };
    case "pistol":
      return { x: 0, y: spot.depthYd ?? qb.y - 2.8 * d };
    case "diamond":
      return { x: s * 2.2 * w, y: spot.depthYd ?? qb.y - 1.0 * d };
    case "wing":
      return { x: s * splitFor("wing", v), y: spot.depthYd ?? -1.5 };
    case "slot":
      return { x: s * splitFor("slot", v), y: spot.depthYd ?? -1.0 };
  }
}

/** Shallow-merge a variant override before anything is placed. */
function applyOverride(f: Formation, id: FieldVariantId): Formation {
  const o = f.variantOverrides?.[id];
  return o ? { ...f, ...o } : f;
}

export interface ResolvedFormation {
  players: ResolvedPlayer[];
  omitted: SlotId[];
  /** Alignment points keyed by slot, before any user override. */
  points: Partial<Record<SlotId, Vec>>;
}

export function resolveFormation(
  formation: Formation,
  variantId: FieldVariantId,
  flip: boolean,
  glyphStyle: "solid" | "classic" | "letters" = "solid",
  /**
   * Slots the play actually gives a job to. On a small-sided field the budget
   * would otherwise keep whoever the formation ranked highest, which can drop
   * the two players a concept is entirely about — the mesh runners in Mesh,
   * say. An assigned player always outranks an unassigned one.
   */
  required?: ReadonlySet<SlotId>,
): ResolvedFormation {
  const v = variantOf(variantId);
  const f = applyOverride(formation, variantId);
  const players: ResolvedPlayer[] = [];
  const points: Partial<Record<SlotId, Vec>> = {};

  const push = (slot: SlotId, at: Vec, label?: string) => {
    const p = clampToField(at, v);
    points[slot] = p;
    players.push({
      slot,
      label: label ?? slot,
      at: p,
      glyph: glyphFor(slot, glyphStyle),
      role: roleFor(slot),
      isPrimary: false,
    });
  };

  // 1. The line, symmetric about the ball.
  const names = LINE_NAMES[v.line.count] ?? LINE_NAMES[5];
  const mid = (names.length - 1) / 2;
  names.forEach((slot, i) => {
    push(slot, { x: (i - mid) * v.line.splitYd, y: 0 });
  });

  // 2. The quarterback.
  const qbAt: Vec = { x: 0, y: f.qb.depthYd ?? QB_DEPTH[f.qb.align] * v.depthScale };
  push("QB", qbAt);

  // 3. Body budget. Everything the field cannot hold is reported, not dropped
  //    on the floor.
  type Spot = { kind: "back"; s: BackSpot } | { kind: "rec"; s: ReceiverSpot };
  const skill: Spot[] = [
    ...f.backs.map((s) => ({ kind: "back" as const, s })),
    ...f.receivers.map((s) => ({ kind: "rec" as const, s })),
  ]
    .map((e) => ({ ...e, need: required?.has(e.s.slot) ? 0 : 1 }))
    .sort((a, b) => a.need - b.need || a.s.priority - b.s.priority);

  const kept = skill.slice(0, v.skillCount);
  const omitted = skill.slice(v.skillCount).map((e) => e.s.slot);

  for (const e of kept) {
    if (e.kind === "back") {
      push(e.s.slot, backPoint(e.s, qbAt, v));
    } else {
      const r = e.s;
      const x = sideSign(r.side) * splitFor(r.split, v);
      // Off the line is one yard back, which is what protects a flanker from
      // press and is a real distinction a coach reads off the diagram.
      const onLine = r.onLine && v.line.count > 0;
      push(r.slot, { x, y: r.depthYd ?? (onLine ? 0 : -1.0) });
    }
  }

  // 4. Flip last, so nothing upstream ever has to think about handedness.
  if (flip) {
    for (const p of players) p.at = { x: -p.at.x, y: p.at.y };
    for (const k of Object.keys(points) as SlotId[]) {
      const pt = points[k];
      if (pt) points[k] = { x: -pt.x, y: pt.y };
    }
  }

  return { players, omitted, points };
}

// ─── the formation library ──────────────────────────────────────────────────

const F = (f: Formation): Formation => f;

export const FORMATIONS: Formation[] = [
  // ── spread / gun, the modern default ─────────────────────────────────────
  F({
    id: "gun-doubles-right",
    name: "Gun Doubles Right",
    aliases: ["Gun 2x2", "Ace Right", "Gun Deuce"],
    personnelId: "10",
    strength: "R",
    qb: { align: "gun" },
    backs: [{ slot: "RB", align: "offset", side: "L", priority: 3 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 2 },
      { slot: "Y", side: "R", order: 2, split: "slot", onLine: true, priority: 4 },
      { slot: "H", side: "L", order: 2, split: "slot", onLine: false, priority: 5 },
    ],
    tags: ["gun", "2x2", "spread", "balanced"],
  }),
  F({
    id: "gun-trips-right",
    name: "Gun Trips Right",
    aliases: ["Trey Right", "Gun Trips Rt", "3x1"],
    personnelId: "11",
    strength: "R",
    qb: { align: "gun" },
    backs: [{ slot: "RB", align: "offset", side: "L", priority: 3 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: true, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 2 },
      { slot: "Y", side: "R", order: 2, split: "slot", onLine: false, priority: 4 },
      { slot: "H", side: "R", order: 3, split: "nasty", onLine: false, priority: 5 },
    ],
    tags: ["gun", "3x1", "spread", "trips"],
    // Trips means nothing with three eligibles, so flag gets a real
    // three-receiver look rather than a truncated one. This override is the
    // exception — the priority list handles almost every other formation.
    variantOverrides: {
      "5flag": {
        backs: [],
        receivers: [
          { slot: "Z", side: "R", order: 1, split: "plus", onLine: false, priority: 1 },
          { slot: "Y", side: "R", order: 2, split: "slot", onLine: false, priority: 2 },
          { slot: "H", side: "R", order: 3, split: "nasty", onLine: false, priority: 3 },
        ],
      },
    },
  }),
  F({
    id: "gun-empty",
    name: "Gun Empty",
    aliases: ["Empty", "Spread Empty", "Gun 3x2"],
    personnelId: "10",
    strength: "R",
    qb: { align: "gun" },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: true, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 2 },
      { slot: "H", side: "L", order: 2, split: "slot", onLine: false, priority: 3 },
      { slot: "Y", side: "R", order: 2, split: "slot", onLine: false, priority: 4 },
      { slot: "F", side: "R", order: 3, split: "nasty", onLine: false, priority: 5 },
    ],
    tags: ["gun", "empty", "3x2", "spread", "no-back"],
  }),
  F({
    id: "gun-bunch-right",
    name: "Gun Bunch Right",
    aliases: ["Bunch", "Cluster Right"],
    personnelId: "11",
    strength: "R",
    qb: { align: "gun" },
    backs: [{ slot: "RB", align: "offset", side: "L", priority: 3 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "nasty", onLine: true, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 2 },
      { slot: "Y", side: "R", order: 2, split: "wing", onLine: false, priority: 4 },
      { slot: "H", side: "R", order: 3, split: "tight", onLine: false, priority: 5 },
    ],
    tags: ["gun", "bunch", "condensed", "rub"],
  }),
  F({
    id: "gun-twins-right",
    name: "Gun Twins Right",
    aliases: ["Twins", "Gun Twins Rt"],
    personnelId: "11",
    strength: "R",
    qb: { align: "gun" },
    backs: [{ slot: "RB", align: "offset", side: "R", priority: 2 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: true, priority: 1 },
      { slot: "H", side: "R", order: 2, split: "slot", onLine: false, priority: 3 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 4 },
      { slot: "Y", side: "L", order: 2, split: "attached", onLine: true, priority: 5 },
    ],
    tags: ["gun", "twins", "2x1"],
  }),
  F({
    id: "pistol-ace-right",
    name: "Pistol Ace Right",
    aliases: ["Pistol Singleback", "Pistol Y-Right"],
    personnelId: "11",
    strength: "R",
    qb: { align: "pistol" },
    backs: [{ slot: "RB", align: "pistol", side: "mid", priority: 2 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 3 },
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 4 },
      { slot: "H", side: "L", order: 2, split: "slot", onLine: false, priority: 5 },
    ],
    tags: ["pistol", "singleback", "balanced"],
  }),

  // ── under center ─────────────────────────────────────────────────────────
  F({
    id: "i-pro-right",
    name: "I-Formation Pro Right",
    aliases: ["I Pro", "I-Form Right", "Pro I"],
    personnelId: "21",
    strength: "R",
    qb: { align: "under" },
    backs: [
      { slot: "FB", align: "i", side: "mid", depthYd: -3.2, priority: 2 },
      { slot: "RB", align: "i", side: "mid", depthYd: -6.2, priority: 1 },
    ],
    receivers: [
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 3 },
      { slot: "Z", side: "R", order: 1, split: "plus", onLine: false, priority: 4 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "i-formation", "two-back", "pro"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "singleback-ace",
    name: "Singleback Ace",
    aliases: ["Ace", "Singleback", "One Back"],
    personnelId: "12",
    strength: "R",
    qb: { align: "under" },
    backs: [{ slot: "RB", align: "i", side: "mid", depthYd: -6.0, priority: 1 }],
    receivers: [
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 2 },
      { slot: "H", side: "L", order: 2, split: "attached", onLine: true, priority: 3 },
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 4 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "singleback", "two-te", "balanced"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "strong-i-right",
    name: "Strong I Right",
    aliases: ["Strong I", "Offset I Right"],
    personnelId: "21",
    strength: "R",
    qb: { align: "under" },
    backs: [
      { slot: "FB", align: "offset", side: "R", depthYd: -3.4, priority: 2 },
      { slot: "RB", align: "i", side: "mid", depthYd: -6.2, priority: 1 },
    ],
    receivers: [
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 3 },
      { slot: "Z", side: "R", order: 1, split: "plus", onLine: false, priority: 4 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "offset-i", "two-back", "power"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "wing-t-right",
    name: "Wing-T Right",
    aliases: ["Wing T", "Wing Right", "Delaware Wing"],
    personnelId: "21",
    strength: "R",
    qb: { align: "under" },
    backs: [
      { slot: "FB", align: "i", side: "mid", depthYd: -4.0, priority: 2 },
      { slot: "RB", align: "offset", side: "L", depthYd: -4.5, priority: 3 },
      { slot: "A1", align: "wing", side: "R", priority: 1 },
    ],
    receivers: [
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 4 },
      { slot: "X", side: "L", order: 1, split: "plus", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "wing-t", "wingback", "series"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "flexbone",
    name: "Flexbone",
    aliases: ["Spread Option", "Double Slot", "Flex"],
    personnelId: "20",
    strength: "R",
    qb: { align: "under" },
    backs: [
      { slot: "FB", align: "i", side: "mid", depthYd: -4.3, priority: 1 },
      { slot: "A1", align: "wing", side: "R", priority: 2 },
      { slot: "A2", align: "wing", side: "L", priority: 3 },
    ],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: true, priority: 4 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "flexbone", "triple-option", "a-backs"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "goal-line-heavy",
    name: "Goal Line Heavy",
    aliases: ["Jumbo", "22 Personnel", "Full House"],
    personnelId: "22",
    strength: "R",
    qb: { align: "under" },
    backs: [
      { slot: "FB", align: "i", side: "mid", depthYd: -3.0, priority: 2 },
      { slot: "RB", align: "i", side: "mid", depthYd: -5.4, priority: 1 },
    ],
    receivers: [
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 3 },
      { slot: "H", side: "L", order: 2, split: "attached", onLine: true, priority: 4 },
      { slot: "V", side: "R", order: 1, split: "wing", onLine: false, priority: 5 },
    ],
    tags: ["under-center", "goal-line", "heavy", "jumbo"],
    variantScope: ["11man", "9man", "8man"],
  }),

  // ── flag and small-sided ─────────────────────────────────────────────────
  F({
    id: "flag-spread",
    name: "Spread",
    aliases: ["Flag Spread", "Open"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: false, priority: 2 },
      { slot: "H", side: "R", order: 2, split: "slot", onLine: false, priority: 3 },
    ],
    tags: ["flag", "spread", "balanced"],
    variantScope: ["5flag", "7man"],
  }),
  F({
    id: "flag-trips",
    name: "Trips",
    aliases: ["Flag Trips", "Stack Right"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "plus", onLine: false, priority: 1 },
      { slot: "H", side: "R", order: 2, split: "slot", onLine: false, priority: 2 },
      { slot: "Y", side: "R", order: 3, split: "nasty", onLine: false, priority: 3 },
    ],
    tags: ["flag", "trips", "3x0", "overload"],
    variantScope: ["5flag", "7man"],
  }),
  F({
    id: "flag-bunch",
    name: "Bunch",
    aliases: ["Flag Bunch", "Cluster"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "nasty", onLine: false, priority: 1 },
      { slot: "H", side: "R", order: 2, split: "wing", onLine: false, depthYd: -2.2, priority: 2 },
      { slot: "Y", side: "R", order: 3, split: "tight", onLine: false, depthYd: -1.0, priority: 3 },
    ],
    tags: ["flag", "bunch", "condensed", "rub"],
    variantScope: ["5flag", "7man"],
  }),
  F({
    id: "flag-twins",
    name: "Twins",
    aliases: ["Flag Twins", "Doubles"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [{ slot: "RB", align: "offset", side: "L", priority: 3 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 1 },
      { slot: "H", side: "R", order: 2, split: "slot", onLine: false, priority: 2 },
    ],
    tags: ["flag", "twins", "2x0"],
    variantScope: ["5flag", "7man"],
  }),
  F({
    id: "flag-stack",
    name: "Stack",
    aliases: ["Flag Stack", "Tower"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "plus", onLine: false, priority: 1 },
      { slot: "H", side: "R", order: 2, split: "plus", onLine: false, depthYd: -2.2, priority: 2 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: false, priority: 3 },
    ],
    tags: ["flag", "stack", "press-beater"],
    variantScope: ["5flag", "7man"],
  }),
  F({
    id: "flag-i",
    name: "Flag I",
    aliases: ["I", "Tandem"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [
      { slot: "RB", align: "i", side: "mid", depthYd: -6.0, priority: 2 },
      { slot: "FB", align: "i", side: "mid", depthYd: -2.4, priority: 3 },
    ],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 1 },
    ],
    tags: ["flag", "i-formation", "run-heavy"],
    variantScope: ["5flag", "7man"],
  }),
  F({
    id: "seven-trips-right",
    name: "Trips Right",
    aliases: ["7v7 Trips", "Trips"],
    strength: "R",
    qb: { align: "gun" },
    backs: [{ slot: "RB", align: "offset", side: "L", priority: 4 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 1 },
      { slot: "Y", side: "R", order: 2, split: "slot", onLine: false, priority: 2 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: false, priority: 3 },
      { slot: "H", side: "R", order: 3, split: "nasty", onLine: false, priority: 5 },
    ],
    tags: ["7v7", "trips", "3x1"],
    variantScope: ["7man"],
  }),

  // ── more gun looks ───────────────────────────────────────────────────────
  // Gun Doubles was carrying a quarter of the library on its own, which made
  // scrolling the library feel like one formation with different squiggles.
  F({
    id: "gun-trey-right",
    name: "Gun Trey Right",
    aliases: ["Trey", "Gun Trey", "TE Trips"],
    personnelId: "11",
    strength: "R",
    qb: { align: "gun" },
    backs: [{ slot: "RB", align: "offset", side: "L", priority: 3 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 2 },
      { slot: "Y", side: "R", order: 3, split: "attached", onLine: true, priority: 4 },
      { slot: "H", side: "R", order: 2, split: "slot", onLine: false, priority: 5 },
    ],
    tags: ["gun", "3x1", "trey", "attached-te", "spread"],
  }),
  F({
    id: "gun-quads-right",
    name: "Gun Quads Right",
    aliases: ["Quads", "Four Strong", "Gun 4x1"],
    personnelId: "10",
    strength: "R",
    qb: { align: "gun" },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: true, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 2 },
      { slot: "H", side: "R", order: 2, split: "plus", onLine: false, priority: 3 },
      { slot: "Y", side: "R", order: 3, split: "slot", onLine: false, priority: 4 },
      { slot: "F", side: "R", order: 4, split: "nasty", onLine: false, priority: 5 },
    ],
    tags: ["gun", "quads", "4x1", "empty", "overload"],
    variantScope: ["11man", "7man"],
  }),
  F({
    id: "gun-stack-right",
    name: "Gun Stack Right",
    aliases: ["Stack", "Gun Stack", "Tower Right"],
    personnelId: "11",
    strength: "R",
    qb: { align: "gun" },
    backs: [{ slot: "RB", align: "offset", side: "L", priority: 3 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "plus", onLine: true, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 2 },
      { slot: "H", side: "R", order: 2, split: "plus", onLine: false, depthYd: -2.2, priority: 4 },
      { slot: "Y", side: "L", order: 2, split: "slot", onLine: false, priority: 5 },
    ],
    tags: ["gun", "stack", "press-beater", "free-release"],
  }),
  F({
    id: "gun-tight-doubles",
    name: "Gun Tight Doubles",
    aliases: ["Nasty Doubles", "Condensed", "Gun Tight"],
    personnelId: "11",
    strength: "R",
    qb: { align: "gun" },
    backs: [{ slot: "RB", align: "offset", side: "R", priority: 3 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "nasty", onLine: true, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "nasty", onLine: true, priority: 2 },
      { slot: "Y", side: "R", order: 2, split: "tight", onLine: false, priority: 4 },
      { slot: "H", side: "L", order: 2, split: "tight", onLine: false, priority: 5 },
    ],
    tags: ["gun", "condensed", "nasty-splits", "crossers", "run-game"],
  }),
  F({
    id: "gun-y-off-right",
    name: "Gun Y-Off Right",
    aliases: ["Y-Off", "H-Back Gun", "Gun Ace Y-Off"],
    personnelId: "11",
    strength: "R",
    qb: { align: "gun" },
    backs: [
      { slot: "RB", align: "offset", side: "L", priority: 2 },
      { slot: "H", align: "wing", side: "R", depthYd: -2.4, priority: 4 },
    ],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: true, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 3 },
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 5 },
    ],
    tags: ["gun", "h-back", "y-off", "split-zone", "gap-scheme"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "gun-empty-trey",
    name: "Gun Empty Trey",
    aliases: ["Empty Trey", "Gun 3x2", "Five Wide"],
    personnelId: "11",
    strength: "R",
    qb: { align: "gun" },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: true, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 2 },
      { slot: "Y", side: "R", order: 2, split: "slot", onLine: false, priority: 3 },
      { slot: "H", side: "R", order: 3, split: "nasty", onLine: false, priority: 4 },
      { slot: "F", side: "L", order: 2, split: "slot", onLine: false, priority: 5 },
    ],
    tags: ["gun", "empty", "3x2", "no-back", "quick-game"],
  }),

  // ── pistol ───────────────────────────────────────────────────────────────
  F({
    id: "pistol-trips-right",
    name: "Pistol Trips Right",
    aliases: ["Pistol Trips", "Pistol 3x1"],
    personnelId: "11",
    strength: "R",
    qb: { align: "pistol" },
    backs: [{ slot: "RB", align: "pistol", side: "mid", priority: 2 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: true, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 3 },
      { slot: "Y", side: "R", order: 2, split: "slot", onLine: false, priority: 4 },
      { slot: "H", side: "R", order: 3, split: "nasty", onLine: false, priority: 5 },
    ],
    tags: ["pistol", "3x1", "downhill", "rpo"],
  }),
  F({
    id: "pistol-strong-right",
    name: "Pistol Strong Right",
    aliases: ["Pistol Two Back", "Pistol Strong"],
    personnelId: "21",
    strength: "R",
    qb: { align: "pistol" },
    backs: [
      { slot: "RB", align: "pistol", side: "mid", priority: 1 },
      { slot: "FB", align: "wing", side: "R", depthYd: -2.6, priority: 3 },
    ],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "plus", onLine: true, priority: 2 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 4 },
      { slot: "Y", side: "L", order: 2, split: "attached", onLine: true, priority: 5 },
    ],
    tags: ["pistol", "two-back", "power", "downhill"],
    variantScope: ["11man", "9man", "8man"],
  }),

  // ── under centre ─────────────────────────────────────────────────────────
  F({
    id: "split-backs-pro",
    name: "Split Backs Pro",
    aliases: ["Pro Set", "Split Backs", "Near Far"],
    personnelId: "21",
    strength: "R",
    qb: { align: "under" },
    backs: [
      { slot: "RB", align: "split", side: "R", depthYd: -5.2, priority: 1 },
      { slot: "FB", align: "split", side: "L", depthYd: -5.2, priority: 2 },
    ],
    receivers: [
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 3 },
      { slot: "Z", side: "R", order: 1, split: "plus", onLine: false, priority: 4 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "split-backs", "pro-set", "west-coast"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "weak-i-right",
    name: "Weak I Right",
    aliases: ["Weak I", "Offset I Weak"],
    personnelId: "21",
    strength: "R",
    qb: { align: "under" },
    backs: [
      { slot: "FB", align: "offset", side: "L", depthYd: -3.4, priority: 2 },
      { slot: "RB", align: "i", side: "mid", depthYd: -6.2, priority: 1 },
    ],
    receivers: [
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 3 },
      { slot: "Z", side: "R", order: 1, split: "plus", onLine: false, priority: 4 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "offset-i", "weak", "counter"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "singleback-twins-right",
    name: "Singleback Twins Right",
    aliases: ["Ace Twins", "Singleback Twins"],
    personnelId: "11",
    strength: "R",
    qb: { align: "under" },
    backs: [{ slot: "RB", align: "i", side: "mid", depthYd: -6.0, priority: 1 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 2 },
      { slot: "H", side: "R", order: 2, split: "slot", onLine: true, priority: 3 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: true, priority: 4 },
      { slot: "Y", side: "L", order: 2, split: "attached", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "singleback", "twins", "play-action"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "full-house-t",
    name: "Full House",
    aliases: ["Full House T", "Wishbone", "Three Back"],
    personnelId: "23",
    strength: "R",
    qb: { align: "under" },
    backs: [
      { slot: "FB", align: "i", side: "mid", depthYd: -3.6, priority: 1 },
      { slot: "RB", align: "split", side: "R", depthYd: -5.4, priority: 2 },
      { slot: "A1", align: "split", side: "L", depthYd: -5.4, priority: 3 },
    ],
    receivers: [
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 4 },
      { slot: "H", side: "L", order: 2, split: "attached", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "full-house", "three-back", "short-yardage", "option"],
    variantScope: ["11man", "9man", "8man"],
  }),
  F({
    id: "ace-jumbo",
    name: "Ace Jumbo",
    aliases: ["13 Personnel", "Jumbo", "Heavy"],
    personnelId: "13",
    strength: "R",
    qb: { align: "under" },
    backs: [{ slot: "RB", align: "i", side: "mid", depthYd: -5.8, priority: 1 }],
    receivers: [
      { slot: "Y", side: "R", order: 2, split: "attached", onLine: true, priority: 2 },
      { slot: "H", side: "L", order: 2, split: "attached", onLine: true, priority: 3 },
      { slot: "V", side: "R", order: 1, split: "wing", onLine: false, priority: 4 },
      { slot: "X", side: "L", order: 1, split: "plus", onLine: true, priority: 5 },
    ],
    tags: ["under-center", "heavy", "jumbo", "13-personnel", "short-yardage"],
    variantScope: ["11man", "9man", "8man"],
  }),

  // ── more flag looks ──────────────────────────────────────────────────────
  // With three eligibles the variety lives in splits and stacking rather than
  // in personnel, so these are the shapes that actually change a 5v5 defence.
  F({
    id: "flag-wide",
    name: "Wide",
    aliases: ["Flag Wide", "Spread Wide"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: false, priority: 2 },
      { slot: "H", side: "L", order: 2, split: "slot", onLine: false, priority: 3 },
    ],
    tags: ["flag", "wide", "2x1", "space"],
    variantScope: ["5flag"],
  }),
  F({
    id: "flag-tight",
    name: "Tight",
    aliases: ["Flag Tight", "Condensed"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wing", onLine: false, priority: 1 },
      { slot: "H", side: "L", order: 1, split: "wing", onLine: false, priority: 2 },
      { slot: "Y", side: "R", order: 2, split: "tight", onLine: false, depthYd: -2.4, priority: 3 },
    ],
    tags: ["flag", "tight", "condensed", "rub", "goal-line"],
    variantScope: ["5flag"],
  }),
  F({
    id: "flag-double-stack",
    name: "Double Stack",
    aliases: ["Flag Double Stack", "Two Towers"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "plus", onLine: false, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "plus", onLine: false, priority: 2 },
      { slot: "H", side: "L", order: 2, split: "plus", onLine: false, depthYd: -2.2, priority: 3 },
    ],
    tags: ["flag", "stack", "press-beater", "free-release"],
    variantScope: ["5flag"],
  }),
  F({
    id: "flag-back-set",
    name: "Back Set",
    aliases: ["Flag Back", "Offset"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [{ slot: "RB", align: "offset", side: "R", priority: 3 }],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "wide", onLine: false, priority: 1 },
      { slot: "X", side: "L", order: 1, split: "wide", onLine: false, priority: 2 },
    ],
    tags: ["flag", "back", "balanced", "screen"],
    variantScope: ["5flag"],
  }),
  F({
    id: "flag-trips-tight",
    name: "Trips Tight",
    aliases: ["Flag Trips Tight", "Cluster"],
    strength: "R",
    qb: { align: "gun", depthYd: -4.0 },
    backs: [],
    receivers: [
      { slot: "Z", side: "R", order: 1, split: "slot", onLine: false, priority: 1 },
      { slot: "H", side: "R", order: 2, split: "nasty", onLine: false, depthYd: -2.2, priority: 2 },
      { slot: "Y", side: "R", order: 3, split: "wing", onLine: false, depthYd: -1.0, priority: 3 },
    ],
    tags: ["flag", "trips", "condensed", "rub", "red-zone"],
    variantScope: ["5flag"],
  }),
];

const BY_ID = new Map(FORMATIONS.map((f) => [f.id, f]));

export function formationById(id: string): Formation | undefined {
  return BY_ID.get(id);
}

/**
 * Which formations make sense on a variant. An unscoped formation is assumed
 * universal, which is the common case.
 */
export function formationsFor(v: FieldVariantId): Formation[] {
  return FORMATIONS.filter((f) => !f.variantScope || f.variantScope.includes(v));
}
