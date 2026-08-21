/**
 * resolvePlay — the single entry point, and the reason this architecture works.
 *
 * Library plays and user-edited plays go through THIS function and no other.
 * Baking geometry offline would have meant a second renderer for user plays,
 * and the two would have drifted within a week.
 *
 * Order of operations:
 *   1. resolve the formation (or the defensive front)
 *   2. resolve every assignment into a path
 *   3. resolve the blocking scheme
 *   4. apply the mesh post-process
 *   5. apply user overrides — a sparse patch, layered ON TOP
 *   6. derive the ball path
 *
 * Step 5 is the crux. A drag is an override, not a demolition: player edits are
 * deltas from the formation's resolved point, so the formation identity stays
 * searchable, the edit stays portable across field variants, and a later fix to
 * the formation library still improves every play derived from it. There is no
 * moment at which a play "becomes geometry".
 */

import {
  applyMesh,
  outSign,
  pathLengthYd,
  preferredDir,
  resolveBranches,
  resolveRoute,
  routeById,
  routeDurationMs,
} from "./routes.ts";
import { playsideSignFor, resolveBlocking, schemeById } from "./blocking.ts";
import {
  coverageById,
  frontById,
  pressureById,
  resolveCoverage,
  resolveFront,
  resolveManCoverage,
  resolvePressure,
} from "./defense.ts";
import { clampToField, gapAnchor, rescaleDelta, variant as variantOf } from "./field.ts";
import { formationById, resolveFormation } from "./formations.ts";
import type {
  Assignment,
  BookStyle,
  FieldVariant,
  FieldVariantId,
  Play,
  ResolvedPath,
  ResolvedPlayer,
  ResolvedPlay,
  SlotId,
  Vec,
} from "./types.ts";

export const DEFAULT_STYLE: BookStyle = {
  glyphs: "solid",
  defenseShape: "diamond",
  oLine: "plain",
  centerMark: "square",
  routeCorners: "sharp",
};

const DROP_DEPTH: Record<string, number> = {
  "1step": -1.0,
  "3step": -3.0,
  "5step": -5.0,
  "7step": -7.0,
  "gun-quick": -0.8,
  "gun-3": -2.0,
  sprint: -3.0,
  boot: -4.0,
};

function speedFor(role: ResolvedPlayer["role"], v: FieldVariant): number {
  if (role === "ol") return 6.0;
  if (role === "back") return 6.5;
  return v.defaultSpeedYps;
}

/** Unwrap a motion decorator, returning the pre-snap leg and the real work. */
function unwrapMotion(a: Assignment): { motion: Extract<Assignment, { kind: "motion" }> | null; inner: Assignment } {
  return a.kind === "motion" ? { motion: a, inner: a.then } : { motion: null, inner: a };
}

export function resolvePlay(
  play: Play,
  variantId: FieldVariantId,
  flip = false,
  style: BookStyle = DEFAULT_STYLE,
): ResolvedPlay {
  const spec = play.spec;
  const v = variantOf(variantId);
  const warnings: string[] = [];

  return spec.side === "defense"
    ? resolveDefensivePlay(play, v, variantId, flip, warnings)
    : resolveOffensivePlay(play, v, variantId, flip, style, warnings);
}

// ─── offense ────────────────────────────────────────────────────────────────

