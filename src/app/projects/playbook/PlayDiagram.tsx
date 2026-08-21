"use client";

/**
 * The play diagram. THE renderer — four densities, used by the editor, the
 * library cards, the animation player, and all three print sheets.
 *
 * The animation is not a second renderer. It was, briefly, and the two drifted
 * exactly as far as you would expect: the animated view quietly had no
 * arrowheads, no blocking T-bars, no settle dots, no progression numbers and no
 * option branches, and its geometry disagreed with the static diagram because
 * one followed the Bézier and the other followed the raw polyline. Now the
 * clock registers the elements THIS component draws and writes to them, so the
 * two cannot disagree about anything, ever.
 *
 * Glyph language is a per-playbook choice rather than a global preference,
 * because a book whose glyphs change between pages is unreadable, and the book
 * is the thing that gets shared and printed. Coaches genuinely disagree about
 * O-versus-circle and X-versus-square, so the choice exists — but it is made
 * once, one level above the play.
 *
 * The defender default is a FILLED DIAMOND rather than an X, for three
 * reasons that matter to this product specifically: it survives a twelve-up
 * print where an X at under a point collapses into a smudge, it has an interior
 * that can carry a letter (this app makes fronts and coverages named objects),
 * and circle-versus-diamond is readable in peripheral vision on a sideline
 * where circle-versus-X needs focus.
 */

import { Fragment } from "react";

import { UPY, toSvg } from "@/lib/playbook/field";
import {
  arrowPoints,
  chevronD,
  dashFor,
  heading,
  labelAnchor,
  pathD,
  tbarPoints,
  toPts,
  zigzagD,
} from "@/lib/playbook/geometry";
import type {
  BookStyle,
  FieldVariant,
  ResolvedPath,
  ResolvedPlay,
  ResolvedPlayer,
} from "@/lib/playbook/types";

export type Density = "editor" | "card" | "print12" | "wristband";

export interface Scale {
  stroke: number;
  glyphR: number;
  labelPx: number;
  showLabels: boolean;
  showZoneLabels: boolean;
  /**
   * Coverage zones overlap by design — seven of them stacked at any noticeable
   * opacity read as one red wash rather than seven responsibilities. Filled
   * only where there is room to tell them apart.
   */
  showZoneFill: boolean;
  showBranchLabels: boolean;
  showBlocks: boolean;
  showBadges: boolean;
  /** Terminator size, in field units. Kept proportional to `glyphR`. */
  arrow: number;
  /** Progression badge radius, in field units. */
  badge: number;
}

/**
 * Density is a parameter, not four components. At print scale a motion zigzag
 * becomes gray fuzz, so it converts to a dash; blocks disappear entirely on a
 * wristband, where the play NAME is the payload and the picture is a memory jog.
 */
export const SCALES: Record<Density, Scale> = {
  editor: { stroke: 1, glyphR: 6.6, arrow: 5.4, badge: 5, labelPx: 8, showLabels: true, showZoneLabels: true, showZoneFill: true, showBranchLabels: true, showBlocks: true, showBadges: true },
  card: { stroke: 0.85, glyphR: 6.2, arrow: 5.4, badge: 4.6, labelPx: 7.5, showLabels: true, showZoneLabels: false, showZoneFill: false, showBranchLabels: false, showBlocks: true, showBadges: false },
  print12: { stroke: 0.62, glyphR: 6.0, arrow: 5.0, badge: 0, labelPx: 7.5, showLabels: true, showZoneLabels: false, showZoneFill: false, showBranchLabels: false, showBlocks: true, showBadges: false },
  wristband: { stroke: 0.5, glyphR: 3.2, arrow: 3.4, badge: 0, labelPx: 0, showLabels: false, showZoneLabels: false, showZoneFill: false, showBranchLabels: false, showBlocks: false, showBadges: false },
};

const ROLE_COLOR: Record<ResolvedPath["role"], string> = {
  route: "var(--off)",
  carry: "var(--off)",
  block: "var(--block)",
  // White and dashed. Amber belongs to the primary receiver's route.
  ball: "var(--off)",
  motion: "var(--motion)",
  coverage: "var(--def)",
  man: "var(--def)",
  blitz: "var(--def)",
};

const ROLE_WIDTH: Record<ResolvedPath["role"], number> = {
  route: 2.2,
  carry: 3.0,
  block: 2.2,
  ball: 2.0,
  motion: 2.0,
  coverage: 1.8,
  man: 1.8,
  blitz: 2.8,
};

