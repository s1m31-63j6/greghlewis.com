"use client";

import type { Assumptions } from "./model";
import {
  formatDollarsFull,
  formatMonths,
  formatMultiple,
  formatPercent,
  formatPercentMonthly,
} from "./format";

type Props = {
  assumptions: Assumptions;
  onChange: (next: Assumptions) => void;
};

function patch<K extends keyof Assumptions>(
  a: Assumptions,
  key: K,
  value: Assumptions[K],
): Assumptions {
  return { ...a, [key]: value };
}

type SliderProps = {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
};

function Slider({ label, value, display, min, max, step, onChange }: SliderProps) {
  return (
    <div className="exit-control">
      <div className="exit-control-label">
        <span>{label}</span>
        <span className="val">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function AssumptionControls({ assumptions: a, onChange }: Props) {
  return (
    <div className="exit-controls">
      <div className="group">
        <div className="group-title">Decision</div>
        <Slider
          label="Months until sale"
          value={a.saleTargetMonths}
          display={formatMonths(a.saleTargetMonths)}
          min={0}
          max={60}
          step={1}
          onChange={(v) => onChange(patch(a, "saleTargetMonths", v))}
        />
        <Slider
          label="Restructure lift (at full ramp)"
          value={a.restructureLift}
          display={formatPercentMonthly(a.restructureLift, 2)}
          min={0}
          max={0.025}
          step={0.0005}
          onChange={(v) => onChange(patch(a, "restructureLift", v))}
        />
        <Slider
          label="Months to fully ramp"
          value={a.rampMonths}
          display={`${a.rampMonths} mo`}
          min={1}
          max={24}
          step={1}
          onChange={(v) => onChange(patch(a, "rampMonths", v))}
        />
      </div>

      <div className="group">
        <div className="group-title">Starting state</div>
        <Slider
          label="Starting ARR"
          value={a.startingArr}
          display={formatDollarsFull(a.startingArr)}
          min={5_000_000}
          max={100_000_000}
          step={1_000_000}
          onChange={(v) => onChange(patch(a, "startingArr", v))}
        />
        <Slider
          label="Working-team headcount"
          value={a.startingHeadcount}
          display={`${a.startingHeadcount}`}
          min={20}
          max={300}
          step={1}
          onChange={(v) => onChange(patch(a, "startingHeadcount", v))}
        />
        <Slider
          label="Organic growth"
          value={a.organicGrowthMonthly}
          display={formatPercentMonthly(a.organicGrowthMonthly, 2)}
          min={0}
          max={0.08}
          step={0.0025}
          onChange={(v) => onChange(patch(a, "organicGrowthMonthly", v))}
        />
      </div>

      <div className="group">
        <div className="group-title">Valuation</div>
        <Slider
          label="EBITDA margin"
          value={a.ebitdaMargin}
          display={formatPercent(a.ebitdaMargin, 0)}
          min={0.05}
          max={0.5}
          step={0.01}
          onChange={(v) => onChange(patch(a, "ebitdaMargin", v))}
        />
        <Slider
          label="EBITDA multiple at sale"
          value={a.ebitdaMultiple}
          display={formatMultiple(a.ebitdaMultiple)}
          min={2}
          max={12}
          step={0.5}
          onChange={(v) => onChange(patch(a, "ebitdaMultiple", v))}
        />
      </div>
    </div>
  );
}