function resolveOffensivePlay(
  play: Play,
  v: FieldVariant,
  variantId: FieldVariantId,
  flip: boolean,
  style: BookStyle,
  warnings: string[],
): ResolvedPlay {
  const spec = play.spec;
  const formation = formationById(spec.formationId);
  if (!formation) {
    warnings.push(`Unknown formation "${spec.formationId}"`);
    return empty(warnings);
  }

  const assigned = new Set(Object.keys(spec.assignments) as SlotId[]);
  const { players, omitted, points } = resolveFormation(
    formation, variantId, flip, style.glyphs, assigned,
  );

  // Move people FIRST. Every route's handedness is read off where its player
  // is standing, so this has to happen before a single assignment resolves.
  const alignedX = new Map<string, number>(players.map((p) => [p.slot, p.at.x]));
  applyPlayerOverrides(play, players, points, variantId, v);

  /**
   * Who was dragged across the ball. A library play can pin a route to a side
   * with `toSide` — "this concept works to the field" — and that is the
   * author's intent right up until a coach moves the man to the other side of
   * the formation, at which point the authored side describes nowhere. Those
   * routes fall back to deriving handedness from where he is now.
   */
  const crossed = new Set<string>(
    players
      .filter((p) => {
        const before = alignedX.get(p.slot);
        return (
          before !== undefined &&
          Math.abs(before) > 0.75 &&
          Math.abs(p.at.x) > 0.75 &&
          Math.sign(before) !== Math.sign(p.at.x)
        );
      })
      .map((p) => p.slot),
  );
  const present = new Set(players.map((p) => p.slot));
  const strengthSign: 1 | -1 = flip
    ? (formation.strength === "R" ? -1 : 1)
    : (formation.strength === "R" ? 1 : -1);

  const pathMap = new Map<SlotId, ResolvedPath>();
  const preSnap: ResolvedPath[] = [];
  const inner: Partial<Record<SlotId, Assignment>> = {};

  for (const [rawSlot, rawAssign] of Object.entries(spec.assignments) as [SlotId, Assignment][]) {
    if (!present.has(rawSlot)) {
      // Not an error: the body budget legitimately drops players on small
      // fields, and their assignments simply have nobody to carry them.
      if (!omitted.includes(rawSlot)) {
        warnings.push(`Assignment for "${rawSlot}", who is not in ${formation.name}`);
      }
      continue;
    }

    const start = points[rawSlot];
    const player = players.find((p) => p.slot === rawSlot);
    if (!start || !player) continue;

    const { motion, inner: a } = unwrapMotion(rawAssign);
    inner[rawSlot] = a;

    if (motion) {
      // Motion lives in negative time. One timeline expresses shift, motion,
      // snap and play without a separate pre-snap mode.
      const drawn = motion.motion.path;
      const points0 = drawn?.length
        ? [start, ...drawn.map((p) => clampToField(p, v))]
        : (() => {
            // No drawn path: fall back to a canned slide across the formation.
            const toSide = motion.motion.toSide;
            const absolute = toSide ? (toSide === "R" ? 1 : -1) : -Math.sign(start.x || 1);
            const dir = toSide && flip ? -absolute : absolute;
            return [start, clampToField({ x: start.x + dir * 6 * v.widthScale, y: start.y }, v)];
          })();

      const end = points0[points0.length - 1];
      preSnap.push({
        slot: rawSlot,
        points: points0,
        curve: "polyline",
        style: "zigzag",
        cap: "arrow",
        corner: "sharp",
        branches: [],
        startDelayMs: -motion.motion.startMsBeforeSnap,
        durationMs: motion.motion.startMsBeforeSnap,
        priorityOrder: 0,
        role: "motion",
        phase: "pre-snap",
      });
      // Motion relocates him, so everything after starts from where he ends up.
      points[rawSlot] = end;
      player.at = end;
    }

    const from = points[rawSlot]!;
    const mods = a.kind === "route" ? a.mods : undefined;
    const out = outSign(from, strengthSign);
    const prefer = crossed.has(rawSlot) ? null : preferredDir(mods, strengthSign, flip);
    const t = "timing" in a ? a.timing : undefined;

    if (a.kind === "route") {
      const def = routeById(a.route);
      if (!def) {
        warnings.push(`Unknown route "${a.route}" for ${rawSlot}`);
        continue;
      }
      const pts = resolveRoute(def, a.mods, from, out, v, prefer);
      pathMap.set(rawSlot, {
        slot: rawSlot,
        points: pts,
        curve: def.curve,
        style: a.style ?? def.style,
        cap: a.cap ?? def.cap,
        corner: style.routeCorners,
        branches: resolveBranches(a, from, out, v, prefer),
        startDelayMs: t?.startDelayMs ?? 0,
        durationMs: routeDurationMs(def, a.mods, pts, v, t?.speedYps),
        priorityOrder: t?.priorityOrder ?? 50,
        routeId: a.route,
        role: def.cap === "tbar" ? "block" : "route",
        phase: "post-snap",
      });
    } else if (a.kind === "carry") {
      // A running track, not a straight line to a hole. The back presses one
      // aiming point, arrives at the gap around the line of scrimmage, and
      // finishes on a slightly different angle — which is what "bang, bend,
      // bounce" looks like drawn.
      const sign = playsideSignFor(a.aim, flip);
      const aimAt = gapAnchor(a.aim, sign, v, 1);
      const pressAt = a.press ? gapAnchor(a.press, sign, v, 1) : aimAt;
      const wide = a.path === "stretch";
      const counter = a.path === "counter-step";
      const pts: Vec[] = [from];
      if (counter) {
        // The first step goes away from the play, which is the whole point.
        pts.push({ x: from.x - sign * 1.4 * v.widthScale, y: from.y + 0.6 * v.depthScale });
      }
      pts.push({
        x: wide ? sign * 6.5 * v.widthScale : pressAt.x * 0.8,
        y: from.y + (from.y < -3 ? 2.2 : 1.2) * v.depthScale,
      });
      pts.push({ x: aimAt.x, y: 0.6 });
      pts.push({
        x: aimAt.x + sign * (wide ? 2.2 : 0.9) * v.widthScale,
        y: 5.5 * v.depthScale,
      });
      pathMap.set(rawSlot, {
        slot: rawSlot,
        points: pts,
        curve: "spline",
        style: "solid",
        cap: "arrow",
        corner: style.routeCorners,
        branches: [],
        startDelayMs: t?.startDelayMs ?? 120,
        durationMs: (pathLengthYd(pts) / speedFor("back", v)) * 1000,
        priorityOrder: t?.priorityOrder ?? 1,
        role: "carry",
        phase: "post-snap",
      });
    } else if (a.kind === "pass") {
      const depth = DROP_DEPTH[a.drop] * v.depthScale;
      const lateral = a.drop === "sprint" || a.drop === "boot" ? strengthSign * 4 * v.widthScale : 0;
      const pts: Vec[] = [from, { x: from.x + lateral, y: from.y + depth }];
      pathMap.set(rawSlot, {
        slot: rawSlot,
        points: pts,
        curve: "polyline",
        style: "solid",
        // No terminator: the drop ends a yard or two behind the quarterback,
        // and any cap there just draws a blob on top of him.
        cap: "none",
        corner: style.routeCorners,
        branches: [],
        startDelayMs: 0,
        durationMs: Math.max(400, Math.abs(depth) * 190),
        priorityOrder: 0,
        role: "route",
        phase: "post-snap",
      });
    } else if (a.kind === "block") {
      const target = { x: from.x, y: from.y + 3.5 * v.depthScale };
      pathMap.set(rawSlot, {
        slot: rawSlot,
        points: [from, target],
        curve: "polyline",
        style: "solid",
        cap: "tbar",
        corner: "sharp",
        branches: [],
        startDelayMs: 0,
        durationMs: 900,
        priorityOrder: 90,
        role: "block",
        phase: "post-snap",
      });
    } else if (a.kind === "pitch") {
      const to = points[a.to];
      if (to) {
        pathMap.set(rawSlot, {
          slot: rawSlot,
          points: [from, to],
          curve: "spline",
          style: "dotted",
          cap: "none",
          corner: "sharp",
          branches: [],
          startDelayMs: t?.startDelayMs ?? 200,
          durationMs: 420,
          priorityOrder: 2,
          role: "ball",
          phase: "post-snap",
        });
      }
    }
  }

  applyMesh(pathMap, inner, v);

  // Blocking. A run names a scheme, a pass names a protection, and either way
  // the entire line is derived — not one hand-drawn arrow in the library.
  const schemeId = spec.run?.scheme ?? spec.protection;
  const blocks = schemeId
    ? (() => {
        const s = schemeById(schemeId);
        if (!s) {
          warnings.push(`Unknown scheme "${schemeId}"`);
          return [];
        }
        return resolveBlocking(s, players, variantId, playsideSignFor(spec.run?.aim, flip));
      })()
    : [];

  // Anything the scheme already drew wins over a per-slot block assignment.
  const blocked = new Set(blocks.map((b) => b.slot));
  const paths = [...preSnap, ...blocks, ...[...pathMap.values()].filter((p) => !blocked.has(p.slot))];

  if (spec.primary) {
    const p = players.find((x) => x.slot === spec.primary);
    if (p) p.isPrimary = true;
  }

  applyPathOverrides(play, players, paths, variantId, v, warnings);
  clampPaths(paths, v);

  const ball = deriveBallPath(play, players, paths);
  if (ball) clampPaths([ball], v);
  const durationMs = Math.max(
    1200,
    ...paths.map((p) => Math.max(0, p.startDelayMs) + p.durationMs),
    ball ? ball.startDelayMs + ball.durationMs : 0,
  );

  return {
    players,
    paths,
    ball,
    zones: [],
    annotations: spec.annotations,
    omitted,
    warnings,
    durationMs,
  };
}

