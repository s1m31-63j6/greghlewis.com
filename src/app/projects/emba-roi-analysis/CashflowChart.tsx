"use client";

import { useMemo } from "react";
import type { YearRow } from "./model";
import Plot from "./Plot";

type Props = {
  scenarioRows: YearRow[];
  baselineRows: YearRow[];
  scenarioLabel: string;
};

const PALETTE = {
  paper: "#fbfaf7",
  ink: "#171717",
  inkQuiet: "#6b6b6b",
  inkMeta: "#999999",
  grid: "#e3dfd6",
  accent: "#c13b2a",
  positive: "#2c7a5c",
  baseline: "#999999",
};

export function CashflowChart({ scenarioRows, baselineRows, scenarioLabel }: Props) {
  const data = useMemo(() => {
    const years = scenarioRows.map((r) => r.year);
    const scenarioBalance = scenarioRows.map((r) => r.realTotalInvestments);
    const baselineBalance = baselineRows.map((r) => r.realTotalInvestments);

    return [
      {
        x: years,
        y: baselineBalance,
        name: "Baseline (no program)",
        type: "scatter" as const,
        mode: "lines" as const,
        line: { color: PALETTE.baseline, width: 2, dash: "dot" as const },
        hovertemplate: "<b>Baseline</b><br>Year %{x}: $%{y:,.0f}<extra></extra>",
      },
      {
        x: years,
        y: scenarioBalance,
        name: scenarioLabel,
        type: "scatter" as const,
        mode: "lines" as const,
        line: { color: PALETTE.accent, width: 2.5 },
        fill: "tonexty" as const,
        fillcolor:
          scenarioBalance[scenarioBalance.length - 1] >=
          baselineBalance[baselineBalance.length - 1]
            ? "rgba(44, 122, 92, 0.12)"
            : "rgba(155, 36, 36, 0.10)",
        hovertemplate: `<b>${scenarioLabel}</b><br>Year %{x}: $%{y:,.0f}<extra></extra>`,
      },
    ];
  }, [scenarioRows, baselineRows, scenarioLabel]);

  const finalScenario = scenarioRows[scenarioRows.length - 1];
  const finalBaseline = baselineRows[baselineRows.length - 1];
  const lastYear = finalScenario.year;

  const layout = useMemo(
    () => ({
      autosize: true,
      height: 380,
      margin: { l: 60, r: 24, t: 16, b: 44 },
      paper_bgcolor: PALETTE.paper,
      plot_bgcolor: PALETTE.paper,
      font: { family: "var(--font-inter), Inter, sans-serif", size: 13, color: PALETTE.ink },
      showlegend: false,
      xaxis: {
        title: { text: "Years from start of program", font: { size: 12, color: PALETTE.inkQuiet } },
        tickfont: { size: 11, color: PALETTE.inkQuiet },
        showgrid: false,
        zeroline: false,
        ticklen: 0,
      },
      yaxis: {
        tickfont: { size: 11, color: PALETTE.inkQuiet },
        tickprefix: "$",
        tickformat: ",.0s",
        gridcolor: PALETTE.grid,
        zerolinecolor: PALETTE.grid,
      },
      annotations: [
        {
          x: lastYear,
          y: finalScenario.realTotalInvestments,
          text: ` ${scenarioLabel}`,
          showarrow: false,
          xanchor: "left" as const,
          yanchor: "middle" as const,
          font: { size: 12, color: PALETTE.accent, family: "var(--font-inter), Inter, sans-serif", weight: 600 },
        },
        {
          x: lastYear,
          y: finalBaseline.realTotalInvestments,
          text: " Baseline",
          showarrow: false,
          xanchor: "left" as const,
          yanchor: "middle" as const,
          font: { size: 12, color: PALETTE.baseline, family: "var(--font-inter), Inter, sans-serif" },
        },
      ],
    }),
    [finalScenario, finalBaseline, lastYear, scenarioLabel],
  );

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
