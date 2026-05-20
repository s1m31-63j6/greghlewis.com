// Monthly cashflow model for a "sell now vs. reinvest" exit-timing decision.
//
// Inspired by an MBA strategy engagement for a founder-led B2B services firm.
// All identifying details about the source company have been stripped — names,
// industry, customer segments, products — and the model has been simplified
// from a sprawling per-role spreadsheet down to its core analytical claim:
// investing in a layer of management infrastructure compounds an extra
// ~1%/month of growth lift on top of organic momentum, and over a multi-year
// build that lift dominates the exit valuation.

export type MonthRow = {
  month: number;             // 0 = "today", increments monthly
  arr: number;               // Annualized revenue at end of month, $
  ebitda: number;            // Annualized EBITDA at end of month, $
  exitValue: number;         // EBITDA × multiple, $
  effectiveLift: number;     // Restructure lift active this month, decimal
  headcount: number;         // Working-team headcount (descriptive only)
};

export type Assumptions = {
  // Starting state
  startingArr: number;            // $25M default
  startingHeadcount: number;      // 83 default
  saleTargetMonths: number;       // Months from today to a strategic sale

  // Growth engine
  organicGrowthMonthly: number;   // Compounding monthly growth absent restructuring
  restructureLift: number;        // Additional monthly growth at full ramp
  rampMonths: number;             // Months from first hire to full lift

  // Financial
  ebitdaMargin: number;           // EBITDA / ARR, held constant
  ebitdaMultiple: number;         // Sale multiple applied to annualized EBITDA

  // Operating (drives the descriptive headcount line)
  contractorArrCapacity: number;  // $ of new ARR each new contractor can support
};

// Ramp curve. By construction t=1 produces ramp = 1/rampMonths, so the first
// month after kickoff already shows a partial lift (matches the spreadsheet,
// where Dec 2025 is already 0.1 of the way up).
export function ramp(t: number, rampMonths: number): number {
  if (rampMonths <= 0) return 1;
  return Math.min(t / rampMonths, 1);
}

export type SimulateOpts = {
  // When false, restructure lift is zeroed out — pure organic glide.
  withRestructure: boolean;
};

export function simulate(a: Assumptions, opts: SimulateOpts): MonthRow[] {
  const rows: MonthRow[] = [];
  // Month 0: starting state, no growth applied yet.
  rows.push({
    month: 0,
    arr: a.startingArr,
    ebitda: a.startingArr * a.ebitdaMargin,
    exitValue: a.startingArr * a.ebitdaMargin * a.ebitdaMultiple,
    effectiveLift: 0,
    headcount: a.startingHeadcount,
  });

  for (let t = 1; t <= a.saleTargetMonths; t++) {
    const lift = opts.withRestructure
      ? a.restructureLift * ramp(t, a.rampMonths)
      : 0;
    const prev = rows[t - 1].arr;
    const arr = prev * (1 + a.organicGrowthMonthly + lift);
    const ebitda = arr * a.ebitdaMargin;
    const exitValue = ebitda * a.ebitdaMultiple;
    const headcount =
      a.startingHeadcount + (arr - a.startingArr) / a.contractorArrCapacity;
    rows.push({ month: t, arr, ebitda, exitValue, effectiveLift: lift, headcount });
  }
  return rows;
}

// "Sell now" path: a flat horizontal line at today's exit value, plotted
// against time so the three paths share an x-axis.
export function sellNowPath(a: Assumptions): MonthRow[] {
  const today = a.startingArr * a.ebitdaMargin * a.ebitdaMultiple;
  const rows: MonthRow[] = [];
  for (let t = 0; t <= a.saleTargetMonths; t++) {
    rows.push({
      month: t,
      arr: a.startingArr,
      ebitda: a.startingArr * a.ebitdaMargin,
      exitValue: today,
      effectiveLift: 0,
      headcount: a.startingHeadcount,
    });
  }
  return rows;
}

// Headline metrics at the sale-target month.
export function metricsAtSale(rows: MonthRow[]): {
  arr: number;
  ebitda: number;
  exitValue: number;
  headcount: number;
} {
  const last = rows[rows.length - 1];
  return {
    arr: last.arr,
    ebitda: last.ebitda,
    exitValue: last.exitValue,
    headcount: last.headcount,
  };
}

export type ScenarioId = "sell-now" | "organic-glide" | "build-to-sell";

// Delta of "build to sell" exit value vs. the chosen baseline. Drives the
// editorial framing — the spread between paths is what the analysis is for.
export function deltaVsBaseline(
  a: Assumptions,
  baseline: ScenarioId,
): { build: number; baseline: number; delta: number } {
  const buildRows = simulate(a, { withRestructure: true });
  const build = metricsAtSale(buildRows).exitValue;

  let baselineValue: number;
  if (baseline === "sell-now") {
    baselineValue = a.startingArr * a.ebitdaMargin * a.ebitdaMultiple;
  } else if (baseline === "organic-glide") {
    const rows = simulate(a, { withRestructure: false });
    baselineValue = metricsAtSale(rows).exitValue;
  } else {
    baselineValue = build;
  }

  return { build, baseline: baselineValue, delta: build - baselineValue };
}

// Sweep helper for the sensitivity heatmap. Holds all assumptions fixed
// except (sale-target months, restructure lift) and returns the Δ vs.
// the sell-now baseline at each cell.
export function sensitivitySweep(
  base: Assumptions,
  saleMonthsList: number[],
  liftRates: number[],
): { saleMonths: number[]; liftRates: number[]; deltaValue: number[][] } {
  const sellNowValue = base.startingArr * base.ebitdaMargin * base.ebitdaMultiple;
  const deltaValue: number[][] = saleMonthsList.map((m) =>
    liftRates.map((r) => {
      const a: Assumptions = {
        ...base,
        saleTargetMonths: m,
        restructureLift: r,
      };
      const rows = simulate(a, { withRestructure: true });
      return metricsAtSale(rows).exitValue - sellNowValue;
    }),
  );
  return { saleMonths: saleMonthsList, liftRates, deltaValue };
}
