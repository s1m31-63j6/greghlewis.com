/**
 * Routes, and how they become polylines.
 *
 * Every route is authored ONCE, in route-local yards, where +x means OUTWARD
 * (toward the receiver's nearest sideline) and +y is downfield. Because outward
 * is derived from the resolved start position rather than stored, flipping a
 * play needs no route-level handling at all — a dig from the left and a dig
 * from the right are the same three bytes of data.
 *
 * The 0-9 tree and the named routes live in ONE library with ONE mechanism.
 * There is deliberately no second system for the non-tree routes; a mesh is a
 * point list exactly as a dig is.
 *
 * The two governing conventions of the tree, worth stating because the library
 * has to obey them: odd numbers break out, even numbers break in (0 and 9 are
 * the vertical exceptions), and numbers increase with depth.
 */

import { clampToField, scaleDepth } from "./field.ts";
import type {
  Assignment,
  Corner,
  EndCap,
  FieldVariant,
  PathStyle,
  ResolvedBranch,
  ResolvedPath,
  RouteDef,
  RouteId,
  RouteMods,
  SlotId,
  Vec,
} from "./types.ts";

const R = (
  id: RouteId,
  label: string,
  points: Vec[],
  nominalDepthYd: number,
  nominalSeconds: number,
  opts: Partial<RouteDef> = {},
): RouteDef => ({
  id,
  label,
  points,
  nominalDepthYd,
  nominalSeconds,
  curve: "polyline",
  cap: "arrow",
  style: "solid",
  tags: [],
  ...opts,
});

