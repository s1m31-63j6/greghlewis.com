"use client";

import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

// Same pattern as src/app/projects/scale-or-sell/PlotlyClient.tsx —
// build the React wrapper on the smaller plotly.js-dist-min bundle.
const Plot = createPlotlyComponent(Plotly);
export default Plot;
