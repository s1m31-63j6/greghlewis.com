"use client";

/**
 * Five stepped cells, green to red, for a 0..1 demand where 1 is heavy.
 * The number prints beside the track so the cells read as a shape, not a
 * score. Spans throughout: the thin variant lives inside a button.
 */
export default function DemandBar({ label, value, thin = false }: { label: string; value: number; thin?: boolean }) {
  const filled = Math.min(5, Math.max(0, Math.round(value * 5)));
  const pct = Math.round(value * 100);
  return (
    <span className={`cp-adv-demand ${thin ? "thin" : ""}`} role="img" aria-label={`${label}: ${pct} of 100`}>
      {!thin && <span className="cp-kicker">{label}</span>}
      <span className="cp-adv-demand-row">
        <span className="cp-adv-demand-track">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="cp-adv-demand-cell"
              style={i <= filled ? { background: `var(--demand-${i})` } : undefined}
            />
          ))}
        </span>
        <span className="cp-mono cp-adv-demand-num">{pct}</span>
      </span>
    </span>
  );
}