export const ROUTES: RouteDef[] = [
  // ── the 0-9 tree ─────────────────────────────────────────────────────────
  R("hitch", "Hitch", [{ x: 0, y: 6 }, { x: 0.4, y: 4.6 }], 6, 1.4, {
    treeNumber: 0,
    cap: "dot",
    tags: ["quick", "zone-beater", "stop"],
  }),
  R("flat", "Flat", [{ x: 0.5, y: 2 }, { x: 6, y: 3 }], 3, 1.2, {
    treeNumber: 1,
    tags: ["quick", "outbreaking", "checkdown"],
  }),
  R("slant", "Slant", [{ x: 0, y: 1.5 }, { x: -5, y: 5 }], 5, 1.3, {
    treeNumber: 2,
    tags: ["quick", "inbreaking", "blitz-beater", "man-beater"],
  }),
  R("comeback", "Comeback", [{ x: 0, y: 14 }, { x: 1.8, y: 11.5 }], 14, 2.6, {
    treeNumber: 3,
    curve: "spline",
    tags: ["outbreaking", "man-beater", "sideline"],
  }),
  R("curl", "Curl", [{ x: 0, y: 12 }, { x: -0.8, y: 10.2 }], 12, 2.4, {
    treeNumber: 4,
    curve: "spline",
    cap: "dot",
    tags: ["inbreaking", "zone-beater", "settle"],
  }),
  R("out", "Out", [{ x: 0, y: 10 }, { x: 7, y: 10.4 }], 10, 2.2, {
    treeNumber: 5,
    tags: ["outbreaking", "sideline"],
  }),
  R("dig", "Dig", [{ x: 0, y: 12 }, { x: -11, y: 12.5 }], 12, 2.5, {
    treeNumber: 6,
    tags: ["inbreaking", "intermediate", "zone-beater"],
  }),
  R("corner", "Corner", [{ x: 0, y: 10 }, { x: 7, y: 17 }], 10, 2.6, {
    treeNumber: 7,
    tags: ["outbreaking", "deep", "flag", "vs-cover-1"],
  }),
  R("post", "Post", [{ x: 0, y: 10 }, { x: -8, y: 18 }], 10, 2.6, {
    treeNumber: 8,
    tags: ["inbreaking", "deep", "vs-cover-2"],
  }),
  R("go", "Go", [{ x: 0, y: 20 }], 20, 2.8, {
    treeNumber: 9,
    tags: ["vertical", "deep", "fade", "clearout"],
  }),

  // ── named routes, same mechanism ─────────────────────────────────────────
  R("shallow", "Shallow", [{ x: 0, y: 1.5 }, { x: -14, y: 4.5 }], 4.5, 1.8, {
    tags: ["crosser", "rub", "man-beater", "quick"],
  }),
  R("mesh", "Mesh", [{ x: 0, y: 1.5 }, { x: -13, y: 5 }], 5, 1.8, {
    tags: ["crosser", "rub", "man-beater"],
  }),
  R("wheel", "Wheel", [{ x: 3, y: 1 }, { x: 6, y: 3 }, { x: 7, y: 16 }], 16, 2.7, {
    curve: "spline",
    tags: ["vertical", "outbreaking", "man-beater"],
  }),
  R("whip", "Whip", [{ x: 0, y: 5 }, { x: -3, y: 5.5 }, { x: 3, y: 5 }], 5, 1.9, {
    cap: "dot",
    tags: ["quick", "double-move", "man-beater"],
  }),
  R("bubble", "Bubble", [{ x: 1, y: -1.5 }, { x: 5, y: -0.5 }, { x: 8, y: 1.5 }], 1, 1.1, {
    curve: "spline",
    tags: ["screen", "rpo", "quick", "perimeter"],
  }),
  R("swing", "Swing", [{ x: 2, y: -2 }, { x: 7, y: -1 }, { x: 10, y: 1 }], 1, 1.4, {
    curve: "spline",
    tags: ["back", "checkdown", "perimeter"],
  }),
  R("sail", "Sail", [{ x: 0, y: 2 }, { x: 2, y: 8 }, { x: 9, y: 13 }], 13, 2.5, {
    curve: "spline",
    tags: ["outbreaking", "flood", "three-level", "vs-cover-3"],
  }),
  R("drag", "Drag", [{ x: 0, y: 3 }, { x: -12, y: 6 }], 6, 2.0, {
    tags: ["crosser", "quick", "man-beater"],
  }),
  R("seam", "Seam", [{ x: 0.5, y: 8 }, { x: 1.5, y: 20 }], 20, 2.8, {
    tags: ["vertical", "deep", "vs-cover-2", "vs-cover-3"],
  }),
  R("stick", "Stick", [{ x: 0, y: 6 }, { x: 2.5, y: 5.8 }], 6, 1.5, {
    cap: "dot",
    tags: ["quick", "option", "zone-beater"],
  }),
  R("glance", "Glance", [{ x: 0, y: 3 }, { x: -6, y: 9 }], 9, 1.8, {
    tags: ["inbreaking", "rpo", "skinny-post"],
  }),
  R("chair", "Chair", [{ x: 0, y: 6 }, { x: -4, y: 6 }, { x: -4, y: 12 }], 12, 2.4, {
    tags: ["double-move", "flag", "man-beater"],
  }),
  R("pivot", "Pivot", [{ x: 0, y: 4 }, { x: -2.5, y: 4.5 }, { x: 4, y: 4 }], 4.5, 1.8, {
    cap: "dot",
    tags: ["quick", "double-move", "bunch"],
  }),
  R("arrow", "Arrow", [{ x: 1, y: 1 }, { x: 8, y: 4 }], 4, 1.3, {
    tags: ["quick", "outbreaking", "bunch"],
  }),
  R("texas", "Texas", [{ x: 0, y: 2 }, { x: -4, y: 5 }, { x: -6, y: 5 }], 5, 1.6, {
    cap: "dot",
    tags: ["back", "hot", "blitz-beater", "angle"],
  }),
  R("stalk", "Stalk", [{ x: 0, y: 4 }], 4, 1.2, {
    cap: "tbar",
    tags: ["block", "perimeter", "run-support"],
  }),
  R("crack", "Crack", [{ x: -3, y: 2 }, { x: -6, y: 3.5 }], 3.5, 1.3, {
    cap: "tbar",
    tags: ["block", "inside", "perimeter"],
  }),
  R("screen", "Screen", [{ x: 1, y: -2.5 }, { x: 4, y: -3 }], -3, 1.5, {
    curve: "spline",
    cap: "dot",
    tags: ["screen", "behind-los"],
  }),
  R("checkdown", "Checkdown", [{ x: 1.5, y: 0 }, { x: 4, y: 2.5 }], 2.5, 1.3, {
    tags: ["back", "outlet"],
  }),
  R("wall", "Wall", [{ x: 0, y: 5 }, { x: -8, y: 7 }], 7, 2.0, {
    cap: "tbar",
    tags: ["screen", "block", "downfield"],
  }),
];

const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, r]));

