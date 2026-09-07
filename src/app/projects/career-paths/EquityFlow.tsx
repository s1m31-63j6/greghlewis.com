"use client";

/**
 * One exit dollar, followed to the employee's pocket. A hand-rolled
 * horizontal sankey: five columns, ribbons whose width tracks log10 of
 * the dollars so a $100M exit and a $60K cheque fit in one picture.
 * The arithmetic mirrors engine.ts: preferred takes min(stack, exit),
 * the grant is a slice of what is left, diluted (1-d)^rounds, times the
 * vested fraction, less strikeFrac as the exercise cost.
 */

import { useId, useState } from "react";

import type { Stage } from "./engine/types.ts";
import { fmtDollars } from "./format";
import type { Model } from "./useModel";

type FlowStage = Extract<Stage, "seed" | "seriesAB" | "growth">;

interface StageSeed { prefStack: number; grantPct: number; dilutionPerRound: number; strikeFrac: number }

// Same values as public/career-paths/params.json, for the moment before it loads.
const FALLBACK: Record<FlowStage, StageSeed> = {
  seed: { prefStack: 6_000_000, grantPct: 0.002, dilutionPerRound: 0.22, strikeFrac: 0.2 },
  seriesAB: { prefStack: 60_000_000, grantPct: 0.0005, dilutionPerRound: 0.18, strikeFrac: 0.3 },
  growth: { prefStack: 200_000_000, grantPct: 0.00006, dilutionPerRound: 0.12, strikeFrac: 0.3 },
};

const STAGE_OPTS: { id: FlowStage; label: string; whose: string }[] = [
  { id: "seed", label: "Seed", whose: "a seed hire's" },
  { id: "seriesAB", label: "Series A-B", whose: "a Series A-B hire's" },
  { id: "growth", label: "Growth", whose: "a growth-stage hire's" },
];
const EXIT_OPTS = [50e6, 100e6, 500e6, 1e9];
const TENURE_OPTS = [1, 2, 4];
const ROUNDS_SINCE_HIRE = 2;
const VEST_YEARS = 4;
const CLIFF_YEARS = 1;

function seedFor(model: Model | null, stage: FlowStage): StageSeed {
  if (!model) return FALLBACK[stage];
  const p = model.params.startup[stage];
  return { prefStack: p.prefStack, grantPct: p.grantPctFD.technical, dilutionPerRound: p.dilutionPerRound, strikeFrac: p.strikeFrac };
}

function compute(seed: StageSeed, exit: number, years: number) {
  const pref = Math.min(seed.prefStack, exit);
  const left = exit - pref;
  const grant = left * seed.grantPct;
  const kept = grant * (1 - seed.dilutionPerRound) ** ROUNDS_SINCE_HIRE;
  const vestFrac = years < CLIFF_YEARS ? 0 : Math.min(years / VEST_YEARS, 1);
  const vested = kept * vestFrac;
  const strike = vested * seed.strikeFrac;
  return {
    exit, pref, left, others: left - grant, grant, dilution: grant - kept,
    vested, unvested: kept - vested, strike, cash: vested - strike,
  };
}
type Dollars = ReturnType<typeof compute>;

function fmtGrant(p: number): string {
  const s = p * 100;
  return `${s.toFixed(s >= 0.1 ? 1 : s >= 0.01 ? 2 : 3)}%`;
}

// ── Geometry ─────────────────────────────────────────────────────────

type Tone = "flow" | "take" | "cash" | "other";
interface NodeSpec { id: keyof Dollars; col: number; name: string; sub?: string; tone: Tone }
interface LinkSpec { s: keyof Dollars; t: keyof Dollars; tone: Tone }

const NODES: NodeSpec[] = [
  { id: "exit", col: 0, name: "Exit value", tone: "flow" },
  { id: "pref", col: 1, name: "Preference stack", sub: "investors first", tone: "take" },
  { id: "left", col: 1, name: "Left for all", sub: "shareholders", tone: "flow" },
  { id: "others", col: 2, name: "Everyone else", tone: "other" },
  { id: "grant", col: 2, name: "Your grant", sub: "at hire", tone: "flow" },
  { id: "dilution", col: 3, name: "Dilution", sub: "since hire", tone: "take" },
  { id: "vested", col: 3, name: "Vested share", tone: "flow" },
  { id: "unvested", col: 3, name: "Unvested", sub: "forfeited", tone: "take" },
  { id: "strike", col: 4, name: "Exercise cost", sub: "the strike", tone: "take" },
  { id: "cash", col: 4, name: "Cash to you", sub: "pre-tax", tone: "cash" },
];

// Declared top to bottom per source, which is also top to bottom per column,
// so out-ports and in-ports stack without crossings.
const LINKS: LinkSpec[] = [
  { s: "exit", t: "pref", tone: "take" },
  { s: "exit", t: "left", tone: "flow" },
  { s: "left", t: "others", tone: "other" },
  { s: "left", t: "grant", tone: "flow" },
  { s: "grant", t: "dilution", tone: "take" },
  { s: "grant", t: "vested", tone: "flow" },
  { s: "grant", t: "unvested", tone: "take" },
  { s: "vested", t: "strike", tone: "take" },
  { s: "vested", t: "cash", tone: "cash" },
];

const W = 840, H = 260;
const COL_X = [30, 192, 354, 516, 678];
const NODE_W = 12;
const GAP = 40;

// Ribbon width: log10 of dollars, $1K -> hairline, $2B -> full.
const LO = 3, HI = 9.3, MAX_RIBBON = 84, MIN_RIBBON = 2.5;
function ribbon(d: number): number {
  if (d <= 0) return 0;
  const t = Math.min(1, Math.max(0, (Math.log10(d) - LO) / (HI - LO)));
  return MIN_RIBBON + (MAX_RIBBON - MIN_RIBBON) * t;
}

