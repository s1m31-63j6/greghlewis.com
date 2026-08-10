"use client";

import { useId } from "react";

/**
 * Win probability across the game.
 *
 * Form: change-over-time, so a line. The measure has a natural midpoint — 50%
 * is "equal" — which makes this a *diverging* encoding rather than a sequential
 * one: two hues either side of a neutral baseline, never a single ramp.
 *
 * The big percentage above the plot is not decoration. The bright hues sit
 * below 3:1 against a light surface, and the palette validator flags that as
 * requiring visible labels rather than color alone. The number is that relief,
 * and it happens to be the thing a player actually wants to read.
 */

const GOOD = "#58CC02"; // feather green — the player is ahead
const BAD = "#A560E8"; // violet — the coach is ahead
const NEUTRAL = "#AFAFAF";

const WIDTH = 320;
const HEIGHT = 96;

export type TrendPoint = { ply: number; winPct: number };

function path(points: TrendPoint[], width: number, height: number): string {
  if (points.length === 0) return "";
  const step = points.length === 1 ? 0 : width / (points.length - 1);
  return points
    .map((point, i) => {
      const x = i * step;
      const y = height - (point.winPct / 100) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function WinTrend({
  points,
  thinking,
  title = "Your chances",
  aheadLabel,
  behindLabel,
}: {
  points: TrendPoint[];
  thinking: boolean;
  /** Heading above the number. */
  title?: string;
  /** Who the percentage belongs to, and who the other half belongs to. Supplying
   *  both switches on a legend — needed when two humans are playing and neither
   *  of them is "you". */
  aheadLabel?: string;
  behindLabel?: string;
}) {
  const clipAbove = useId();
  const clipBelow = useId();

  const current = points.length ? points[points.length - 1].winPct : 50;
  const previous = points.length > 1 ? points[points.length - 2].winPct : current;
  const delta = current - previous;
  const ahead = current >= 50;

  const line = path(points, WIDTH, HEIGHT);
  const midY = HEIGHT / 2;
  // Close the line into a filled shape against the 50% baseline, then clip it
  // above and below so each half can take its own hue.
  const area = line ? `${line} L${WIDTH},${midY} L0,${midY} Z` : "";

  return (
    <section className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">{title}</h2>
        {points.length > 1 && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-extrabold"
            style={{
              color: delta >= 0 ? GOOD : BAD,
              backgroundColor: delta >= 0 ? "rgba(88,204,2,0.12)" : "rgba(165,96,232,0.12)",
            }}
          >
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}
          </span>
        )}
      </div>

      <p className="mt-1 flex items-baseline gap-1">
        <span
          className="font-round text-5xl font-black tabular-nums"
          style={{ color: ahead ? GOOD : BAD }}
        >
          {thinking && points.length === 0 ? "–" : Math.round(current)}
        </span>
        <span className="text-2xl font-black" style={{ color: ahead ? GOOD : BAD }}>
          %
        </span>
      </p>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-2 h-24 w-full overflow-visible"
        role="img"
        aria-label={`Win probability ${Math.round(current)} percent after ${points.length} half-moves`}
      >
        <defs>
          <clipPath id={clipAbove}>
            <rect x="0" y="0" width={WIDTH} height={midY} />
          </clipPath>
          <clipPath id={clipBelow}>
            <rect x="0" y={midY} width={WIDTH} height={midY} />
          </clipPath>
        </defs>

        {/* Neutral 50% baseline — the reference the two hues diverge from. */}
        <line
          x1="0"
          y1={midY}
          x2={WIDTH}
          y2={midY}
          stroke={NEUTRAL}
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />

        {area && (
          <>
            <path d={area} fill={GOOD} opacity="0.22" clipPath={`url(#${clipAbove})`} />
            <path d={area} fill={BAD} opacity="0.22" clipPath={`url(#${clipBelow})`} />
          </>
        )}
        {line && (
          <>
            <path
              d={line}
              fill="none"
              stroke={GOOD}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              clipPath={`url(#${clipAbove})`}
            />
            <path
              d={line}
              fill="none"
              stroke={BAD}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              clipPath={`url(#${clipBelow})`}
            />
          </>
        )}

        {points.length > 0 && (
          <circle
            cx={WIDTH}
            cy={HEIGHT - (current / 100) * HEIGHT}
            r="5"
            fill={ahead ? GOOD : BAD}
            stroke="#fff"
            strokeWidth="2.5"
          />
        )}
      </svg>

      {aheadLabel && behindLabel ? (
        <div className="mt-1 flex justify-between text-[11px] font-bold">
          <span className="flex items-center gap-1.5" style={{ color: GOOD }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GOOD }} />
            {aheadLabel} ahead
          </span>
          <span className="flex items-center gap-1.5" style={{ color: BAD }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BAD }} />
            {behindLabel} ahead
          </span>
        </div>
      ) : (
        <div className="mt-1 flex justify-between text-[11px] font-bold text-[#999]">
          <span>Start</span>
          <span>{points.length ? `${points.length} moves in` : "Not started"}</span>
        </div>
      )}
    </section>
  );
}
