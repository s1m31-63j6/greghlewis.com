import type { Assumptions } from "./model";

// Default macro / personal assumptions shared across presets. The
// scenario presets only override the differentiating fields.
const SHARED_DEFAULTS = {
  retirementAge: 65,
  mbaAge: 40,
  tuition: 55_000,
  tuitionReimbursementRate: 0.5,
  otherCostsPerWeek: 25,
  programWeeks: 40,
  marketReturnRate: 0.095,
  inflationRate: 0.03,
  startingSalary: 150_000,
  startingSavings: 45_000,
  savingsRate: 0.12,
  tithingRate: 0.1,
  incomeTaxRate: 0.27,
  investmentIncomeTaxRate: 0.15,
  whiteCollarGrowthRate: 0.04,
  savingsDiscipline: "constant" as const,
};

export type PresetId =
  | "modest"
  | "median"
  | "strong"
  | "career-pivot"
  | "baseline";

export type Preset = {
  id: PresetId;
  label: string;
  blurb: string;
  assumptions: Assumptions;
};

export const PRESETS: Preset[] = [
  {
    id: "modest",
    label: "Modest payoff",
    blurb: "5% wage growth for three years post-program.",
    assumptions: {
      ...SHARED_DEFAULTS,
      embaWageGrowthRate: 0.05,
      embaWageGrowthYears: 3,
    },
  },
  {
    id: "median",
    label: "Median payoff",
    blurb: "10% wage growth for four years — typical industry average.",
    assumptions: {
      ...SHARED_DEFAULTS,
      embaWageGrowthRate: 0.1,
      embaWageGrowthYears: 4,
    },
  },
  {
    id: "strong",
    label: "Strong payoff",
    blurb: "15% wage growth for five years — top-end realized outcomes.",
    assumptions: {
      ...SHARED_DEFAULTS,
      embaWageGrowthRate: 0.15,
      embaWageGrowthYears: 5,
    },
  },
  {
    id: "career-pivot",
    label: "Career pivot",
    blurb:
      "Mid-30s candidate paying full freight. Same wage trajectory as the median outcome, but no employer subsidy and a longer horizon to retirement.",
    assumptions: {
      ...SHARED_DEFAULTS,
      mbaAge: 35,
      startingSalary: 200_000,
      startingSavings: 150_000,
      savingsRate: 0.07,
      tuitionReimbursementRate: 0.0,
      otherCostsPerWeek: 200,
      embaWageGrowthRate: 0.1,
      embaWageGrowthYears: 5,
    },
  },
  {
    id: "baseline",
    label: "Baseline (no program)",
    blurb:
      "What the same dollars do if you skip the program entirely. The reference line everything else is measured against.",
    assumptions: {
      ...SHARED_DEFAULTS,
      // Zero out program costs so the scenario sim matches the comparison
      // line exactly. Without this, the "baseline" preset's trajectory
      // still subtracted two years of tuition from disposable savings,
      // leaving a small gap between scenario and baseline.
      tuition: 0,
      otherCostsPerWeek: 0,
      embaWageGrowthRate: 0,
      embaWageGrowthYears: 0,
    },
  },
];

export function getPreset(id: PresetId): Preset {
  const p = PRESETS.find((p) => p.id === id);
  if (!p) throw new Error(`Unknown preset: ${id}`);
  return p;
}
