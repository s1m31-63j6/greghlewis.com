"use client";

import { useMemo } from "react";
import type { Data } from "plotly.js";
import type { Assumptions } from "./model";
import { sensitivitySweep } from "./model";
import Plot from "./Plot";

type Props = {
  base: Assumptions;
};

const PALETTE = {
  paper: "#fbfaf7",
  ink: "#171717",
  inkQuiet: "#6b6b6b",
  grid: "#e3dfd6",
  negative: "#9b2424",
  negativeSoft: "#e7cbca",
  neutral: "#fbfaf7",
  positiveSoft: "#cfe2d9",
  positive: "#2c7a5c",
};

// Diverging colorscale centered on 0 (breakeven with sell-now). The full
// [0,1] axis is normalized to (zmin, zmax) — and because every cell here is
// positive (build-to-sell strictly beats sell-now under reasonable inputs),
// the negative half is mostly cosmetic.
const DIVERGING_COLORSCALE = [
  [0.0, PALETTE.negative],
  [0.35, PALETTE.negativeSoft],
  [0.5, PALETTE.neutral],
  [0.65, PALETTE.positiveSoft],
  [1.0, PALETTE.positive],
];

export function SensitivityChart({ base }: Props) {
  const sweep = useMemo(() => {
    const saleMonths = [6, 12, 18, 24, 30, 36, 42, 48, 54];
    const liftRates = [0.0, 0.005, 0.010, 0.015, 0.020, 0.025];
    return sensitivitySweep(base, saleMonths, liftRates);
  }, [base]);

  const absMax = useMemo(() => {
    let m = 0;
    for (const row of sweep.deltaValue)
      for (const v of row) m = Math.max(m, Math.abs(v));
    return m;
  }, [sweep]);

  const text = sweep.deltaValue.map((row) =>
    row.map((v) => {
      const sign = v > 0 ? "+" : v < 0 ? "−" : "";
      const abs = Math.abs(v);
      if (abs >= 10_000_000) return `${sign}$${Math.round(abs / 1_000_000)}M`;
      if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
      return "0";
    }),
  );

  // The Plotly heatmap accepts `text` as a 2D array at runtime, but the
  // upstream types narrow `text` to a 1D array on PlotData. Cast through
  // unknown so the heatmap-specific shape can be passed without rewriting
  // both this trace and the layout.
  const data = [
    {
      type: "heatmap" as const,
      x: sweep.liftRates.map((r) => `${(r * 100).toFixed(2)}%`),
      y: sweep.saleMonths.map((m) => `${m} mo`),
      z: sweep.deltaValue,
      text,
      texttemplate: "%{text}",
      textfont: {
        family:
          "var(--font-jetbrains-mono), JetBrains Mono, ui-monospace, monospace",
        size: 12,
        color: PALETTE.ink,
      },
      colorscale: DIVERGING_COLORSCALE,
      zmin: -absMax,
      zmax: absMax,
      zmid: 0,
      showscale: false,
      xgap: 2,
      ygap: 2,
      hovertemplate:
        "Lift %{x}/mo, sale in %{y}<br>Δ vs. sell-now: $%{z:,.0f}<extra></extra>",
    },
  ] as unknown as Data[];

  const layout = {
    autosize: true,
    height: 380,
    margin: { l: 70, r: 24, t: 16, b: 52 },
    paper_bgcolor: PALETTE.paper,
    plot_bgcolor: PALETTE.paper,
    font: {
      family: "var(--font-inter), Inter, sans-serif",
      size: 13,
      color: PALETTE.ink,
    },
    xaxis: {
      title: {
        text: "Restructure lift, additional monthly growth at full ramp",
        font: { size: 12, color: PALETTE.inkQuiet },
      },
      tickfont: { size: 11, color: PALETTE.inkQuiet },
      showgrid: false,
      ticklen: 0,
      side: "bottom" as const,
    },
    yaxis: {
      title: {
        text: "Months until sale",
        font: { size: 12, color: PALETTE.inkQuiet },
      },
      tickfont: { size: 11, color: PALETTE.inkQuiet },
      autorange: "reversed" as const,
      showgrid: false,
      ticklen: 0,
    },
  };

  return (
    <Plot
      data={data}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
