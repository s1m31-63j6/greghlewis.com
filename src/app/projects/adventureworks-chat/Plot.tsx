"use client";

import dynamic from "next/dynamic";

// Two-step lazy load (mirrors scale-or-sell/Plot.tsx). Keeps the 3MB+
// plotly bundle off the SSR path and out of the initial JS payload.
const Plot = dynamic(() => import("./PlotlyClient"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 380,
        width: "100%",
        background: "#fbfaf7",
        border: "1px solid #e3dfd6",
        borderRadius: 8,
      }}
    />
  ),
});

export default Plot;
