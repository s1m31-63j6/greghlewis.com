// `plotly.js-dist-min` ships the same JS API as the full plotly.js, but
// without its own type declarations. Re-export the typings from plotly.js
// so consumers (PlotlyClient, react-plotly factory) get the same shape.
declare module "plotly.js-dist-min" {
  import Plotly from "plotly.js";
  export = Plotly;
}
