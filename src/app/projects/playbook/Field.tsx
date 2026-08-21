"use client";

/**
 * The field, as inline SVG.
 *
 * Vertical, offense at the bottom attacking up — the coaching-diagram
 * convention, and the only orientation that survives a phone in portrait.
 *
 * Everything here is substrate. Brightness is rationed so the players drawn on
 * top of it are the only bright things on screen: the sideline reads at 4.0:1,
 * the ten-yard lines at 3.1:1, and the five-yard lines and hashes are dimmer
 * still and carry no information. See the contrast rule in styles.css.
 *
 * The camera is a transform on one `<g>`, never a mutated viewBox. That is what
 * lets pointer input convert through a single `getScreenCTM()` call, and it is
 * why zooming can keep strokes at a constant screen width via
 * `vector-effect="non-scaling-stroke"`.
 */

import { useId, type ReactNode } from "react";

import {
  UPY,
  hashX,
  hashYards,
  losY,
  svgX,
  svgY,
  viewBox,
  yardLines,
} from "@/lib/playbook/field";
import type { FieldVariant } from "@/lib/playbook/types";

interface Props {
  variant: FieldVariant;
  /** Camera transform. Identity when the diagram is not interactive. */
  camera?: { x: number; y: number; k: number };
  /** Hide texture at small sizes — see the density spec. */
  density?: "editor" | "card" | "print12" | "wristband";
  /** Half-yard dot grid, for the editor. */
  showGrid?: boolean;
  /** The seven-yard rush line, which is measured from the snap. */
  showRules?: boolean;
  /**
   * Where the ball is, in yards from the offense's own goal line. Flag's
   * no-run bands are field positions rather than distances from the snap, so
   * they are only drawn when the diagram actually knows where the ball is.
   */
  ballSpotYd?: number;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
  /**
   * Pointer handling belongs on the <svg>, not on an inner <g>. Over empty
   * grass the topmost element is the turf rect, which is not a descendant of
   * the camera group — so handlers mounted inside it silently dropped every
   * move and never saw the release. Drawing a route across open field, which
   * is the normal case, did nothing.
   */
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
  onPointerCancel?: React.PointerEventHandler<SVGSVGElement>;
  onWheel?: React.WheelEventHandler<SVGSVGElement>;
  cameraRef?: React.Ref<SVGGElement>;
  svgRef?: React.Ref<SVGSVGElement>;
}

/** Yard numbers count distance from the LOS, which is what a coach reads. */
function numberLabels(v: FieldVariant): { yd: number; label: string }[] {
  const out: { yd: number; label: string }[] = [];
  for (const { yd, major } of yardLines(v)) {
    if (!major || yd <= 0) continue;
    out.push({ yd, label: String(yd) });
  }
  return out;
}