// ─── defense ────────────────────────────────────────────────────────────────

function resolveDefensivePlay(
  play: Play,
  v: FieldVariant,
  variantId: FieldVariantId,
  flip: boolean,
  warnings: string[],
): ResolvedPlay {
  const spec = play.spec;
  const front = frontById(spec.frontId ?? "");
  if (!front) {
    warnings.push(`Unknown front "${spec.frontId}"`);
    return empty(warnings);
  }

  const { players, omitted } = resolveFront(front, variantId, flip);
  const coverage = spec.coverageId ? coverageById(spec.coverageId) : undefined;
  if (spec.coverageId && !coverage) warnings.push(`Unknown coverage "${spec.coverageId}"`);

  const zones = coverage ? resolveCoverage(coverage, variantId, flip) : [];

  // Coverage drops: a defender travels to the middle of the zone he owns.
  const drops: ResolvedPath[] = zones.flatMap((z) => {
    const d = players.find((p) => p.slot === z.ownerSlot);
    if (!d) return [];
    return [
      {
        slot: d.slot,
        points: [d.at, { x: z.cx, y: z.cy }],
        curve: "polyline" as const,
        style: "dashed" as const,
        cap: "arrow" as const,
        corner: "sharp" as const,
        branches: [],
        startDelayMs: 0,
        durationMs: 900,
        priorityOrder: 40,
        role: "coverage" as const,
        phase: "post-snap" as const,
      },
    ];
  });

  const manLines = coverage
    ? resolveManCoverage(coverage, players, [])
    : [];

  const pressure = spec.pressureId ? pressureById(spec.pressureId) : undefined;
  if (spec.pressureId && !pressure) warnings.push(`Unknown pressure "${spec.pressureId}"`);
  const blitzes = pressure ? resolvePressure(pressure, players, variantId, flip) : [];

  // A blitzer is not also dropping into a zone.
  const rushing = new Set(blitzes.map((b) => b.slot));
  const paths = [...drops.filter((d) => !rushing.has(d.slot)), ...manLines, ...blitzes];

  applyPlayerOverrides(play, players, {}, variantId, v);
  applyPathOverrides(play, players, paths, variantId, v, warnings);
  clampPaths(paths, v);

  return {
    players,
    paths,
    ball: null,
    zones: coverage?.kind === "man" && !coverage.zones?.length ? [] : zones,
    annotations: spec.annotations,
    omitted,
    warnings,
    durationMs: Math.max(1200, ...paths.map((p) => p.startDelayMs + p.durationMs)),
  };
}

