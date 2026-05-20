"use client";

import dynamic from "next/dynamic";

// Two-step lazy load. `PlotlyClient` wires the min bundle into the
// react-plotly factory; we dynamic-import the wrapper so neither the
// 3MB+ plotly bundle nor the `window` references it makes at import
// time touch the server-side render path.
const Plot = dynamic(() => import("./PlotlyClient"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 360,
        width: "100%",
        background: "#fbfaf7",
        border: "1px solid #e3dfd6",
      }}
    />
  ),
});

export default Plot;
