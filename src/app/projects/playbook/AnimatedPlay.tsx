"use client";

/**
 * The animation driver. It draws nothing.
 *
 * `PlayDiagram` renders the play exactly as it does everywhere else; this
 * component registers the elements it produced and writes to them from the
 * clock. That is the whole design, and it is a correction: this used to be a
 * second renderer, and it drifted — no arrowheads, no blocking T-bars, no
 * settle dots, no progression numbers, and a player who followed the raw
 * polyline while the line on screen followed the Bézier.
 *
 * GEOMETRY COMES FROM THE DOM. Each registered `<path>` is measured once with
 * `getTotalLength()` and sampled with `getPointAtLength()`, so the player rides
 * exactly the line being drawn, whatever curve it is. The samples are cached,
 * so the frame loop makes no DOM measurements at all.
 *
 * The draw-in uses `stroke-dasharray`, which means a path that is *already*
 * dashed loses its pattern while it draws and gets it back on arrival. For the
 * ball that reads as a ball in flight, which is better than the alternative.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import PlayDiagram, { type AnimHooks, type Density } from "./PlayDiagram";
import { activeTrackFor, progressAt, type Timeline } from "./useTimeline";
import { pathD, toPts } from "@/lib/playbook/geometry";
import type { BookStyle, FieldVariant, ResolvedPlay } from "@/lib/playbook/types";

const SAMPLES = 64;

interface Measured {
  el: SVGPathElement;
  /** User units, from getTotalLength(). */
  length: number;
  /**
   * The same length in SCREEN pixels. Every path carries
   * `vector-effect="non-scaling-stroke"`, and under that the dash pattern is
   * interpreted in screen units while `getTotalLength()` still reports user
   * units. Feeding the user length straight to `stroke-dasharray` made the
   * line draw itself at 1/scale the correct rate, so the player ran ahead of
   * his own route. `dashFor()` divides by the camera scale for exactly this
   * reason; this is the same caveat from the other direction.
   */
  screenLength: number;
  points: { x: number; y: number }[];
}

interface Props {
  play: ResolvedPlay;
  timeline: Timeline;
  variant: FieldVariant;
  style: BookStyle;
  subscribe: (fn: (t: number) => void) => () => void;
  playing: boolean;
  trails: boolean;
  density?: Density;
}

export default function AnimatedPlay({
  play, timeline, variant: v, style, subscribe, playing, trails, density = "editor",
}: Props) {
  const paths = useRef(new Map<string, SVGPathElement>());
  const caps = useRef(new Map<string, SVGGElement>());
  const players = useRef(new Map<string, SVGGElement>());
  const badges = useRef<SVGGElement | null>(null);
  const measured = useRef(new Map<string, Measured>());
  const wrap = useRef<SVGGElement>(null);

  const anim = useMemo<AnimHooks>(
    () => ({
      path: (key, el) => {
        if (el) paths.current.set(key, el);
        else paths.current.delete(key);
      },
      cap: (key, el) => {
        if (el) caps.current.set(key, el);
        else caps.current.delete(key);
      },
      player: (slot, el) => {
        if (el) players.current.set(slot, el);
        else players.current.delete(slot);
      },
      badges: (el) => {
        badges.current = el;
      },
    }),
    [],
  );

  /** Which tracks belong to each slot, so one glyph is written once per frame. */
  const bySlot = useMemo(() => {
    const map = new Map<string, Timeline["tracks"]>();
    for (const track of timeline.tracks) {
      // A man-coverage line is a relationship, not a journey, and the ball is
      // not a player. Neither moves a glyph.
      if (track.role === "man" || track.role === "ball") continue;
      map.set(track.slot, [...(map.get(track.slot) ?? []), track]);
    }
    return map;
  }, [timeline]);

  const measure = useCallback(() => {
    measured.current.clear();
    for (const [key, el] of paths.current) {
      const length = el.getTotalLength();
      if (!Number.isFinite(length) || length <= 0) continue;
      // The element's own CTM, not the SVG's width ratio: the field letterboxes
      // under a max-height, so width alone overstates the scale.
      const scale = el.getScreenCTM()?.a ?? 1;
      const points = Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const p = el.getPointAtLength((i / SAMPLES) * length);
        return { x: p.x, y: p.y };
      });
      measured.current.set(key, { el, length, screenLength: length * scale, points });
    }
  }, []);

  // Measure after the diagram has rendered, against the real elements.
  useLayoutEffect(() => {
    measure();
  }, [measure, play, timeline, style, density, v]);

  // A resize changes the scale, and with it every dash length.
  useEffect(() => {
    const el = wrap.current?.ownerSVGElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const render = useCallback(
    (t: number) => {
      for (const track of timeline.tracks) {
        const p = progressAt(track, t);
        const m = measured.current.get(track.key);
        if (m) {
          if (p >= 1) {
            // Hand the line back to its declared style — a dashed ball path is
            // dashed again the moment it arrives.
            m.el.style.strokeDasharray = "";
            m.el.style.strokeDashoffset = "";
          } else {
            m.el.style.strokeDasharray = String(m.screenLength);
            m.el.style.strokeDashoffset = String(m.screenLength * (1 - p));
          }
        }
        const cap = caps.current.get(track.key);
        if (cap) cap.style.opacity = p >= 0.999 ? "1" : "0";
      }

      // Parked at the end, the diagram must equal the static one: every route
      // drawn, and every player back on his alignment. Leaving them stranded on
      // their route ends buries the arrowheads under the glyphs, which is
      // precisely the "missing arrows" complaint. Clearing the inline transform
      // hands them back to the `transform` attribute, which is the alignment.
      const parked = t >= timeline.endSec - 0.001;

      for (const [slot, tracks] of bySlot) {
        const g = players.current.get(slot);
        if (!g) continue;
        if (parked) {
          g.style.transition = "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";
          g.style.transform = "";
          continue;
        }
        g.style.transition = "none";
        const track = activeTrackFor(tracks, t);
        const m = track && measured.current.get(track.key);
        if (!track || !m) continue;
        const i = Math.min(SAMPLES, Math.max(0, Math.round(progressAt(track, t) * SAMPLES)));
        const pt = m.points[i];
        if (pt) g.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      }

      // Numbered pre-snap and through any pause; faded once the ball is
      // actually moving, since by then they sit on top of a moving diagram.
      if (badges.current) {
        badges.current.style.opacity = playing && t > 0 ? "0" : "1";
      }
    },
    // `playing` is a dependency rather than a ref: re-subscribing re-runs the
    // frame immediately, which is exactly what should happen when the badges
    // need to come back on a pause.
    [timeline, bySlot, playing],
  );

  useEffect(() => subscribe(render), [subscribe, render]);

  return (
    <g ref={wrap}>
      {/* The route ahead, faintly. Useful while the play is running and
          harmless when it is parked complete. */}
      {trails &&
        play.paths.concat(play.ball ? [play.ball] : []).map((path, i) => {
          const pts = toPts(path.points, v);
          if (pts.length < 2) return null;
          return (
            <path
              key={`ghost-${path.slot}-${i}`}
              d={pathD(pts, path.curve, path.corner)}
              fill="none"
              stroke="var(--ghost)"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

      <PlayDiagram play={play} variant={v} style={style} density={density} anim={anim} />
    </g>
  );
}
