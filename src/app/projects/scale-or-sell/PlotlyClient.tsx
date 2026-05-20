"use client";

import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

// react-plotly.js defaults to the full plotly.js build; the factory lets us
// swap in the smaller `plotly.js-dist-min` distribution. Everything below
// is just the standard react-plotly component.
const Plot = createPlotlyComponent(Plotly);
export default Plot;
