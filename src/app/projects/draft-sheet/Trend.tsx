"use client";

/**
 * Thirty-day ADP movement, as one glyph.
 *
 * This replaced a per-row sparkline. The sparkline was honest but it cost 28px
 * on every row to answer a question with three possible answers, and on a board
 * whose whole argument is density that is a bad trade. The full series is still
 * a click away on the player, and the methodology page keeps the caveats about
 * spring coverage.
 *
 * POSITIVE `move` MEANS RISING — the sign is flipped upstream in publish.py, so
 * nothing here has to remember that ADP falls as a player climbs.
 */

/** Picks of movement before an arrow leaves neutral. Median move is ~4.6. */
const THRESHOLD = 6;

export function Trend({ move }: { move: number | null | undefined }) {
  if (move == null) return <span className="ds-trend is-none" aria-hidden="true" />;

  const dir = move >= THRESHOLD ? "up" : move <= -THRESHOLD ? "down" : "flat";
  const label =
    dir === "flat"
      ? "ADP steady over the last 30 days"
      : `ADP ${dir === "up" ? "rising" : "falling"} — ${Math.abs(Math.round(move))} picks in 30 days`;

  return (
    <svg
      className={`ds-trend ds-trend--${dir}`}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      role="img"
      aria-label={label}
      focusable="false"
    >
      <title>{label}</title>
      {dir === "flat" ? (
        <path d="M2,5 L8,5" />
      ) : dir === "up" ? (
        <path d="M2,6.5 L5,3 L8,6.5" />
      ) : (
        <path d="M2,3.5 L5,7 L8,3.5" />
      )}
    </svg>
  );
}
