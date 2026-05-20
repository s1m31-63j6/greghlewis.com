"use client";

import { useMemo } from "react";
import type { MonthRow } from "./model";
import Plot from "./Plot";

type Props = {
  buildRows: MonthRow[];
  organicRows: MonthRow[];
  sellNowValue: number;
  saleTargetMonths: number;
  withRestructure: boolean;
};

const PALETTE = {
  paper: "#fbfaf7",
  ink: "#171717",
  inkQuiet: "#6b6b6b",
  inkMeta: "#999999",
  grid: "#e3dfd6",
  build: "#1B4F7A",     // Navy — the restructure path.
  organic: "#7BA8CB",   // Pale blue — the no-restructure compounding path.
  sellNow: "#9b2424",   // Muted brick — the "take it now" benchmark.
};

export function TrajectoryChart({
  buildRows,
  organicRows,
  sellNowValue,
  saleTargetMonths,
  withRestructure,
}: Props) {
  const data = useMemo(() => {
    const months = buildRows.map((r) => r.month);
    const sellNow = months.map(() => sellNowValue);

    const traces = [
      {
        x: months,
        y: sellNow,
        name: "Sell now",
        type: "scatter" as const,
        mode: "lines" as const,
        line: { color: PALETTE.sellNow, width: 2, dash: "dot" as const },
        hovertemplate:
          "<b>Sell now</b><br>Month %{x}: $%{y:,.0f}<extra></extra>",
      },
      {
        x: months,
        y: organicRows.map((r) => r.exitValue),
        name: "Organic glide",
        type: "scatter" as const,
        mode: "lines" as const,
        line: {
          color: PALETTE.organic,
          width: 2,
          dash: withRestructure ? ("dash" as const) : undefined,
        },
        hovertemplate:
          "<b>Organic glide</b><br>Month %{x}: $%{y:,.0f}<extra></extra>",
      },
    ];

    if (withRestructure) {
      traces.push({
        x: months,
        y: buildRows.map((r) => r.exitValue),
        name: "Build to sell",
        type: "scatter" as const,
        mode: "lines" as const,
        line: { color: PALETTE.build, width: 2.5, dash: undefined },
        hovertemplate:
          "<b>Build to sell</b><br>Month %{x}: $%{y:,.0f}<extra></extra>",
      });
    }

    return traces;
  }, [buildRows, organicRows, sellNowValue, withRestructure]);

  const lastMonth = saleTargetMonths;
  const buildFinal = buildRows[buildRows.length - 1].exitValue;
  const organicFinal = organicRows[organicRows.length - 1].exitValue;

  const layout = useMemo(
    () => ({
      autosize: true,
      height: 380,
      margin: { l: 60, r: 130, t: 16, b: 44 },
      paper_bgcolor: PALETTE.paper,
      plot_bgcolor: PALETTE.paper,
      font: {
        family: "var(--font-inter), Inter, sans-serif",
        size: 13,
        color: PALETTE.ink,
      },
      showlegend: false,
      xaxis: {
        title: {
          text: "Months from today",
          font: { size: 12, color: PALETTE.inkQuiet },
        },
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
        ...(withRestructure
          ? [
              {
                x: lastMonth,
                y: buildFinal,
                text: " Build to sell",
                showarrow: false,
                xanchor: "left" as const,
                yanchor: "middle" as const,
                font: {
                  size: 12,
                  color: PALETTE.build,
                  family: "var(--font-inter), Inter, sans-serif",
                  weight: 600,
                },
              },
            ]
          : []),
        {
          x: lastMonth,
          y: organicFinal,
          text: " Organic glide",
          showarrow: false,
          xanchor: "left" as const,
          yanchor: "middle" as const,
          font: {
            size: 12,
            color: PALETTE.organic,
            family: "var(--font-inter), Inter, sans-serif",
            weight: withRestructure ? 400 : 600,
          },
        },
        {
          x: lastMonth,
          y: sellNowValue,
          text: " Sell now",
          showarrow: false,
          xanchor: "left" as const,
          yanchor: "middle" as const,
          font: {
            size: 12,
            color: PALETTE.sellNow,
            family: "var(--font-inter), Inter, sans-serif",
          },
        },
      ],
    }),
    [lastMonth, buildFinal, organicFinal, sellNowValue, withRestructure],
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
