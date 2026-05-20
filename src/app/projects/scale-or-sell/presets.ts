import type { Assumptions } from "./model";

// Shared starting state. Numbers are abstracted from the source engagement —
// a founder-led B2B services firm doubling year over year, weighing a sale
// roughly three years out.
const SHARED_DEFAULTS = {
  startingArr: 25_000_000,
  startingHeadcount: 83,
  saleTargetMonths: 33, // ~Aug 2028 from a late-2025 starting point.
  organicGrowthMonthly: 0.0417, // ≈60% annualized.
  rampMonths: 10,
  ebitdaMargin: 0.20,
  ebitdaMultiple: 5,
  contractorArrCapacity: 150_000,
};

export type PresetId =
  | "sell-now"
  | "organic-glide"
  | "build-to-sell"
  | "aggressive-build"
  | "patient-build";

export type Preset = {
  id: PresetId;
  label: string;
  blurb: string;
  assumptions: Assumptions;
  // Whether this preset turns the restructure dividend on. Drives both the
  // calculator's headline framing and the trajectory chart's line styling.
  withRestructure: boolean;
};

export const PRESETS: Preset[] = [
  {
    id: "sell-now",
    label: "Sell now",
    blurb:
      "Take today's EBITDA and exit at the prevailing multiple. No reinvestment, no waiting.",
    withRestructure: false,
    assumptions: {
      ...SHARED_DEFAULTS,
      saleTargetMonths: 0,
      restructureLift: 0,
    },
  },
  {
    id: "organic-glide",
    label: "Organic glide",
    blurb:
      "Reinvest, but don't change the operating model. Pure compounding at the existing growth rate.",
    withRestructure: false,
    assumptions: {
      ...SHARED_DEFAULTS,
      restructureLift: 0,
    },
  },
  {
    id: "build-to-sell",
    label: "Build to sell",
    blurb:
      "Reinvest in management infrastructure — directors, managers, codified delivery — that lifts the growth rate by roughly a point per month at full ramp.",
    withRestructure: true,
    assumptions: {
      ...SHARED_DEFAULTS,
      restructureLift: 0.013,
    },
  },
  {
    id: "aggressive-build",
    label: "Aggressive build",
    blurb:
      "Same path, with a faster ramp and a stronger lift. The bull case for restructuring — and the case that's hardest to execute.",
    withRestructure: true,
    assumptions: {
      ...SHARED_DEFAULTS,
      restructureLift: 0.020,
      rampMonths: 6,
    },
  },
  {
    id: "patient-build",
    label: "Patient build",
    blurb:
      "Restructure with the same lift, but wait an extra year before selling. Lets the compounding work longer.",
    withRestructure: true,
    assumptions: {
      ...SHARED_DEFAULTS,
      saleTargetMonths: 45,
      restructureLift: 0.013,
    },
  },
];

export function getPreset(id: PresetId): Preset {
  const p = PRESETS.find((p) => p.id === id);
  if (!p) throw new Error(`Unknown preset: ${id}`);
  return p;
}