/**
 * The primary receiver's whole route is amber and heavier. On paper both amber
 * and white collapse to black, so the WEIGHT is what carries it there — the
 * same reason the defender is a filled diamond rather than an X.
 */
const PRIMARY_COLOR = "var(--ball)";
const PRIMARY_WEIGHT = 1.35;

/**
 * The animation clock registers the elements this component draws and writes
 * transforms and dash offsets onto them. Nothing here knows what time it is.
 */
export interface AnimHooks {
  path: (key: string, el: SVGPathElement | null) => void;
  cap: (key: string, el: SVGGElement | null) => void;
  player: (slot: string, el: SVGGElement | null) => void;
  badges: (el: SVGGElement | null) => void;
}

/** Stable per path, and shared with the timeline so the two can be joined. */
export function pathKey(path: ResolvedPath, i: number): string {
  return `${path.slot}:${path.role}:${i}`;
}

/** The ball is not in `play.paths`, so it gets its own reserved key. */
export const BALL_KEY = "ball:ball:-1";

interface Props {
  play: ResolvedPlay;
  variant: FieldVariant;
  style: BookStyle;
  density?: Density;
  /** Camera scale, so dash patterns can be divided by it. */
  k?: number;
  selectedSlot?: string | null;
  onSelect?: (slot: string) => void;
  onPlayerPointerDown?: (slot: string, e: React.PointerEvent) => void;
  /** Present only when a clock is driving this diagram. */
  anim?: AnimHooks;
}

function Glyph({
  p,
  at,
  s,
  style,
  selected,
  onSelect,
  onPointerDown,
  anim,
}: {
  p: ResolvedPlayer;
  /** Already converted to SVG units — the conversion happens once, upstream. */
  at: { x: number; y: number };
  s: Scale;
  style: BookStyle;
  selected: boolean;
  onSelect?: (slot: string) => void;
  onPointerDown?: (slot: string, e: React.PointerEvent) => void;
  anim?: AnimHooks;
}) {
  const r = s.glyphR;
  const isDef = p.role === "defender";
  const stroke = isDef ? "var(--def)" : "var(--off)";
  const w = 2.2 * s.stroke;
  const interactive = Boolean(onSelect || onPointerDown);

  // The offensive glyph is filled with turf so a route passing behind it is
  // punched out rather than running through the man.
  let shape;
  if (isDef) {
    if (style.defenseShape === "x") {
      shape = (
        <g stroke={stroke} strokeWidth={w * 1.2} vectorEffect="non-scaling-stroke">
          <line x1={-r * 0.75} y1={-r * 0.75} x2={r * 0.75} y2={r * 0.75} />
          <line x1={r * 0.75} y1={-r * 0.75} x2={-r * 0.75} y2={r * 0.75} />
        </g>
      );
    } else if (style.defenseShape === "square") {
      shape = <rect x={-r * 0.85} y={-r * 0.85} width={r * 1.7} height={r * 1.7} fill="var(--def)" />;
    } else {
      shape = <polygon points={`0,${-r * 1.1} ${r * 1.1},0 0,${r * 1.1} ${-r * 1.1},0`} fill="var(--def)" />;
    }
  } else if (p.glyph === "square") {
    shape = (
      <rect
        x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} rx={2}
        fill="var(--turf)" fillOpacity={0.92} stroke={stroke} strokeWidth={w * 1.1}
        vectorEffect="non-scaling-stroke"
      />
    );
  } else if (p.glyph === "double-ring") {
    shape = (
      <>
        <circle r={r * 1.18} fill="none" stroke={stroke} strokeWidth={1.2 * s.stroke} vectorEffect="non-scaling-stroke" />
        <circle r={r} fill="var(--turf)" fillOpacity={0.92} stroke={stroke} strokeWidth={w} vectorEffect="non-scaling-stroke" />
      </>
    );
  } else {
    shape = (
      <circle r={r} fill="var(--turf)" fillOpacity={0.92} stroke={stroke} strokeWidth={w} vectorEffect="non-scaling-stroke" />
    );
  }

  const showLetter =
    s.showLabels &&
    (isDef || p.role !== "ol" || style.oLine !== "plain") &&
    !(style.glyphs === "classic" && !isDef);

  return (
    <g
      // The resting position is a presentation ATTRIBUTE so a server render can
      // be rasterised without a CSS engine; the clock overrides it with
      // `style.transform`, which wins in a browser.
      ref={anim ? (el) => anim.player(p.slot, el) : undefined}
      transform={`translate(${at.x} ${at.y})`}
      style={interactive ? { cursor: "grab" } : undefined}
      onClick={onSelect ? () => onSelect(p.slot) : undefined}
      onPointerDown={onPointerDown ? (e) => onPointerDown(p.slot, e) : undefined}
    >
      {selected && (
        <circle r={r * 1.75} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      )}
      {p.isPrimary && !isDef && (
        <circle r={r * 1.45} fill="none" stroke="var(--ball)" strokeWidth={1.6 * s.stroke} vectorEffect="non-scaling-stroke" />
      )}
      {shape}
      {showLetter && (
        <text className="pb-glyph-label" fontSize={s.labelPx} fill={isDef ? "var(--void)" : "var(--off)"}>
          {p.label}
        </text>
      )}
      <title>{`${p.label} — ${p.role}`}</title>
    </g>
  );
}

