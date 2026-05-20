// Real-terms cashflow model for an Executive MBA decision.
//
// All projections are year-by-year in real (year-0) dollars. The headline
// NPV reported on the site is the retirement-year real-terms investment
// balance: "what your nest egg is worth, today, after sweeping the program
// cost, lost wages, and post-program salary growth through a market-return
// engine." Δ vs. the baseline (no-program) scenario is the comparison
// number that actually drives the editorial story.

export type SavingsDiscipline = "constant" | "marginal";

export type Assumptions = {
  retirementAge: number;
  mbaAge: number;
  // Program
  tuition: number;
  tuitionReimbursementRate: number; // 0..1
  otherCostsPerWeek: number;
  programWeeks: number; // total across the program, not per year
  // Market / macro
  marketReturnRate: number;
  inflationRate: number;
  // Personal
  startingSalary: number;
  startingSavings: number;
  savingsRate: number;
  tithingRate: number;
  incomeTaxRate: number;
  investmentIncomeTaxRate: number;
  whiteCollarGrowthRate: number;
  embaWageGrowthRate: number;
  embaWageGrowthYears: number;
  // Modeling choice
  savingsDiscipline: SavingsDiscipline;
};

export type YearRow = {
  year: number;
  nominalSalary: number;
  programCost: number; // nominal
  realWages: number;
  deltaRealWages: number;
  realInvestmentCapital: number;
  realInvestmentIncome: number;
  realTotalInvestments: number;
};

function nominalSalaryAt(year: number, a: Assumptions): number {
  // Year 1 = starting salary; growth applies between years.
  // For year n>=2: by then n-1 growth events have happened.
  let salary = a.startingSalary;
  for (let n = 2; n <= year; n++) {
    const growthEventsApplied = n - 1;
    if (growthEventsApplied <= a.embaWageGrowthYears) {
      salary *= 1 + a.embaWageGrowthRate;
    } else {
      salary *= 1 + a.whiteCollarGrowthRate;
    }
  }
  return salary;
}

function baselineNominalSalaryAt(year: number, a: Assumptions): number {
  // The no-program counterfactual: same starting salary, only white-collar
  // growth, no program costs. Used for the marginal-savings mode and for
  // the "baseline" scenario card.
  return a.startingSalary * Math.pow(1 + a.whiteCollarGrowthRate, year - 1);
}

export type SimulateOpts = {
  // If true, no program costs and no EMBA wage growth (pure baseline).
  baseline?: boolean;
};

export function simulate(a: Assumptions, opts: SimulateOpts = {}): YearRow[] {
  const totalYears = a.retirementAge - a.mbaAge;
  const programCostTotal =
    a.tuition * (1 - a.tuitionReimbursementRate) +
    a.otherCostsPerWeek * a.programWeeks;
  const programCostPerYear = programCostTotal / 2;

  const afterTitheAndTax = (1 - a.tithingRate) * (1 - a.incomeTaxRate);

  const rows: YearRow[] = [];
  let prevBalance = a.startingSavings;
  let prevRealWages = a.startingSalary;

  for (let year = 1; year <= totalYears; year++) {
    const inflationDeflator = Math.pow(1 + a.inflationRate, year - 1);
    const nominalSalary = opts.baseline
      ? baselineNominalSalaryAt(year, a)
      : nominalSalaryAt(year, a);
    const realWages = nominalSalary / inflationDeflator;

    const programCostNominal =
      !opts.baseline && year <= 2 ? programCostPerYear : 0;
    const realProgramCost = programCostNominal / inflationDeflator;

    // Savings into investments (real)
    let savings: number;
    if (a.savingsDiscipline === "constant" || opts.baseline) {
      savings = realWages * afterTitheAndTax * a.savingsRate;
    } else {
      // Marginal discipline: anchor spending to the no-program trajectory.
      // Keep the baseline savings amount; bank 100% of after-tithe/tax wage
      // gain on top of that. When wages dip below baseline, fall back to
      // proportional savings (don't blow up the model with deep drawdowns).
      const baselineRealWages =
        baselineNominalSalaryAt(year, a) / inflationDeflator;
      const baselineSavings =
        baselineRealWages * afterTitheAndTax * a.savingsRate;
      if (realWages >= baselineRealWages) {
        const marginal = (realWages - baselineRealWages) * afterTitheAndTax;
        savings = baselineSavings + marginal;
      } else {
        savings = realWages * afterTitheAndTax * a.savingsRate;
      }
    }

    const realInvestmentCapital = savings - realProgramCost;

    // Investment income on prior-year balance, after investment tax.
    const realInvestmentIncome =
      prevBalance *
      a.marketReturnRate *
      (1 - a.investmentIncomeTaxRate);

    // Year 1 special case to match the source spreadsheet: investment
    // income is the projection earned on the starting balance through
    // the year, but isn't compounded into the principal until year 2.
    const realTotalInvestments =
      year === 1
        ? prevBalance + realInvestmentCapital
        : prevBalance + realInvestmentCapital + realInvestmentIncome;

    rows.push({
      year,
      nominalSalary,
      programCost: programCostNominal,
      realWages,
      deltaRealWages: year === 1 ? 0 : realWages - prevRealWages,
      realInvestmentCapital,
      realInvestmentIncome,
      realTotalInvestments,
    });

    prevBalance = realTotalInvestments;
    prevRealWages = realWages;
  }

  return rows;
}

// Headline metric: retirement-year real-terms nest egg.
export function npv(rows: YearRow[]): number {
  return rows[rows.length - 1].realTotalInvestments;
}

// Comparison metric: Δ vs the baseline (no-program) trajectory under the
// same personal/market assumptions. This is what makes the EMBA decision
// legible — absolute nest-egg values are dominated by market returns.
export function deltaVsBaseline(a: Assumptions): {
  scenarioRows: YearRow[];
  baselineRows: YearRow[];
  deltaNpv: number;
} {
  const scenarioRows = simulate(a);
  const baselineRows = simulate(a, { baseline: true });
  return {
    scenarioRows,
    baselineRows,
    deltaNpv: npv(scenarioRows) - npv(baselineRows),
  };
}

// Sweep helper for the sensitivity heatmap. Holds all assumptions fixed
// except (wage growth rate, growth duration) and returns Δ NPV at each
// (rate, years) cell.
export function sensitivitySweep(
  base: Assumptions,
  rates: number[],
  years: number[],
): { rates: number[]; years: number[]; deltaNpv: number[][] } {
  const baselineNpv = npv(simulate(base, { baseline: true }));
  const deltaNpv: number[][] = years.map((y) =>
    rates.map((r) => {
      const a: Assumptions = {
        ...base,
        embaWageGrowthRate: r,
        embaWageGrowthYears: y,
      };
      return npv(simulate(a)) - baselineNpv;
    }),
  );
  return { rates, years, deltaNpv };
}
