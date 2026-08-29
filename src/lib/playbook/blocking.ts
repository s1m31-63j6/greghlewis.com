/**
 * Blocking schemes, and how they become line paths.
 *
 * Schemes are authored in PLAYSIDE / BACKSIDE terms, never LT/RT. That single
 * decision is what makes Power Right and Power Left the same data, and it means
 * the whole run library needs six assignments per play instead of eleven.
 *
 * A pull is not a separate concept. It is a BlockRule on a lineman, which
 * collapses what would otherwise be a parallel "pullers" system into the same
 * dozen geometry primitives everything else uses.
 *
 * ZONE IS A LOOKUP, NOT A RULE SET. If a presumed-front defender sits within
 * eight tenths of a yard of a lineman, block him; otherwise combo with the
 * adjacent covered lineman and climb. Two branches of one `if` yields inside
 * zone, outside zone, and wide zone.
 */

import { gapAnchor, variant as variantOf } from "./field.ts";
import type {
  BlockRule,
  BlockingScheme,
  FieldVariant,
  FieldVariantId,
  GapId,
  LineSlot,
  ResolvedPath,
  ResolvedPlayer,
  SlotId,
  Vec,
} from "./types.ts";

// ─── presumed fronts ────────────────────────────────────────────────────────

/**
 * A run play has to be drawn against *something* or the blocks have no targets.
 * These are the default looks per variant — not a defensive play, just enough
 * geometry for the line to aim at. A real defensive play overrides them.
 */
const PRESUMED: Record<string, { slot: string; x: number; y: number }[]> = {
  "over-4-3": [
    { slot: "E", x: -5.4, y: 0.9 },
    { slot: "T", x: -2.4, y: 0.9 },
    { slot: "N", x: 1.2, y: 0.9 },
    { slot: "E2", x: 5.4, y: 0.9 },
    { slot: "W", x: -4.0, y: 4.6 },
    { slot: "M", x: 0.3, y: 4.8 },
    { slot: "S", x: 4.4, y: 4.6 },
  ],
  "5-2": [
    { slot: "E", x: -4.6, y: 0.9 },
    { slot: "N", x: 0, y: 0.9 },
    { slot: "E2", x: 4.6, y: 0.9 },
    { slot: "W", x: -3.0, y: 4.2 },
    { slot: "M", x: 3.0, y: 4.2 },
  ],
  "3-2-2": [
    { slot: "E", x: -2.8, y: 0.9 },
    { slot: "N", x: 0, y: 0.9 },
    { slot: "E2", x: 2.8, y: 0.9 },
    { slot: "M", x: 0, y: 4.2 },
  ],
  "1-rusher": [{ slot: "R", x: 0, y: 7 }],
};

export function presumedFront(v: FieldVariant): { slot: string; at: Vec }[] {
  const rows = PRESUMED[v.presumedFront] ?? PRESUMED["over-4-3"];
  return rows.map((r) => ({
    slot: r.slot,
    at: { x: r.x * v.widthScale, y: r.y * v.depthScale },
  }));
}

// ─── the scheme library ─────────────────────────────────────────────────────