function Path({
  path, v, s, k, dim, isPrimary, animKey, anim,
}: {
  path: ResolvedPath;
  v: FieldVariant;
  s: Scale;
  k: number;
  dim: boolean;
  isPrimary: boolean;
  animKey?: string;
  anim?: AnimHooks;
}) {
  const pts = toPts(path.points, v);
  if (pts.length < 2) return null;
  const h = heading(pts);
  const end = pts[pts.length - 1];
  const highlight = isPrimary && (path.role === "route" || path.role === "carry");
  const color = highlight ? PRIMARY_COLOR : ROLE_COLOR[path.role];
  const width = ROLE_WIDTH[path.role] * s.stroke * (highlight ? PRIMARY_WEIGHT : 1);
  const op = dim ? 0.22 : 1;

  // A zigzag at under a point is gray fuzz, so print converts it to a dash.
  const asZigzag = path.style === "zigzag" && s.stroke > 0.7;
  const d = asZigzag ? zigzagD(pts) : pathD(pts, path.curve, path.corner);
  const dash = asZigzag ? undefined : dashFor(path.style === "zigzag" ? "dashed" : path.style, k);

  return (
    <g opacity={op}>
      <path
        ref={anim && animKey ? (el) => anim.path(animKey, el) : undefined}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap={path.style === "dotted" ? "round" : "butt"}
        vectorEffect="non-scaling-stroke"
      />
      {/* Terminators are sized in FIELD units, proportional to the glyph, so
          they read the same on a card and in the editor. Sizing them off the
          stroke width made them nearly twice a player's diameter once the
          field was rendered large. Grouped so the clock can hold them back
          until the line they belong to has actually arrived. */}
      <g ref={anim && animKey ? (el) => anim.cap(animKey, el) : undefined}>
      {path.cap === "arrow" &&
        (path.role === "ball" || path.role === "motion" ? (
          <path d={chevronD(end, h, s.arrow, s.arrow * 0.7)} fill="none" stroke={color} strokeWidth={width} vectorEffect="non-scaling-stroke" />
        ) : (
          <polygon points={arrowPoints(end, h, s.arrow, s.arrow * 0.62)} fill={color} />
        ))}
      {path.cap === "tbar" &&
        (() => {
          const b = tbarPoints(end, h, s.arrow * 0.82);
          return <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={color} strokeWidth={width * 1.3} vectorEffect="non-scaling-stroke" />;
        })()}
      {path.cap === "dot" && <circle cx={end.x} cy={end.y} r={s.arrow * 0.44} fill={color} />}
      </g>

      {/* Option branches: a common stem with dashed forks, one level only. */}
      {path.branches.map((b, i) => {
        const bp = toPts(b.points, v);
        if (bp.length < 2) return null;
        const bh = heading(bp);
        const be = bp[bp.length - 1];
        const la = labelAnchor(bp);
        return (
          <Fragment key={i}>
            <path
              d={pathD(bp, path.curve, path.corner)}
              fill="none"
              stroke={color}
              strokeOpacity={0.78}
              strokeWidth={1.8 * s.stroke}
              strokeDasharray={dashFor("dashed", k)}
              vectorEffect="non-scaling-stroke"
            />
            {b.cap === "arrow" && <polygon points={arrowPoints(be, bh, s.arrow * 0.82, s.arrow * 0.5)} fill={color} opacity={0.78} />}
            {b.cap === "dot" && <circle cx={be.x} cy={be.y} r={s.arrow * 0.36} fill={color} opacity={0.78} />}
            {s.showBranchLabels && b.label && (
              <text className="pb-cond-label" x={la.x} y={la.y + i * 11} fontSize={8} textAnchor="middle">
                {b.label.toUpperCase()}
              </text>
            )}
          </Fragment>
        );
      })}

      {/* The fork node, so a read is visibly a read. */}
      {path.branches.length > 0 &&
        (() => {
          const f = toPts(path.branches[0].points, v)[0];
          return <polygon points={`${f.x},${f.y - 3.5} ${f.x + 3.5},${f.y} ${f.x},${f.y + 3.5} ${f.x - 3.5},${f.y}`} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />;
        })()}
    </g>
  );
}