// ─── overrides ──────────────────────────────────────────────────────────────

/**
 * Player position overrides, applied BEFORE any assignment resolves.
 *
 * The order matters more than it looks. A route's handedness comes from where
 * the player is standing — `outSign` reads his x — so moving him afterwards and
 * translating the path left the route running the way it did from his OLD spot.
 * Drag X across the formation and his shallow kept working outward, straight
 * into the sideline. Now the move happens first and every route re-derives.
 *
 * Deltas, never absolutes: the formation identity stays searchable, and the
 * edit rescales between field sizes.
 */
function applyPlayerOverrides(
  play: Play,
  players: ResolvedPlayer[],
  points: Partial<Record<SlotId, Vec>>,
  variantId: FieldVariantId,
  v: FieldVariant,
): void {
  const o = play.overrides;
  if (!o) return;
  const from = variantOf(o.authoredVariant);

  if (o.removed?.length) {
    const gone = new Set(o.removed);
    for (let i = players.length - 1; i >= 0; i--) {
      if (gone.has(players[i].slot as SlotId)) players.splice(i, 1);
    }
    for (const slot of gone) delete points[slot];
  }

  for (const [slot, d] of Object.entries(o.players ?? {})) {
    if (!d) continue;
    const p = players.find((x) => x.slot === slot);
    if (!p) continue;
    const s = o.authoredVariant === variantId ? d : rescaleDelta(d, from, v);
    const moved = clampToField({ x: p.at.x + s.dx, y: p.at.y + s.dy }, v);
    p.at = moved;
    points[slot as SlotId] = moved;
  }

  for (const add of o.added ?? []) {
    const at = clampToField(add.at, v);
    players.push({
      slot: add.id,
      label: add.label,
      at,
      glyph: "circle",
      role: "receiver",
      isPrimary: false,
    });
    points[add.id as SlotId] = at;
  }
}