export function routeById(id: RouteId): RouteDef | undefined {
  return ROUTE_BY_ID.get(id);
}

// ─── resolution ─────────────────────────────────────────────────────────────

/**
 * Which way is "outward" for this player. Derived from where he actually lines
 * up, which is why flip is free: negate the formation and outward follows.
 * A player on the ball (a dot back, the QB) takes the formation's strength.
 */
export function outSign(start: Vec, strengthSign: 1 | -1): 1 | -1 {
  if (Math.abs(start.x) < 0.75) return strengthSign;
  return start.x >= 0 ? 1 : -1;
}

/**
 * The absolute direction an author asked a route to work, if they asked. "L"
 * and "R" are absolute and therefore flip with the play; playside and backside
 * are already relative and do not.
 */
export function preferredDir(
  mods: RouteMods | undefined,
  strengthSign: 1 | -1,
  flip: boolean,
): 1 | -1 | null {
  const t = mods?.toSide;
  if (t === "L" || t === "R") {
    const s: 1 | -1 = t === "R" ? 1 : -1;
    return (flip ? -s : s) as 1 | -1;
  }
  if (t === "playside") return strengthSign;
  if (t === "backside") return -strengthSign as 1 | -1;
  return null;
}

/**
 * Reconcile a requested side with the route's own shape. Route-local +x is
 * OUTWARD, so an in-breaking route like a shallow has a negative terminus —
 * asking it to work left has to flip the outward sign, not adopt it. Without
 * this the mesh runs the wrong way, which is exactly the bug this catches.
 */
function effectiveOut(
  def: RouteDef,
  out: 1 | -1,
  prefer: 1 | -1 | null,
): 1 | -1 {
  if (prefer === null) return out;
  const netX = def.points[def.points.length - 1]?.x ?? 0;
  if (netX === 0) return prefer;
  return (prefer * Math.sign(netX)) as 1 | -1;
}

function depthFactor(def: RouteDef, mods?: RouteMods): number {
  const target = mods?.depth ?? def.nominalDepthYd + (mods?.depthAdj ?? 0);
  if (def.nominalDepthYd === 0) return 1;
  return target / def.nominalDepthYd;
}

/**
 * A route's points in field yards. Depth rescales proportionally, lateral
 * distance scales by the variant's width, then the whole thing is clamped
 * on-field. The `scaleDepth` floor is the entire edge-case story — a one-yard
 * flat stays a one-yard flat rather than collapsing.
 */
export function resolveRoute(
  def: RouteDef,
  mods: RouteMods | undefined,
  start: Vec,
  outward: 1 | -1,
  v: FieldVariant,
  prefer: 1 | -1 | null = null,
): Vec[] {
  const out = effectiveOut(def, outward, prefer);
  const f = depthFactor(def, mods);
  const pts: Vec[] = [start];

  // A release detour is two points prepended to the stem, which is enough to
  // read as "he took an outside release" without modelling footwork.
  if (mods?.release && mods.release !== "free") {
    const dir = mods.release === "inside" ? -out : out;
    pts.push({ x: start.x + dir * 0.9 * v.widthScale, y: start.y + 1.2 * v.depthScale });
  }

  for (const p of def.points) {
    const rawDepth = p.y * f;
    const dy = rawDepth >= 0 ? scaleDepth(rawDepth, v) : rawDepth * v.depthScale;
    pts.push(
      clampToField(
        { x: start.x + p.x * v.widthScale * out, y: start.y + dy },
        v,
        0.3,
      ),
    );
  }

  // A settle shortens the last leg and turns the terminus into a sit-down.
  if (mods?.settleYd !== undefined && pts.length >= 2) {
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
    const back = Math.min(mods.settleYd * v.depthScale, len * 0.7);
    pts[pts.length - 1] = {
      x: last.x - ((last.x - prev.x) / len) * back,
      y: last.y - ((last.y - prev.y) / len) * back,
    };
  }

  return pts;
}