export default function PlayDiagram({
  play,
  variant: v,
  style,
  density = "editor",
  k = 1,
  selectedSlot,
  onSelect,
  onPlayerPointerDown,
  anim,
}: Props) {
  const s = SCALES[density];
  const primarySlot = play.players.find((p) => p.isPrimary)?.slot ?? null;

  return (
    <g>
      {/* Zones sit under everything — they are context, not content. */}
      {play.zones.map((z) => {
        const c = toSvg({ x: z.cx, y: z.cy }, v);
        return (
          <g key={z.id}>
            <ellipse
              cx={c.x} cy={c.y} rx={z.rx * UPY} ry={z.ry * UPY}
              fill={s.showZoneFill ? "var(--zone-fill)" : "none"}
              stroke="var(--zone-stroke)" strokeWidth={1.6 * s.stroke}
              strokeDasharray={dashFor("dashed", k)} vectorEffect="non-scaling-stroke"
            />
            {s.showZoneLabels && z.label && (
              <text className="pb-zone-label" x={c.x} y={c.y} fontSize={9}>
                {z.label.toUpperCase()}
              </text>
            )}
          </g>
        );
      })}

      {/* Indexed against the FULL path list, not the filtered one, so a key
          means the same thing here as it does in the timeline. */}
      {play.paths.map((p, i) =>
        !s.showBlocks && p.role === "block" ? null : (
          <Path
            key={pathKey(p, i)}
            path={p}
            v={v}
            s={s}
            k={k}
            dim={Boolean(selectedSlot) && p.slot !== selectedSlot}
            isPrimary={p.slot === primarySlot}
            animKey={pathKey(p, i)}
            anim={anim}
          />
        ),
      )}

      {play.ball && (
        <Path
          path={play.ball}
          v={v}
          s={s}
          k={k}
          dim={false}
          isPrimary={false}
          animKey={BALL_KEY}
          anim={anim}
        />
      )}

      {play.players.map((p) => (
        <Glyph
          key={p.slot}
          p={p}
          at={toSvg(p.at, v)}
          s={s}
          style={style}
          selected={selectedSlot === p.slot}
          onSelect={onSelect}
          onPointerDown={onPlayerPointerDown}
          anim={anim}
        />
      ))}

      {/* Progression badges. priorityOrder does double duty here and in the
          animation timeline, so the numbers a coach reads are the same ones
          the playback staggers by. Numbered pre-snap and held through a pause;
          the clock fades them once the ball is actually snapped, since by then
          they are covering a diagram that is moving. */}
      {s.showBadges && (
      <g ref={anim ? anim.badges : undefined} style={{ transition: "opacity 260ms ease" }}>
        {play.paths
          .filter((p) => p.role === "route" && p.priorityOrder >= 1 && p.priorityOrder <= 5)
          .map((p) => {
            const pl = play.players.find((x) => x.slot === p.slot);
            if (!pl) return null;
            const c = toSvg(pl.at, v);
            return (
              <g key={`badge-${p.slot}`} transform={`translate(${c.x + s.glyphR * 1.4} ${c.y - s.glyphR * 1.4})`}>
                <circle r={s.badge} fill="var(--ball)" />
                <text className="pb-glyph-label" fontSize={s.badge * 1.3} fill="var(--void)">
                  {p.priorityOrder}
                </text>
              </g>
            );
          })}
      </g>
      )}

      {play.annotations.map((a) => {
        const c = toSvg(a.at, v);
        if (a.kind !== "text" || !a.text) return null;
        return (
          <text key={a.id} className="pb-cond-label" x={c.x} y={c.y} fontSize={11} textAnchor="middle">
            {a.text}
          </text>
        );
      })}
    </g>
  );
}
