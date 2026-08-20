"use client";

import type { Assumptions, SavingsDiscipline } from "./model";
import { formatDollarsFull, formatPercent } from "./format";

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
    <div className="emba-control" data-tel="emba-adjust">
      <div className="emba-control-label">
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
  const setDiscipline = (d: SavingsDiscipline) =>
    onChange(patch(a, "savingsDiscipline", d));

  return (
    <div className="emba-controls">
      <div className="group">
        <div className="group-title">Program</div>
        <Slider
          label="Tuition"
          value={a.tuition}
          display={formatDollarsFull(a.tuition)}
          min={20_000}
          max={250_000}
          step={1_000}
          onChange={(v) => onChange(patch(a, "tuition", v))}
        />
        <Slider
          label="Employer reimbursement"
          value={a.tuitionReimbursementRate}
          display={formatPercent(a.tuitionReimbursementRate)}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange(patch(a, "tuitionReimbursementRate", v))}
        />
        <Slider
          label="EMBA wage growth (per year)"
          value={a.embaWageGrowthRate}
          display={formatPercent(a.embaWageGrowthRate)}
          min={0}
          max={0.25}
          step={0.005}
          onChange={(v) => onChange(patch(a, "embaWageGrowthRate", v))}
        />
        <Slider
          label="Years of EMBA wage growth"
          value={a.embaWageGrowthYears}
          display={`${a.embaWageGrowthYears} yr`}
          min={0}
          max={10}
          step={1}
          onChange={(v) => onChange(patch(a, "embaWageGrowthYears", v))}
        />
      </div>

      <div className="group">
        <div className="group-title">Personal</div>
        <Slider
          label="Age when starting program"
          value={a.mbaAge}
          display={`${a.mbaAge}`}
          min={28}
          max={55}
          step={1}
          onChange={(v) => onChange(patch(a, "mbaAge", v))}
        />
        <Slider
          label="Starting salary"
          value={a.startingSalary}
          display={formatDollarsFull(a.startingSalary)}
          min={50_000}
          max={500_000}
          step={5_000}
          onChange={(v) => onChange(patch(a, "startingSalary", v))}
        />
        <Slider
          label="Starting investments"
          value={a.startingSavings}
          display={formatDollarsFull(a.startingSavings)}
          min={0}
          max={1_000_000}
          step={5_000}
          onChange={(v) => onChange(patch(a, "startingSavings", v))}
        />
        <Slider
          label="Household savings rate"
          value={a.savingsRate}
          display={formatPercent(a.savingsRate)}
          min={0}
          max={0.4}
          step={0.01}
          onChange={(v) => onChange(patch(a, "savingsRate", v))}
        />
      </div>

      <div className="group">
        <div className="group-title">Market</div>
        <Slider
          label="Annualized market return"
          value={a.marketReturnRate}
          display={formatPercent(a.marketReturnRate, 1)}
          min={0.03}
          max={0.13}
          step={0.005}
          onChange={(v) => onChange(patch(a, "marketReturnRate", v))}
        />
        <Slider
          label="Inflation"
          value={a.inflationRate}
          display={formatPercent(a.inflationRate, 1)}
          min={0}
          max={0.08}
          step={0.005}
          onChange={(v) => onChange(patch(a, "inflationRate", v))}
        />
      </div>

      <div className="group">
        <div className="group-title">Savings discipline</div>
        <div className="emba-control">
          <div className="toggle" role="group" aria-label="Savings discipline">
            <button
              type="button"
              className={a.savingsDiscipline === "constant" ? "active" : ""}
              onClick={() => setDiscipline("constant")}
            >
              Constant rate
            </button>
            <button
              type="button"
              className={a.savingsDiscipline === "marginal" ? "active" : ""}
              onClick={() => setDiscipline("marginal")}
            >
              Save the marginal gain
            </button>
          </div>
          <p className="emba-control-note">
            {a.savingsDiscipline === "constant"
              ? "Household saves a fixed share of income each year — the default in most financial-aid calculators."
              : "Household anchors spending to the no-program baseline and banks 100% of after-tax wage gains beyond it. The compounding effect is large; the assumption is generous."}
          </p>
        </div>
      </div>
    </div>
  );
}
