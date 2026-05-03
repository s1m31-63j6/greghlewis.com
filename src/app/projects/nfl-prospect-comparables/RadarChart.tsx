"use client";

interface Axis {
  label: string;
  // null = no data for this prospect on this trait. The axis is still drawn
  // (so the position-wide trait set stays visually consistent across all
  // players), but the polygon SKIPS the vertex and the label is annotated
  // "N/A" rather than collapsing toward the center, which would imply a
  // weakness we don't actually have data on.
  value: number | null;
}

// Overlay support: compare mode renders two prospects on the same canonical
// axis set with distinct colors. Single-prospect mode passes a one-element
// array (or the legacy axes/color props, kept for backwards compatibility).
//
// `dashed` is the disambiguation lever for compare mode: when both prospects
// share a position they get the same color, so the partner series flips to
// a dashed stroke + hollow vertex markers so it reads as the secondary line
// at a glance. Combined with the matching legend swatch in SidePanel, the
// "whose line is which" question answers itself.
interface Series {
  axes: Axis[];
  color: string;
  dashed?: boolean;
}

interface Props {
  axes?: Axis[];
  series?: Series[];
  max?: number;
  color?: string;
  size?: number;
}

export default function RadarChart({
  axes,
  series,
  max = 5,
  color,
  size = 280,
}: Props) {
  // Normalize: callers can pass either the legacy single-series API
  // (axes + color) or the multi-series API (series). Internally we always
  // iterate over a series array.
  const normalizedSeries: Series[] =
    series && series.length > 0
      ? series
      : axes && color
        ? [{ axes, color }]
        : [];
  if (normalizedSeries.length === 0) return null;
  // Axis layout (labels, rings, spokes) is driven by the first series'
  // axis labels — callers MUST pass the same canonical axis set across
  // all series in compare mode, or labels will be misaligned. The radar
  // factory in SidePanel guarantees this by deriving axes from the
  // position-wide canonical key set, not from the player's traits.
  const axisLayout = normalizedSeries[0].axes;
  if (axisLayout.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;
  const labelRadius = radius + 14;
  const rings = 4;
  const isOverlay = normalizedSeries.length > 1;
  // In overlay mode the polygon fills get muddy when both series shade the
  // same wedge — drop fill opacity so the strokes do the work and overlap
  // regions still read as overlap, not a solid third color.
  const fillOpacity = isOverlay ? 0.10 : 0.25;
  const strokeWidth = isOverlay ? 1.75 : 1.5;

  const angle = (i: number) => (Math.PI * 2 * i) / axisLayout.length - Math.PI / 2;

  const point = (i: number, r: number) => ({
    x: cx + Math.cos(angle(i)) * r,
    y: cy + Math.sin(angle(i)) * r,
  });

  // Build a polygon path for one series. Skips null-valued axes (path
  // jumps the missing vertex) so a missing trait doesn't collapse the
  // polygon toward the center, which would imply a weakness we don't
  // actually have data on.
  const polygonPathFor = (s: Series): string | null => {
    const validIndices = s.axes
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.value !== null);
    if (validIndices.length < 3) return null;
    const segments = validIndices.map(({ a, i }, idx) => {
      const v = Math.max(0, Math.min(max, a.value as number));
      const p = point(i, (v / max) * radius);
      return `${idx === 0 ? "M" : "L"}${p.x},${p.y}`;
    });
    return segments.join(" ") + " Z";
  };

  // Per-axis "is this dimension scored for ANY series?" — drives the
  // axis spoke + label styling. An axis missing from BOTH series in
  // overlay mode reads dashed and italic; if at least one series has a
  // value, the axis renders solid.
  const axisHasAnyValue = axisLayout.map((_, i) =>
    normalizedSeries.some((s) => (s.axes[i]?.value ?? null) !== null),
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full h-auto"
      role="img"
      aria-label="Trait radar"
    >
      {Array.from({ length: rings }).map((_, ringIdx) => {
        const ringR = ((ringIdx + 1) / rings) * radius;
        const pts = axisLayout
          .map((_, i) => {
            const p = point(i, ringR);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={ringIdx}
            points={pts}
            fill="none"
            stroke="rgba(20,20,20,0.10)"
            strokeWidth={1}
          />
        );
      })}

      {axisLayout.map((_, i) => {
        const p = point(i, radius);
        const hasValue = axisHasAnyValue[i];
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke={hasValue ? "rgba(20,20,20,0.08)" : "rgba(20,20,20,0.06)"}
            strokeWidth={1}
            strokeDasharray={hasValue ? undefined : "2 3"}
          />
        );
      })}

      {normalizedSeries.map((s, sIdx) => {
        const path = polygonPathFor(s);
        if (!path) return null;
        return (
          <path
            key={`poly-${sIdx}`}
            d={path}
            fill={s.color}
            fillOpacity={s.dashed ? fillOpacity * 0.5 : fillOpacity}
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            strokeLinejoin="round"
          />
        );
      })}

      {/* Vertex points per series. Drawn on top of polygons so trait peaks
          are still legible where the two shapes cross. In overlay mode each
          series uses a slightly smaller radius to differentiate visually. */}
      {normalizedSeries.map((s, sIdx) =>
        s.axes.map((a, i) => {
          if (a.value === null) {
            // Only render the missing-data tick once per axis (first series).
            if (sIdx > 0) return null;
            if (axisHasAnyValue[i]) return null;
            const p = point(i, radius);
            return (
              <circle
                key={`pt-${sIdx}-${i}`}
                cx={p.x}
                cy={p.y}
                r={2.5}
                fill="none"
                stroke="rgba(40,40,40,0.35)"
                strokeWidth={1}
                strokeDasharray="1 1.5"
              />
            );
          }
          const v = Math.max(0, Math.min(max, a.value));
          const p = point(i, (v / max) * radius);
          // Hollow markers on the dashed series add a second redundant cue
          // (alongside the dashed stroke) for whose line is which.
          return s.dashed ? (
            <circle
              key={`pt-${sIdx}-${i}`}
              cx={p.x}
              cy={p.y}
              r={2.2}
              fill="white"
              stroke={s.color}
              strokeWidth={1.25}
            />
          ) : (
            <circle
              key={`pt-${sIdx}-${i}`}
              cx={p.x}
              cy={p.y}
              r={isOverlay ? 2.0 : 2.5}
              fill={s.color}
            />
          );
        }),
      )}

      {axisLayout.map((a, i) => {
        const p = point(i, labelRadius);
        const ang = angle(i);
        const cos = Math.cos(ang);
        const anchor =
          Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        const isMissing = !axisHasAnyValue[i];
        return (
          <text
            key={`lbl-${i}`}
            x={p.x}
            y={p.y}
            fill={isMissing ? "rgba(40,40,40,0.40)" : "rgba(40,40,40,0.75)"}
            fontSize={9}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontStyle={isMissing ? "italic" : undefined}
          >
            {a.label}
            {isMissing && (
              <tspan fill="rgba(40,40,40,0.30)" fontSize={8}>
                {" "}· N/A
              </tspan>
            )}
          </text>
        );
      })}
    </svg>
  );
}
