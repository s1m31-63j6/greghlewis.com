"use client";

/**
 * The five-state directional mark for the offseason briefing.
 *
 * THREE REDUNDANT CHANNELS carry the meaning: direction (down / flat / up),
 * chevron count (two / one / none), and fill weight (filled / stroked). Any one
 * of them alone separates all five states, so color is the fourth channel and
 * never load-bearing — which matters for a football audience, where roughly 8%
 * of men cannot order red against green, and matters again on a monochrome
 * printout.
 *
 * Drawn as paths rather than the text glyphs 'up' and 'down': those render at
 * wildly inconsistent optical sizes across platforms, have no double variant,
 * and collapse into indistinguishable triangles at 6pt.
 */

export type Trend = "much-worse" | "worse" | "same" | "better" | "much-better";

const LABEL: Record<Trend, string> = {
  "much-worse": "Much worse",
  worse: "Worse",
  same: "Unchanged",
  better: "Better",
  "much-better": "Much better",
};

export function TrendArrow({ trend, size = 12 }: { trend: Trend; size?: number }) {
  const up = trend === "better" || trend === "much-better";
  const dbl = trend === "much-better" || trend === "much-worse";
  const flat = trend === "same";

  const chev = (cy: number) =>
    up ? `M2,${cy + 2} L5,${cy - 1.5} L8,${cy + 2}` : `M2,${cy - 2} L5,${cy + 1.5} L8,${cy - 2}`;

  return (
    <svg
      className={`ds-arrow ds-arrow--${trend}`}
      width={size}
      height={size}
      viewBox="0 0 10 10"
      role="img"
      aria-label={LABEL[trend]}
      focusable="false"
    >
      <title>{LABEL[trend]}</title>
      {flat ? (
        <path d="M2,5 L8,5" className="ds-arrow-stroke" />
      ) : dbl ? (
        <>
          <path d={chev(3.2)} className="ds-arrow-fill" />
          <path d={chev(7.0)} className="ds-arrow-fill" />
        </>
      ) : (
        <path d={chev(5)} className="ds-arrow-stroke" />
      )}
    </svg>
  );
}
