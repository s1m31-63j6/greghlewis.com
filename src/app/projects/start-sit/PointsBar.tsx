/**
 * Where a player's expected points come from, as one horizontal stacked bar.
 *
 * Three positive segments in one hue at three lightness steps — yards,
 * receptions, touchdowns — and interceptions as a negative segment to the left
 * of zero. One hue rather than a category per stat: the site's editorial
 * palette fails the colorblind check as a four-hue categorical set, and the
 * stat table directly below already itemises every line. Every segment wide
 * enough to hold a number is labeled in place; the rest are named in the key.
 */

import type { Breakdown } from "@/lib/start-sit/scoring";

export type Bucket = "yards" | "receptions" | "touchdowns" | "interceptions";

export const BUCKET_LABEL: Record<Bucket, string> = {
  yards: "Yards",
  receptions: "Receptions",
  touchdowns: "Touchdowns",
  interceptions: "Interceptions",
};

export const BUCKET_FILL: Record<Bucket, string> = {
  yards: "var(--bar-1)",
  receptions: "var(--bar-2)",
  touchdowns: "var(--bar-3)",
  interceptions: "var(--negative)",
};
const BUCKET_INK: Record<Bucket, string> = {
  yards: "#fff",
  receptions: "#fff",
  touchdowns: "var(--ink)",
  interceptions: "#fff",
};

function bucketOf(key: string): Bucket {
  if (key === "rec") return "receptions";
  if (key === "td" || key === "pass_tds") return "touchdowns";
  if (key === "ints") return "interceptions";
  return "yards";
}

export function buckets(b: Breakdown): Record<Bucket, number> {
  const out: Record<Bucket, number> = { yards: 0, receptions: 0, touchdowns: 0, interceptions: 0 };
  for (const c of b.parts) out[bucketOf(c.key)] += c.points;
  return out;
}

const H = 22;
const GAP = 2;

export function PointsBar({
  breakdown, scale, width = 320,
}: {
  breakdown: Breakdown;
  /** Points per full width, shared across the cards so bars compare. */
  scale: number;
  width?: number;
}) {
  const b = buckets(breakdown);
  const neg = Math.abs(b.interceptions);
  const negW = (neg / scale) * width;
  const x0 = negW > 0 ? negW + GAP : 0;
  const order: Bucket[] = ["yards", "receptions", "touchdowns"];
  let x = x0;
  const segs = order
    .filter((k) => b[k] > 0)
    .map((k) => {
      const w = (b[k] / scale) * width;
      const seg = { k, x, w };
      x += w + GAP;
      return seg;
    });
  const total = Math.max(x0, x - GAP);

  return (
    <svg
      className="ss-bar"
      viewBox={`0 0 ${width} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
      aria-label={order.map((k) => `${BUCKET_LABEL[k]} ${b[k].toFixed(1)}`).join(", ") +
        (neg ? `, interceptions −${neg.toFixed(1)}` : "")}
    >
      {negW > 0 && (
        <g>
          <rect x={0} y={0} width={negW} height={H} fill={BUCKET_FILL.interceptions} />
          {negW > 22 && (
            <text x={negW / 2} y={H / 2} className="ss-bar-label" fill={BUCKET_INK.interceptions}>
              −{neg.toFixed(1)}
            </text>
          )}
        </g>
      )}
      {segs.map((s) => (
        <g key={s.k}>
          <rect x={s.x} y={0} width={Math.max(0, s.w)} height={H} fill={BUCKET_FILL[s.k]} />
          {s.w > 26 && (
            <text x={s.x + s.w / 2} y={H / 2} className="ss-bar-label" fill={BUCKET_INK[s.k]}>
              {b[s.k].toFixed(1)}
            </text>
          )}
        </g>
      ))}
      {total < width && <line x1={total} x2={width} y1={H / 2} y2={H / 2} className="ss-bar-rest" />}
    </svg>
  );
}

export function PointsKey() {
  return (
    <ul className="ss-bar-key" aria-label="Points bar key">
      {(["yards", "receptions", "touchdowns", "interceptions"] as Bucket[]).map((k) => (
        <li key={k}>
          <span className="ss-bar-swatch" style={{ background: BUCKET_FILL[k] }} aria-hidden="true" />
          {BUCKET_LABEL[k]}
        </li>
      ))}
    </ul>
  );
}