export default function Field({
  variant: v,
  camera,
  density = "editor",
  showGrid = false,
  showRules = true,
  ballSpotYd,
  ariaLabel,
  className,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onWheel,
  cameraRef,
  svgRef,
}: Props) {
  const w = Math.round(v.viewWidthYd * UPY);
  const h = Math.round((v.window.aheadYd + v.window.behindYd) * UPY);
  const los = losY(v);
  const hx = hashX(v);
  const small = density === "print12" || density === "wristband";
  // Unique per diagram: twelve inline SVGs share one document, so a fixed id
  // would have every cell painting the first cell's gradient.
  const gradientId = useId();
  const tiny = density === "wristband";

  const cam = camera ?? { x: 0, y: 0, k: 1 };
  const transform = `translate(${cam.x} ${cam.y}) scale(${cam.k})`;

  return (
    <svg
      ref={svgRef}
      className={className ? `pb-field ${className}` : "pb-field"}
      viewBox={viewBox(v)}
      role="img"
      aria-label={ariaLabel ?? `${v.label} field diagram`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
    >
      <defs>
        {/* The only gradient on the field. Sits above the turf, below the line
            work, and never intercepts a pointer. Absent on paper, where it
            would print as a grey wash across the bottom of every cell — and
            where a shared id across twelve inline diagrams would collide,
            since ids are document-scoped once the SVGs are in one page. */}
        {!small && (
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
          </linearGradient>
        )}
      </defs>

      <rect x={0} y={0} width={w} height={h} fill="var(--turf)" />

      <g ref={cameraRef} className="pb-camera" transform={transform}>
        {/* Alternating five-yard bands. Pure texture at 1.1:1. */}
        {!small &&
          yardLines(v)
            .filter(({ yd }) => Math.floor(yd / 5) % 2 === 0)
            .map(({ yd }) => (
              <rect
                key={`band${yd}`}
                x={0}
                y={svgY(yd + 5, v)}
                width={w}
                height={5 * UPY}
                fill="var(--turf-band)"
              />
            ))}

        {/* Flag no-run zones, drawn only against a known ball spot. Nobody
            else draws them at all. */}
        {showRules && ballSpotYd !== undefined &&
          v.noRunZones?.map((z, i) => {
            const nearGoal = 100 - ballSpotYd <= 12;
            const nearMid = Math.abs(ballSpotYd - 50) <= 12;
            if (i === 0 ? !nearGoal : !nearMid) return null;
            const from = i === 0 ? 100 - ballSpotYd - 5 : 50 - ballSpotYd - 5;
            const to = from + 5;
            return (
              <g key={`nrz${i}`}>
                <rect
                  x={0} y={svgY(to, v)} width={w} height={5 * UPY}
                  fill="var(--turf-nrz)"
                />
                {!small && (
                  <text
                    className="pb-label" x={w - 8} y={svgY(from, v) - 6}
                    fontSize={11} fill="var(--ball)" fillOpacity={0.55} textAnchor="end"
                  >
                    {z.label.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}

        {/* Hash marks — dimmest thing on the field, dropped when small. */}
        {!small &&
          hx &&
          hashYards(v).map((yd) =>
            hx.map((x, i) => (
              <line
                key={`h${yd}-${i}`}
                x1={svgX(x, v) - 4}
                y1={svgY(yd, v)}
                x2={svgX(x, v) + 4}
                y2={svgY(yd, v)}
                stroke="var(--turf-hash)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )),
          )}

        {/* Yard lines. Only the majors carry information. */}
        {yardLines(v).map(({ yd, major }) => {
          if (small && !major) return null;
          if (yd === 0) return null;
          return (
            <line
              key={`y${yd}`}
              x1={0}
              y1={svgY(yd, v)}
              x2={w}
              y2={svgY(yd, v)}
              stroke={major ? "var(--turf-line-10)" : "var(--turf-line-5)"}
              strokeWidth={major ? 1.4 : 1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {!small &&
          numberLabels(v).map(({ yd, label }) => (
            <text
              key={`n${yd}`}
              className="pb-yardnum"
              x={12}
              y={svgY(yd, v) - 4}
              fontSize={22}
            >
              {label}
            </text>
          ))}

        {/* Sidelines, drawn only where the diagram actually reaches them —
            on an 11-man field the view is cropped well inside the boundary. */}
        {v.viewWidthYd >= v.widthYd - 0.5 && (
          <>
            <line x1={1} y1={0} x2={1} y2={h} stroke="var(--turf-edge)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <line x1={w - 1} y1={0} x2={w - 1} y2={h} stroke="var(--turf-edge)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </>
        )}

        {/* Flag's rush line, seven yards behind the LOS. */}
        {showRules && v.rushLineYd !== undefined && (
          <line
            x1={0}
            y1={svgY(-v.rushLineYd, v)}
            x2={w}
            y2={svgY(-v.rushLineYd, v)}
            stroke="var(--def)"
            strokeOpacity={0.4}
            strokeWidth={1.2}
            strokeDasharray="6 6"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Line of scrimmage. */}
        <line
          x1={0}
          y1={los}
          x2={w}
          y2={los}
          stroke="var(--accent)"
          strokeOpacity={0.7}
          strokeWidth={1.5}
          strokeDasharray={tiny ? undefined : "12 8"}
          vectorEffect="non-scaling-stroke"
        />

        {showGrid && (
          <g className="pb-grid-line">
            {Array.from({ length: Math.floor(w / 5) + 1 }, (_, i) => i * 5).map((x) =>
              Array.from({ length: Math.floor(h / 5) + 1 }, (_, j) => j * 5).map((y) => (
                <circle key={`g${x}-${y}`} cx={x} cy={y} r={0.5} fill="var(--accent)" fillOpacity={0.1} stroke="none" />
              )),
            )}
          </g>
        )}

        {children}
      </g>

      {!small && (
        <rect x={0} y={0} width={w} height={h} fill={`url(#${gradientId})`} pointerEvents="none" />
      )}
    </svg>
  );
}