/**
 * Path overrides, applied after the paths exist.
 *
 * Three levels, and only the third gives anything up: a depth change is a mod
 * on the spec, a dragged break point is a delta that still rescales across
 * variants, and a hand-drawn line replaces the points for that ONE path.
 */
function applyPathOverrides(
  play: Play,
  players: ResolvedPlayer[],
  paths: ResolvedPath[],
  variantId: FieldVariantId,
  v: FieldVariant,
  warnings: string[],
): void {
  const o = play.overrides;
  if (!o) return;
  const from = variantOf(o.authoredVariant);

  if (o.removed?.length) {
    const gone = new Set(o.removed);
    for (let i = paths.length - 1; i >= 0; i--) {
      if (gone.has(paths[i].slot as SlotId)) paths.splice(i, 1);
    }
  }

  for (const [slot, ov] of Object.entries(o.paths ?? {})) {
    if (!ov) continue;
    let path = paths.find((x) => x.slot === slot);

    // A hand-drawn line for somebody who has no assignment yet — a player you
    // just placed on an empty field, which is the whole point of building a
    // play from zero. There is nothing to override, so the drawing IS the path.
    if (!path && ov.mode === "freehand" && players.some((pl) => pl.slot === slot)) {
      path = {
        slot,
        points: [],
        curve: "polyline",
        style: "solid",
        cap: "arrow",
        corner: "sharp",
        branches: [],
        startDelayMs: 0,
        durationMs: 1500,
        priorityOrder: 60,
        role: "route",
        phase: "post-snap",
      };
      paths.push(path);
    }
    if (!path) continue;

    if (ov.mode === "adjust") {
      for (const d of ov.pointDeltas) {
        const pt = path.points[d.i];
        if (!pt) continue;
        const s = o.authoredVariant === variantId ? d : rescaleDelta(d, from, v);
        path.points[d.i] = clampToField({ x: pt.x + s.dx, y: pt.y + s.dy }, v);
      }
    } else {
      // The only place a play loses compositional identity, and it loses it
      // for exactly one path.
      path.points = ov.points.map((pt) => clampToField(pt, v));
      path.curve = ov.curve;
      path.cap = ov.cap;
      path.style = ov.style;
      path.routeId = undefined;
    }
  }

  for (const add of o.added ?? []) {
    if (!add.path?.length) continue;
    paths.push({
      slot: add.id,
      points: add.path.map((p) => clampToField(p, v)),
      curve: "polyline",
      style: "solid",
      cap: "arrow",
      corner: "sharp",
      branches: [],
      startDelayMs: 0,
      durationMs: 1500,
      priorityOrder: 60,
      role: "route",
      phase: "post-snap",
    });
  }

  if (o.authoredVariant !== variantId && o.paths) {
    const freehand = Object.values(o.paths).filter((p) => p?.mode === "freehand").length;
    if (freehand) {
      warnings.push(
        `${freehand} hand-drawn path${freehand > 1 ? "s" : ""} authored on ${from.label} — geometry may not scale cleanly`,
      );
    }
  }
}

