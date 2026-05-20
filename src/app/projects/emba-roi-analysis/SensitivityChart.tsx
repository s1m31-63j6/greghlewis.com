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

// Two-sided diverging colorscale centered on 0 (breakeven). Plotly
// interpolates between stops; the [0, 1] axis is normalized to (zmin, zmax).
const DIVERGING_COLORSCALE = [
  [0.0, PALETTE.negative],
  [0.35, PALETTE.negativeSoft],
  [0.5, PALETTE.neutral],
  [0.65, PALETTE.positiveSoft],
  [1.0, PALETTE.positive],
];

export function SensitivityChart({ base }: Props) {
  const sweep = useMemo(() => {
    const rates = [0.0, 0.025, 0.05, 0.075, 0.10, 0.125, 0.15, 0.175, 0.20];
    const years = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    return sensitivitySweep(base, rates, years);
  }, [base]);

  const absMax = useMemo(() => {
    let m = 0;
    for (const row of sweep.deltaNpv) for (const v of row) m = Math.max(m, Math.abs(v));
    return m;
  }, [sweep]);

  const text = sweep.deltaNpv.map((row) =>
    row.map((v) => {
      const sign = v > 0 ? "+" : v < 0 ? "−" : "";
      const abs = Math.abs(v);
      if (abs >= 100_000) return `${sign}$${Math.round(abs / 1000)}k`;
      if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}k`;
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
      x: sweep.rates.map((r) => `${(r * 100).toFixed(1)}%`),
      y: sweep.years.map((y) => `${y} yr`),
      z: sweep.deltaNpv,
      text,
      texttemplate: "%{text}",
      textfont: {
        family: "var(--font-jetbrains-mono), JetBrains Mono, ui-monospace, monospace",
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
        "Wage growth %{x} for %{y}<br>Δ nest egg: $%{z:,.0f}<extra></extra>",
    },
  ] as unknown as Data[];

  const layout = {
    autosize: true,
    height: 380,
    margin: { l: 80, r: 24, t: 16, b: 52 },
    paper_bgcolor: PALETTE.paper,
    plot_bgcolor: PALETTE.paper,
    font: { family: "var(--font-inter), Inter, sans-serif", size: 13, color: PALETTE.ink },
    xaxis: {
      title: {
        text: "Annualized wage growth attributed to the program",
        font: { size: 12, color: PALETTE.inkQuiet },
      },
      tickfont: { size: 11, color: PALETTE.inkQuiet },
      showgrid: false,
      ticklen: 0,
      side: "bottom" as const,
    },
    yaxis: {
      title: { text: "Years of growth", font: { size: 12, color: PALETTE.inkQuiet } },
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
