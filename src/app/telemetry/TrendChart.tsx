"use client";

import dynamic from "next/dynamic";
import type { VisualizationSpec } from "vega-embed";
import type { DailyRow } from "@/lib/telemetry/query";

// vega touches `document` at module scope, so it can't be server-rendered.
const VegaLite = dynamic(() => import("react-vega").then((m) => m.VegaLite), {
  ssr: false,
  loading: () => <div className="h-[180px]" />,
});

const NAVY = "#1B4F7A";

export function TrendChart({ data }: { data: DailyRow[] }) {
  const spec: VisualizationSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: 180,
    data: { values: data },
    encoding: {
      x: {
        field: "day",
        type: "temporal",
        axis: { title: null, format: "%b %d", grid: false, tickCount: 6, labelFontSize: 10 },
      },
    },
    layer: [
      {
        mark: { type: "bar", color: "#D6E2EC", size: 6 },
        encoding: {
          y: {
            field: "pageviews",
            type: "quantitative",
            axis: {
              title: null,
              grid: true,
              gridColor: "#EEE",
              tickCount: 4,
              labelFontSize: 10,
              // Counts are integers — without this an all-zero domain
              // renders as "0.000000".
              format: "d",
              tickMinStep: 1,
            },
          },
        },
      },
      {
        mark: { type: "line", color: NAVY, strokeWidth: 2, point: { filled: true, size: 28 } },
        encoding: { y: { field: "visitors", type: "quantitative" } },
      },
      {
        // Invisible full-height bars give the tooltip a generous hit area.
        mark: { type: "bar", opacity: 0, size: 14 },
        encoding: {
          y: { field: "pageviews", type: "quantitative" },
          tooltip: [
            { field: "day", type: "temporal", title: "Date", format: "%b %d, %Y" },
            { field: "visitors", type: "quantitative", title: "Visitors" },
            { field: "pageviews", type: "quantitative", title: "Pageviews" },
          ],
        },
      },
    ],
    config: { view: { stroke: null }, axis: { domainColor: "#DDD", tickColor: "#DDD" } },
  };

  return (
    <div className="w-full">
      <VegaLite spec={spec} actions={false} className="w-full" />
    </div>
  );
}
