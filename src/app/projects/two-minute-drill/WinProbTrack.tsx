"use client";

/**
 * Win probability across the decisions you made, drawn by hand.
 *
 * A diverging area around the 50% line, in the manner of the chess coach's
 * WinTrend: above the line is your side of the game, below it is theirs. The
 * shaded band is two standard errors of the search, which is not decoration —
 * a good number of these swings sit inside it, and the chart should say so.
 *
 * Each call is marked with its verdict. Hue, size and fill all carry that,
 * and a key names every one, because a reader should never have to infer a
 * category from color alone. See `VERDICT_MARK` in grade.ts for the palette
 * and why it is stepped the way it is.
 */

import { VERDICT_MARK, VERDICT_ORDER, type Graded } from "./grade";
import { formatClock } from "./scenarios";
import type { Decision } from "./useDrill";

interface Props {
  decisions: Decision[];
  grades: Graded[];
  height?: number;
}

const PAD = { top: 12, right: 10, bottom: 18, left: 32 };

export default function WinProbTrack({ decisions, grades, height = 148 }: Props) {
  const points = decisions.map((d, i) => {
    const g = grades[i];
    return {
      wp: g?.chosen?.wp ?? 0.5,
      se: g?.chosen?.stderr ?? 0,
      verdict: g?.verdict ?? "fine",
      loss: g?.loss ?? 0,
      clock: formatClock(d.before.seconds),
    };
  });
  if (!points.length) return null;

  const W = 640;
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (p: number) => PAD.top + (1 - p) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.wp)}`).join(" ");
  const bandTop = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(Math.min(1, p.wp + p.se * 2))}`)
    .join(" ");
  const bandBottom = points
    .slice()
    .reverse()
    .map((p, i) => `L${x(points.length - 1 - i)},${y(Math.max(0, p.wp - p.se * 2))}`)
    .join(" ");

  // Only the verdicts actually present, so the key never advertises a state
  // this game did not contain.
  const present = VERDICT_ORDER.filter((v) => points.some((p) => p.verdict === v));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Your win probability across the drill, with each call marked by its verdict"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line
              x1={PAD.left}
              y1={y(g)}
              x2={W - PAD.right}
              y2={y(g)}
              stroke={g === 0.5 ? "var(--ink-quiet)" : "var(--rule-soft)"}
              strokeWidth={g === 0.5 ? 1 : 0.6}
              strokeDasharray={g === 0.5 ? "3 3" : undefined}
            />
            <text
              x={PAD.left - 6}
              y={y(g) + 3}
              textAnchor="end"
              fontSize={9}
              fontFamily="var(--display)"
              style={{ fontStretch: "78%" }}
              fill="var(--ink-meta)"
            >
              {Math.round(g * 100)}
            </text>
          </g>
        ))}

        <path d={`${bandTop} ${bandBottom} Z`} fill="var(--accent)" opacity={0.13} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} />

        {points.map((p, i) => {
          const mark = VERDICT_MARK[p.verdict];
          return (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.wp)}
              r={mark.radius}
              fill={mark.hollow ? "var(--card)" : mark.color}
              stroke={mark.hollow ? mark.color : "var(--card)"}
              strokeWidth={mark.hollow ? 2 : 1.5}
            >
              {/* Native tooltip: the full detail lives in the list below, so a
                  hover layer would be a second copy of it. */}
              <title>
                {`${p.clock} — ${mark.label}` +
                  ` · ${(p.wp * 100).toFixed(1)}% win probability` +
                  (p.loss > 0 && p.verdict !== "toss"
                    ? ` · cost ${(p.loss * 100).toFixed(1)} points`
                    : "")}
              </title>
            </circle>
          );
        })}

        <text
          x={PAD.left}
          y={H - 4}
          fontSize={9}
          fontFamily="var(--display)"
          style={{ fontStretch: "78%" }}
          fill="var(--ink-meta)"
        >
          FIRST CALL
        </text>
        <text
          x={W - PAD.right}
          y={H - 4}
          textAnchor="end"
          fontSize={9}
          fontFamily="var(--display)"
          style={{ fontStretch: "78%" }}
          fill="var(--ink-meta)"
        >
          FINAL WHISTLE
        </text>
      </svg>

      <ul className="tmd-key" aria-label="What each mark means">
        {present.map((v) => {
          const m = VERDICT_MARK[v];
          return (
            <li key={v}>
              <svg width={16} height={16} aria-hidden="true">
                <circle
                  cx={8}
                  cy={8}
                  r={m.radius}
                  fill={m.hollow ? "var(--card)" : m.color}
                  stroke={m.hollow ? m.color : "var(--card)"}
                  strokeWidth={m.hollow ? 2 : 1.5}
                />
              </svg>
              {m.label}
            </li>
          );
        })}
        <li className="tmd-key-note">
          Shaded band is the search&apos;s margin of error
        </li>
      </ul>
    </div>
  );
}