function layout(v: Dollars) {
  const inSum: Partial<Record<keyof Dollars, number>> = {};
  const outSum: Partial<Record<keyof Dollars, number>> = {};
  for (const l of LINKS) {
    const w = ribbon(v[l.t]);
    outSum[l.s] = (outSum[l.s] ?? 0) + w;
    inSum[l.t] = (inSum[l.t] ?? 0) + w;
  }
  const height = (id: keyof Dollars) => Math.max(inSum[id] ?? 0, outSum[id] ?? 0);

  const pos = new Map<keyof Dollars, { x: number; y: number; h: number }>();
  for (let c = 0; c < COL_X.length; c++) {
    const col = NODES.filter((n) => n.col === c);
    const total = col.reduce((a, n) => a + height(n.id), 0) + GAP * (col.length - 1);
    let y = (H - total) / 2;
    for (const n of col) {
      pos.set(n.id, { x: COL_X[c], y, h: height(n.id) });
      y += height(n.id) + GAP;
    }
  }

  const outOff: Partial<Record<keyof Dollars, number>> = {};
  const ribbons = LINKS.map((l) => {
    const w = ribbon(v[l.t]);
    const s = pos.get(l.s)!;
    const t = pos.get(l.t)!;
    const y1 = s.y + (outOff[l.s] ?? 0) + w / 2;
    outOff[l.s] = (outOff[l.s] ?? 0) + w;
    const y2 = t.y + w / 2;
    const x1 = s.x + NODE_W, x2 = t.x, xm = (x1 + x2) / 2;
    return { key: `${l.s}-${l.t}`, tone: l.tone, w, d: `M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2}` };
  });

  return { pos, ribbons };
}

// ── Components ───────────────────────────────────────────────────────

function Seg<T extends string | number>({ label, options, value, onChange, render }: {
  label: string; options: T[]; value: T; onChange: (v: T) => void; render: (v: T) => string;
}) {
  return (
    <div className="cp-control">
      <span className="cp-kicker">{label}</span>
      <div className="cp-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o)} type="button" className={`cp-btn ${o === value ? "active" : ""}`}
            aria-pressed={o === value} onClick={() => onChange(o)}
          >
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Flow({ id, model }: { id: string; model: Model | null }) {
  const [stage, setStage] = useState<FlowStage>("seed");
  const [exit, setExit] = useState(100e6);
  const [years, setYears] = useState(4);

  const seed = seedFor(model, stage);
  const v = compute(seed, exit, years);
  const { pos, ribbons } = layout(v);
  const whose = STAGE_OPTS.find((s) => s.id === stage)!.whose;
  const grant = fmtGrant(seed.grantPct);

  const caption = v.left <= 0
    ? `At a ${fmtDollars(exit)} exit the ${fmtDollars(seed.prefStack)} preference stack takes everything, and ${whose} ${grant} grant is worth $0.`
    : `At a ${fmtDollars(exit)} exit, ${whose} ${grant} grant becomes ${fmtDollars(v.cash)} after the stack, dilution, vesting and the strike.`;

  return (
    <div className="cp-eqflow-card cp-brief-wide" id={id}>
      <div className="cp-eqflow-controls">
        <Seg label="Stage at hire" options={STAGE_OPTS.map((s) => s.id)} value={stage} onChange={setStage}
          render={(s) => STAGE_OPTS.find((o) => o.id === s)!.label} />
        <Seg label="Exit value" options={EXIT_OPTS} value={exit} onChange={setExit} render={fmtDollars} />
        <Seg label="Years in at exit" options={TENURE_OPTS} value={years} onChange={setYears} render={String} />
      </div>

      <div className="cp-eqflow-scroll">
        <svg className="cp-eqflow-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption}>
          {ribbons.map((r) => (
            r.w > 0 && <path key={r.key} d={r.d} className={`ribbon ${r.tone}`} strokeWidth={r.w} fill="none" />
          ))}
          {NODES.map((n) => {
            const p = pos.get(n.id)!;
            const yc = p.y + p.h / 2;
            const tx = p.x + NODE_W + 8;
            return (
              <g key={n.id}>
                {p.h > 0 && <rect x={p.x} y={p.y} width={NODE_W} height={p.h} rx={2} className={`node ${n.tone}`} />}
                <text x={tx} y={yc - (n.sub ? 9 : 3)} className="name">{n.name}</text>
                {n.sub && <text x={tx} y={yc + 3} className="sub">{n.sub}</text>}
                <text x={tx} y={yc + (n.sub ? 16 : 11)} className="value">{fmtDollars(v[n.id])}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="cp-eqflow-caption">{caption}</p>
      <p className="cp-eqflow-fine">
        Simplified: preferred is non-participating and never converts, two rounds of dilution land between hire and
        exit, the grant is the new-grad technical median for the stage, and the strike is the engine&apos;s
        {" "}{Math.round(seed.strikeFrac * 100)}% of exit value per share. Four-year vest, one-year cliff. Tax not shown.
      </p>
    </div>
  );
}

export default function EquityFlow({ model }: { model: Model | null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // The button sits in the reading column; the card is a sibling marked
  // .cp-brief-wide so it can grow to the container width.
  return (
    <>
      <div className="cp-eqflow">
        <button
          type="button" className="cp-btn" aria-expanded={open} aria-controls={panelId}
          onClick={() => setOpen((o) => !o)} data-tel="cp-equity-flow" data-tel-project="career-paths"
        >
          {open ? "Hide the exit walk-through" : "Show how a $100M exit reaches a 0.2% holder"}
        </button>
      </div>
      {open && <Flow id={panelId} model={model} />}
    </>
  );
}