export const SCHEMES: BlockingScheme[] = [
  {
    id: "power",
    name: "Power",
    kind: "gap",
    rules: {
      PST: { block: "down" },
      PSG: { block: "down" },
      C: { block: "back", target: "backside-A" },
      BSG: { block: "wrap", path: "wrap", target: "playside-B" },
      BST: { block: "hinge" },
    },
    combos: [["PST", "PSG"]],
    notes: "Down, down, back. Backside guard wraps to the playside backer.",
  },
  {
    id: "counter",
    name: "Counter GT",
    kind: "gap",
    rules: {
      PST: { block: "down" },
      PSG: { block: "down" },
      C: { block: "back", target: "backside-A" },
      BSG: { block: "wrap", path: "wrap", target: "playside-C" },
      BST: { block: "kickout", target: "EMLOS" },
    },
    combos: [["PST", "PSG"]],
    notes: "Guard and tackle both pull: guard kicks, tackle wraps.",
  },
  {
    id: "trap",
    name: "Trap",
    kind: "gap",
    rules: {
      PST: { block: "climb", target: "second-level" },
      PSG: { block: "climb", target: "PSLB" },
      C: { block: "back", target: "backside-A" },
      BSG: { block: "trap", target: "playside-B" },
      BST: { block: "hinge" },
    },
    notes: "Let the three-technique come, trap him with the backside guard.",
  },
  {
    id: "inside-zone",
    name: "Inside Zone",
    kind: "zone",
    rules: { "*": { block: "reach", target: "playside-A" } },
    notes: "Covered/uncovered. Aiming point is the playside A gap.",
  },
  {
    id: "outside-zone",
    name: "Outside Zone",
    kind: "zone",
    rules: { "*": { block: "reach", target: "playside-C" } },
    notes: "Same rules, wider landmark. The back presses the edge.",
  },
  {
    id: "duo",
    name: "Duo",
    kind: "zone",
    rules: { "*": { block: "base" } },
    combos: [
      ["PST", "PSG"],
      ["C", "BSG"],
    ],
    notes: "Double teams at the point, no puller. The back reads the backer.",
  },
  {
    id: "slide-right",
    name: "Slide Right",
    kind: "pass",
    rules: { "*": { block: "slide", target: "playside-A" } },
  },
  {
    id: "slide-left",
    name: "Slide Left",
    kind: "pass",
    rules: { "*": { block: "slide", target: "backside-A" } },
  },
  {
    id: "big-on-big",
    name: "Big on Big",
    kind: "pass",
    rules: { "*": { block: "pass-set" } },
  },
  {
    id: "half-slide",
    name: "Half Slide",
    kind: "pass",
    rules: {
      PST: { block: "pass-set" },
      PSG: { block: "pass-set" },
      C: { block: "slide", target: "backside-A" },
      BSG: { block: "slide", target: "backside-A" },
      BST: { block: "hinge" },
    },
  },
  {
    id: "pin-pull",
    name: "Pin and Pull",
    kind: "gap",
    rules: {
      PST: { block: "down" },
      PSG: { block: "skip-pull", path: "skip", target: "playside-D" },
      C: { block: "reach", target: "playside-A" },
      BSG: { block: "skip-pull", path: "skip", target: "playside-C" },
      BST: { block: "scoop" },
    },
    notes: "Covered linemen pin down, uncovered linemen pull around them.",
  },
  {
    id: "sprint-right",
    name: "Sprint Right",
    kind: "pass",
    rules: { "*": { block: "reach", target: "playside-B" } },
    notes: "The whole line runs with the quarterback; no backside protection.",
  },
  {
    id: "max-protect",
    name: "Max Protect",
    kind: "pass",
    rules: {
      PST: { block: "pass-set" },
      PSG: { block: "pass-set" },
      C: { block: "pass-set" },
      BSG: { block: "pass-set" },
      BST: { block: "hinge" },
    },
    notes: "Seven-man protection. Two receivers out, and time to get them deep.",
  },
  {
    id: "fold",
    name: "Fold",
    kind: "gap",
    rules: {
      PST: { block: "base" },
      PSG: { block: "climb", target: "PSLB" },
      C: { block: "down" },
      BSG: { block: "back", target: "backside-A" },
      BST: { block: "hinge" },
    },
    combos: [["C", "BSG"]],
    notes: "The guard goes around the center's down block into the linebacker.",
  },
  {
    id: "screen-release",
    name: "Screen Release",
    kind: "pass",
    rules: { "*": { block: "climb", target: "second-level" } },
    notes: "One-step set, then release to the second and third level.",
  },
];

const SCHEME_BY_ID = new Map(SCHEMES.map((s) => [s.id, s]));

