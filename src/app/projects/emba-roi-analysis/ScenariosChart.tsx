"use client";

import { useMemo } from "react";
import { PRESETS } from "./presets";
import { simulate } from "./model";
import Plot from "./Plot";

const PALETTE = {
  paper: "#fbfaf7",
  ink: "#171717",
  inkQuiet: "#6b6b6b",
  grid: "#e3dfd6",
  modest: "#b3892c",
  median: "#2b6aa3",
  strong: "#2c7a5c",
  pivot: "#9b2424",
  baseline: "#6b6b6b",
};

const COLOR_BY_PRESET: Record<string, string> = {
  modest: PALETTE.modest,
  median: PALETTE.median,
  strong: PALETTE.strong,
  "career-pivot": PALETTE.pivot,
  baseline: PALETTE.baseline,
};

export function ScenariosChart() {
  const traces = useMemo(() => {
    return PRESETS.map((preset) => {
      const rows = simulate(preset.assumptions, {
        baseline: preset.id === "baseline",
      });
      const isBaseline = preset.id === "baseline";
      return {
        x: rows.map((r) => r.year),
        y: rows.map((r) => r.realTotalInvestments),
        name: preset.label,
        type: "scatter" as const,
        mode: "lines" as const,
        line: {
          color: COLOR_BY_PRESET[preset.id],
          width: isBaseline ? 2 : 2.5,
          dash: isBaseline ? ("dot" as const) : undefined,
        },
        hovertemplate: `<b>${preset.label}</b><br>Year %{x}: $%{y:,.0f}<extra></extra>`,
      };
    });
  }, []);

  const annotations = useMemo(
    () =>
      traces.map((t) => ({
        x: t.x[t.x.length - 1],
        y: t.y[t.y.length - 1],
        text: ` ${t.name}`,
        showarrow: false,
        xanchor: "left" as const,
        yanchor: "middle" as const,
        font: {
          size: 12,
          color: t.line.color,
          family: "var(--font-inter), Inter, sans-serif",
          weight: 600,
        },
      })),
    [traces],
  );

  const layout = {
    autosize: true,
    height: 480,
    margin: { l: 64, r: 150, t: 16, b: 48 },
    paper_bgcolor: PALETTE.paper,
    plot_bgcolor: PALETTE.paper,
    font: { family: "var(--font-inter), Inter, sans-serif", size: 13, color: PALETTE.ink },
    showlegend: false,
    xaxis: {
      title: { text: "Years from start of program", font: { size: 12, color: PALETTE.inkQuiet } },
      tickfont: { size: 11, color: PALETTE.inkQuiet },
      showgrid: false,
      zeroline: false,
    },
    yaxis: {
      tickfont: { size: 11, color: PALETTE.inkQuiet },
      tickprefix: "$",
      tickformat: ",.0s",
      gridcolor: PALETTE.grid,
      zerolinecolor: PALETTE.grid,
    },
    annotations,
  };

  return (
    <Plot
      data={traces}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