/**
 * A last pass so nothing is drawn outside the frame. Individual resolvers clamp
 * as they go, but a single sweep here is what makes "off the canvas" impossible
 * rather than merely unlikely — the quarterback's drop was built without one and
 * he vanished partway through the animation.
 */
function clampPaths(paths: ResolvedPath[], v: FieldVariant): void {
  for (const p of paths) {
    p.points = p.points.map((pt) => clampToField(pt, v, 0.3));
    for (const b of p.branches) b.points = b.points.map((pt) => clampToField(pt, v, 0.3));
  }
}

// ─── the ball ───────────────────────────────────────────────────────────────

/**
 * Derived rather than authored, because a ball path that disagrees with the
 * assignments is worse than none. An explicit `spec.ballPath` overrides it.
 */
function deriveBallPath(
  play: Play,
  players: ResolvedPlayer[],
  paths: ResolvedPath[],
): ResolvedPath | null {
  const spec = play.spec;
  const at = (slot: string) => players.find((p) => p.slot === slot)?.at;
  const qb = at("QB");
  if (!qb) return null;

  const base = {
    slot: "ball",
    curve: "spline" as const,
    // Dashed rather than dotted, and white rather than amber: amber now marks
    // the primary receiver's ROUTE, which is what a coach scans for first.
    style: "dashed" as const,
    corner: "sharp" as const,
    branches: [],
    priorityOrder: 0,
    role: "ball" as const,
    phase: "post-snap" as const,
  };

  // A run: the ball travels to the mesh point and stops. The carrier's own
  // path takes it from there, so drawing it twice would be noise.
  if (spec.run && (spec.family === "run" || spec.family === "option")) {
    const track = paths.find((p) => p.slot === spec.run?.carrier && p.role === "carry");
    // The mesh point is where the back's track passes the quarterback, so the
    // ball is drawn to where the exchange actually happens.
    const mesh = track ? track.points[Math.min(1, track.points.length - 1)] : at(spec.run.carrier);
    if (!mesh) return null;
    return { ...base, points: [qb, mesh], cap: "none", startDelayMs: 120, durationMs: 380 };
  }

  // A pass: to the primary's catch point.
  const target = spec.primary ?? spec.reads[0]?.progression?.[0];
  if (!target) return null;
  const path = paths.find((p) => p.slot === target);
  const catchAt = path ? path.points[path.points.length - 1] : at(target);
  if (!catchAt) return null;

  const drop = paths.find((p) => p.slot === "QB");
  const release = drop ? drop.points[drop.points.length - 1] : qb;
  const dist = Math.hypot(catchAt.x - release.x, catchAt.y - release.y);

  return {
    ...base,
    points: [release, catchAt],
    cap: "arrow",
    startDelayMs: (drop?.durationMs ?? 400) + 120,
    // A football travels about eighteen yards a second in the air.
    durationMs: Math.max(260, (dist / 18) * 1000),
  };
}

function empty(warnings: string[]): ResolvedPlay {
  return {
    players: [],
    paths: [],
    ball: null,
    zones: [],
    annotations: [],
    omitted: [],
    warnings,
    durationMs: 0,
  };
}
