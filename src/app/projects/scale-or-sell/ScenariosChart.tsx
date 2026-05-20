"use client";

import { useMemo } from "react";
import { PRESETS } from "./presets";
import { simulate, sellNowPath } from "./model";
import Plot from "./Plot";

const PALETTE = {
  paper: "#fbfaf7",
  ink: "#171717",
  inkQuiet: "#6b6b6b",
  grid: "#e3dfd6",
  sellNow: "#9b2424",
  organicGlide: "#7BA8CB",
  buildToSell: "#1B4F7A",
  aggressive: "#2c7a5c",
  patient: "#b3892c",
};

const COLOR_BY_PRESET: Record<string, string> = {
  "sell-now": PALETTE.sellNow,
  "organic-glide": PALETTE.organicGlide,
  "build-to-sell": PALETTE.buildToSell,
  "aggressive-build": PALETTE.aggressive,
  "patient-build": PALETTE.patient,
};

export function ScenariosChart() {
  const traces = useMemo(() => {
    // Plot every preset on a common 60-month axis so the visual comparison is
    // honest about the time cost of "patient" strategies.
    const horizonMonths = Math.max(
      ...PRESETS.map((p) => p.assumptions.saleTargetMonths),
    );
    return PRESETS.map((preset) => {
      const a = { ...preset.assumptions, saleTargetMonths: horizonMonths };
      const rows =
        preset.id === "sell-now"
          ? sellNowPath(a)
          : simulate(a, { withRestructure: preset.withRestructure });
      const exitVisible = rows.map((r, i) =>
        i <= preset.assumptions.saleTargetMonths ? r.exitValue : null,
      );
      const color = COLOR_BY_PRESET[preset.id];
      return {
        x: rows.map((r) => r.month),
        y: exitVisible,
        name: preset.label,
        type: "scatter" as const,
        mode: "lines" as const,
        line: {
          color,
          width: preset.id === "build-to-sell" ? 2.8 : 2,
          dash:
            preset.id === "sell-now"
              ? ("dot" as const)
              : preset.id === "organic-glide"
                ? ("dash" as const)
                : undefined,
        },
        connectgaps: false,
        hovertemplate: `<b>${preset.label}</b><br>Month %{x}: $%{y:,.0f}<extra></extra>`,
      };
    });
  }, []);

  const annotations = useMemo(
    () =>
      traces.map((t) => {
        // Anchor each label to the last non-null point so a preset that sells
        // earlier doesn't sit floating to the right of a longer line.
        let lastIdx = t.y.length - 1;
        while (lastIdx > 0 && t.y[lastIdx] === null) lastIdx--;
        return {
          x: t.x[lastIdx],
          y: t.y[lastIdx] as number,
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
        };
      }),
    [traces],
  );

  const layout = {
    autosize: true,
    height: 480,
    margin: { l: 70, r: 160, t: 16, b: 48 },
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