export function pathLengthYd(points: Vec[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return d;
}

// ─── the mesh ───────────────────────────────────────────────────────────────

/**
 * The one relational post-process, and the highest-leverage code in the
 * project. Two shallow crossers cannot be independent point lists or they
 * overlap — and the mesh appears in roughly a third of the Air Raid library,
 * so hand-drawing it 30 times is exactly the failure this whole architecture
 * exists to avoid.
 *
 * A mutually-meshed pair is pulled to a common crossing point, separated
 * laterally, and the `over` runner is lifted half a yard so the rub reads.
 */
export function applyMesh(
  paths: Map<SlotId, ResolvedPath>,
  assignments: Partial<Record<SlotId, Assignment>>,
  v: FieldVariant,
): void {
  const seen = new Set<SlotId>();

  for (const [slot, a] of Object.entries(assignments) as [SlotId, Assignment][]) {
    if (a.kind !== "route" || !a.mods?.meshWith) continue;
    const partner = a.mods.meshWith;
    if (seen.has(slot) || seen.has(partner)) continue;

    const pa = paths.get(slot);
    const pb = paths.get(partner);
    const ab = assignments[partner];
    if (!pa || !pb || !ab || ab.kind !== "route" || ab.mods?.meshWith !== slot) continue;

    seen.add(slot);
    seen.add(partner);

    const depth = (a.mods.meshDepthYd ?? ab.mods?.meshDepthYd ?? 5) * v.depthScale;
    const crossX = (pa.points[0].x + pb.points[0].x) / 2;
    const sep = 0.4 * v.widthScale;

    const bend = (p: ResolvedPath, offset: number, lane?: "over" | "under") => {
      if (p.points.length < 2) return;
      const lift = lane === "over" ? 0.5 * v.depthScale : 0;
      const head = p.points[0];
      const tail = p.points[p.points.length - 1];
      // Direction of travel, taken before the crossing point overwrites it.
      const dir = Math.sign(tail.x - head.x) || 1;
      // Keep running after the rub. Using the route's own terminus here put
      // both runners in the middle of a narrow field, which is a mesh that
      // crosses and then stops — the rub with none of the payoff.
      const run = Math.max(Math.abs(tail.x - crossX), 0.34 * v.viewWidthYd);
      p.points = [
        head,
        { x: crossX + offset, y: depth + lift },
        clampToField({ x: crossX + dir * run, y: Math.max(tail.y, depth + lift) }, v, 0.3),
      ];
    };

    bend(pa, -sep, a.mods.lane);
    bend(pb, sep, ab.mods?.lane);
  }
}

// ─── option branches ────────────────────────────────────────────────────────

/**
 * An option route is a common stem plus forks, never two plays. Branches nest
 * exactly one level — a read is a read, and two levels is a flowchart that
 * will not survive being printed twelve to a page.
 */
export function resolveBranches(
  a: Extract<Assignment, { kind: "route" }>,
  start: Vec,
  out: 1 | -1,
  v: FieldVariant,
  prefer: 1 | -1 | null = null,
): ResolvedBranch[] {
  if (!a.option) return [];
  const base = routeById(a.route);
  const baseEnd = base ? resolveRoute(base, a.mods, start, out, v, prefer).at(-1) : undefined;

  return a.option.branches.flatMap((b) => {
    const def = routeById(b.route);
    if (!def) return [];
    const points = resolveRoute(def, b.mods ?? a.mods, start, out, v, prefer);
    const end = points.at(-1);
    // A branch that lands where the base route already lands draws a dashed
    // line on top of a solid one and a label nobody can read. The mesh is the
    // worst offender: both of its branches ARE the shallow. Only forks that
    // actually go somewhere else get drawn.
    if (baseEnd && end && Math.hypot(end.x - baseEnd.x, end.y - baseEnd.y) < 2.5) return [];
    return [{ points, cap: def.cap as EndCap, style: "dashed" as PathStyle, label: b.when }];
  });
}

// ─── timing ─────────────────────────────────────────────────────────────────

export function routeDurationMs(
  def: RouteDef,
  mods: RouteMods | undefined,
  points: Vec[],
  v: FieldVariant,
  speedYps?: number,
): number {
  if (speedYps) return (pathLengthYd(points) / speedYps) * 1000;
  const f = Math.max(0.35, depthFactor(def, mods));
  return def.nominalSeconds * f * v.depthScale * 1000;
}

/** Default corner treatment. Sharp is both correct and the crispest on screen. */
export const DEFAULT_CORNER: Corner = "sharp";

export function routesFor(v: FieldVariant): RouteDef[] {
  return ROUTES.filter((r) => r.nominalDepthYd <= v.maxRouteDepthYd / v.depthScale + 6);
}