export function schemeById(id: string): BlockingScheme | undefined {
  return SCHEME_BY_ID.get(id);
}

// ─── resolution ─────────────────────────────────────────────────────────────

/** Maps a physical line slot onto its relative name for a given playside. */
function relativeName(
  slot: SlotId,
  order: SlotId[],
  playsideSign: 1 | -1,
): LineSlot | null {
  const i = order.indexOf(slot);
  if (i < 0) return null;
  const mid = (order.length - 1) / 2;
  const offset = (i - mid) * playsideSign;
  if (offset === 0) return "C";
  if (offset === 1) return "PSG";
  if (offset === 2) return "PST";
  if (offset === -1) return "BSG";
  if (offset === -2) return "BST";
  return null;
}

function nearestDefender(
  at: Vec,
  front: { slot: string; at: Vec }[],
  withinYd: number,
): { slot: string; at: Vec } | null {
  let best: { slot: string; at: Vec } | null = null;
  let bestD = withinYd;
  for (const d of front) {
    const dist = Math.abs(d.at.x - at.x);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

const LINE_ORDER: Record<number, SlotId[]> = {
  0: [],
  1: ["C"],
  3: ["LG", "C", "RG"],
  4: ["LG", "C", "RG", "RT"],
  5: ["LT", "LG", "C", "RG", "RT"],
};

/** The dozen geometry primitives. Everything the line does is one of these. */
function ruleGeometry(
  rule: BlockRule,
  from: Vec,
  playsideSign: 1 | -1,
  v: FieldVariant,
  front: { slot: string; at: Vec }[],
): { points: Vec[]; cap: "tbar" | "arrow"; curve: "spline" | "polyline" } {
  const ps = playsideSign;
  const w = v.widthScale;
  const d = v.depthScale;
  const target = (rule.target as GapId | undefined) ?? undefined;
  const gap = (g: GapId, level: 1 | 2 = 1) => gapAnchor(g, ps, v, level);
  const covering = nearestDefender(from, front, 0.9 * w);

  switch (rule.block) {
    case "base":
      return {
        points: [from, covering ? covering.at : { x: from.x, y: from.y + 1.2 * d }],
        cap: "tbar",
        curve: "polyline",
      };
    case "down":
      return {
        points: [from, { x: from.x - ps * 1.7 * w, y: from.y + 1.1 * d }],
        cap: "tbar",
        curve: "polyline",
      };
    case "back":
      return {
        points: [from, gap(target ?? "backside-A")],
        cap: "tbar",
        curve: "polyline",
      };
    case "reach":
      return {
        points: [from, { x: from.x + ps * 1.3 * w, y: from.y + 1.0 * d }],
        cap: "tbar",
        curve: "spline",
      };
    case "scoop":
      return {
        points: [from, { x: from.x - ps * 1.3 * w, y: from.y + 1.0 * d }],
        cap: "tbar",
        curve: "spline",
      };
    case "combo":
      return {
        points: [
          from,
          { x: from.x + ps * 0.5 * w, y: from.y + 1.1 * d },
          { x: from.x + ps * 1.1 * w, y: 4.5 * d },
        ],
        cap: "tbar",
        curve: "spline",
      };
    case "climb":
      return {
        points: [from, { x: from.x + ps * 0.6 * w, y: 4.5 * d }],
        cap: "tbar",
        curve: "polyline",
      };
    case "kickout":
      return {
        points: [
          from,
          { x: from.x, y: from.y - 1.1 * d },
          { x: ps * 5.4 * w, y: 0.8 * d },
          { x: ps * 6.4 * w, y: 1.1 * d },
        ],
        cap: "tbar",
        curve: "polyline",
      };
    case "log":
      return {
        points: [
          from,
          { x: from.x, y: from.y - 1.1 * d },
          { x: ps * 5.4 * w, y: 0.8 * d },
          { x: ps * 4.4 * w, y: 1.4 * d },
        ],
        cap: "tbar",
        curve: "polyline",
      };
    case "wrap":
    case "skip-pull":
      return {
        points: [
          from,
          { x: from.x + ps * 1.5 * w, y: -1.2 * d },
          gap(target ?? "playside-B", 2),
        ],
        cap: "tbar",
        curve: "polyline",
      };
    case "trap":
      return {
        points: [from, { x: from.x + ps * 1.6 * w, y: -0.5 * d }, gap(target ?? "playside-B")],
        cap: "tbar",
        curve: "polyline",
      };
    case "hinge":
      return {
        points: [from, { x: from.x - ps * 1.4 * w, y: from.y - 1.4 * d }],
        cap: "tbar",
        curve: "spline",
      };
    case "fan":
      return {
        points: [from, { x: from.x + ps * 1.0 * w, y: from.y - 0.8 * d }],
        cap: "tbar",
        curve: "polyline",
      };
    case "slide":
      return {
        points: [from, { x: from.x + ps * 1.3 * w, y: from.y - 1.0 * d }],
        cap: "tbar",
        curve: "polyline",
      };
    case "pass-set":
      return {
        points: [from, { x: from.x, y: from.y - 1.5 * d }],
        cap: "tbar",
        curve: "polyline",
      };
    case "stalk":
      return {
        points: [from, { x: from.x, y: from.y + 4 * d }],
        cap: "tbar",
        curve: "polyline",
      };
    case "crack":
      return {
        points: [from, { x: from.x - ps * 3 * w, y: from.y + 3 * d }],
        cap: "tbar",
        curve: "polyline",
      };
    case "seal":
      return {
        points: [from, { x: from.x - ps * 1.0 * w, y: from.y + 2.4 * d }],
        cap: "tbar",
        curve: "polyline",
      };
    case "arc":
      return {
        points: [
          from,
          { x: from.x + ps * 2.0 * w, y: from.y + 1.0 * d },
          { x: from.x + ps * 3.4 * w, y: 4.2 * d },
        ],
        cap: "tbar",
        curve: "spline",
      };
  }
}

export function resolveBlocking(
  scheme: BlockingScheme,
  players: ResolvedPlayer[],
  variantId: FieldVariantId,
  playsideSign: 1 | -1,
): ResolvedPath[] {
  const v = variantOf(variantId);
  if (!v.blockingLegal) return [];

  const order = LINE_ORDER[v.line.count] ?? LINE_ORDER[5];
  const front = presumedFront(v);
  const linemen = players.filter((p) => p.role === "ol");
  const out: ResolvedPath[] = [];

  for (const p of linemen) {
    const rel = relativeName(p.slot as SlotId, order, playsideSign);
    if (!rel) continue;

    let rule = scheme.rules[rel] ?? scheme.rules["*"];
    if (!rule) continue;

    // Zone's covered/uncovered lookup. This one branch is the difference
    // between inside, outside, and wide zone being three schemes rather than
    // thirty hand-drawn lines.
    if (scheme.kind === "zone" && rule.block === "reach") {
      const covered = nearestDefender(p.at, front, 0.8 * v.widthScale);
      rule = covered
        ? { block: "base" }
        : { block: "combo", target: rule.target };
    }

    const g = ruleGeometry(rule, p.at, playsideSign, v, front);
    out.push({
      slot: p.slot,
      points: g.points,
      curve: g.curve,
      style: "solid",
      cap: g.cap,
      corner: "sharp",
      branches: [],
      startDelayMs: 0,
      durationMs: 900,
      priorityOrder: 99,
      role: "block",
      phase: "post-snap",
    });
  }

  return out;
}

/** The playside sign for a run aim, given the play's flip state. */
export function playsideSignFor(aim: GapId | undefined, flip: boolean): 1 | -1 {
  const base: 1 | -1 = aim && aim.startsWith("backside") ? -1 : 1;
  return (flip ? -base : base) as 1 | -1;
}
