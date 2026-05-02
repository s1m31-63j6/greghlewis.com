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

interface Props {
  axes: Axis[];
  max?: number;
  color: string;
  size?: number;
}

export default function RadarChart({ axes, max = 5, color, size = 280 }: Props) {
  if (axes.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;
  const labelRadius = radius + 14;
  const rings = 4;

  const angle = (i: number) => (Math.PI * 2 * i) / axes.length - Math.PI / 2;

  const point = (i: number, r: number) => ({
    x: cx + Math.cos(angle(i)) * r,
    y: cy + Math.sin(angle(i)) * r,
  });

  // Build a polygon path that skips null-valued axes. Using a path rather
  // than a polygon element so we can break the outline cleanly when a
  // missing trait separates two scored ones — the polygon segment connects
  // the previous valid vertex to the next valid vertex, jumping across the
  // missing axis instead of collapsing to the center.
  const validIndices = axes
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.value !== null);
  const polygonPath = (() => {
    if (validIndices.length < 3) return null;
    const segments = validIndices.map(({ a, i }, idx) => {
      const v = Math.max(0, Math.min(max, a.value as number));
      const p = point(i, (v / max) * radius);
      return `${idx === 0 ? "M" : "L"}${p.x},${p.y}`;
    });
    return segments.join(" ") + " Z";
  })();

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full h-auto"
      role="img"
      aria-label="Trait radar"
    >
      {Array.from({ length: rings }).map((_, ringIdx) => {
        const ringR = ((ringIdx + 1) / rings) * radius;
        const pts = axes
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

      {axes.map((a, i) => {
        const p = point(i, radius);
        const isMissing = a.value === null;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke={isMissing ? "rgba(20,20,20,0.06)" : "rgba(20,20,20,0.08)"}
            strokeWidth={1}
            strokeDasharray={isMissing ? "2 3" : undefined}
          />
        );
      })}

      {polygonPath && (
        <path
          d={polygonPath}
          fill={color}
          fillOpacity={0.25}
          stroke={color}
          strokeWidth={1.5}
        />
      )}

      {axes.map((a, i) => {
        if (a.value === null) {
          // Outer-ring tick: a small empty ring sits on the axis at the
          // perimeter to communicate "this dimension exists but we have
          // no score to plot" without faking a value at any radius.
          const p = point(i, radius);
          return (
            <circle
              key={`pt-${i}`}
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
        return (
          <circle
            key={`pt-${i}`}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill={color}
          />
        );
      })}

      {axes.map((a, i) => {
        const p = point(i, labelRadius);
        const ang = angle(i);
        const cos = Math.cos(ang);
        const anchor =
          Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        const isMissing = a.value === null;
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
