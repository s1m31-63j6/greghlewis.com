"use client";

/**
 * Choose your own: the reader walks one career through the same sankey the
 * crowd made. A run is keyed by (persona, seed), so a persona change or a
 * "Start over" remounts the run with fresh state and a new seed.
 */

import { useState } from "react";

import AdventurePane from "./AdventurePane";
import type { Persona, Track3 } from "./engine/types.ts";
import { fmtDollars, fmtPct } from "./format";
import SankeyBoard from "./SankeyBoard";
import { NODE_LABEL } from "./sankeyLayout";
import { type AdventureView, useAdventure } from "./useAdventure";
import type { Flows, Model } from "./useModel";

const PROJECT = "career-paths";
const BASE_SEED = 20260906;

/** A one-hop finding the flows can state honestly without tracing careers. */
function finding(flows: Flows): string {
  const moved = flows.links["0:startup>3:corporate"];
  if (!moved) return "Most of the ribbons that leave a startup early are gray: the move was not the employee's idea.";
  const share = moved.count / flows.perTrack;
  const forced = Object.values(moved.forced).reduce((t, n) => t + n, 0) / moved.count;
  return `${fmtPct(share)} of careers that start at a startup are in a corporate job by year 3, `
    + `and ${fmtPct(forced)} of those moves were a shutdown, a layoff or an exit rather than a choice.`;
}

function Options({ view, onFirst, onChoose, onContinue }: {
  view: AdventureView;
  onFirst: (t: Track3) => void;
  onChoose: (id: string) => void;
  onContinue: () => void;
}) {
  if (view.status === "done") return null;

  if (view.status === "forced" && view.forced) {
    return (
      <div className="cp-adv-forced">
        <span className="cp-adv-forced-label">{view.forced.label}</span>
        <button type="button" className="cp-btn primary" onClick={onContinue}>Continue</button>
      </div>
    );
  }

  const first = view.status === "start";
  return (
    <div className={`cp-adv-options ${first ? "first" : ""}`} role="group" aria-label={first ? "Choose a first job" : `Choose at year ${view.year}`}>
      {!first && <span className="cp-kicker cp-adv-options-kicker">Year {view.year}: what next?</span>}
      {view.options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="cp-adv-option"
          style={{ "--opt": o.color } as React.CSSProperties}
          onClick={() => (first ? onFirst(o.id as Track3) : onChoose(o.id))}
          data-tel="cp-adv-choice"
          data-tel-project={PROJECT}
          data-choice={o.id}
          data-year={view.year}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Run({ model, persona, seed, active, onReset }: {
  model: Model; persona: Persona; seed: number; active: boolean; onReset: () => void;
}) {
  const [view, act] = useAdventure(model, persona, seed);
  const flows = model.flows[persona];
  const years = [0, ...model.params.milestones];

  return (
    <div className="cp-adv-grid">
      <div className="cp-adv-main">
        <SankeyBoard
          flows={flows}
          years={years}
          view={view}
          active={active}
          overlay={<Options view={view} onFirst={act.pickFirst} onChoose={act.choose} onContinue={act.acknowledge} />}
        />
        {view.status === "done" && view.nodeKey && (
          <div className="cp-adv-end">
            <div className="cp-kicker">Year 35: the end of the run</div>
            <p className="cp-adv-end-line">
              You finish {NODE_LABEL[view.nodeKey].toLowerCase() === "exited" ? "having cashed out" : `in ${NODE_LABEL[view.nodeKey].toLowerCase()}`},
              with <span className="cp-mono">{fmtDollars(view.lifetime)}</span> earned over thirty-five years
              {view.crowdLifetime !== null && (
                <> against a crowd median of <span className="cp-mono">{fmtDollars(view.crowdLifetime)}</span> at the same node</>
              )}.
              {view.forced && <> Along the way: {view.forced.label.toLowerCase()}.</>}
            </p>
            <p className="cp-adv-end-sub">
              The full crowd is now drawn behind your path. Labels are the share of each node that took that ribbon.
            </p>
            <button
              type="button"
              className="cp-btn primary"
              onClick={onReset}
              data-tel="cp-adv-done"
              data-tel-project={PROJECT}
            >
              Start over
            </button>
          </div>
        )}
      </div>
      <AdventurePane view={view} />
    </div>
  );
}

export default function Adventure(props: { model: Model; persona: Persona; onPersona: (p: Persona) => void; active: boolean }) {
  const { model, persona, onPersona, active } = props;
  const [seed, setSeed] = useState(BASE_SEED);
  const reset = () => setSeed((s) => s + 1);

  return (
    <div className="cp-adv">
      <div className="cp-adv-head">
        <div>
          <h2 className="cp-chart-title">{finding(model.flows[persona])}</h2>
          <p className="cp-chart-sub">
            Pick a first job, then decide at each milestone. Between decisions the model rolls the years:
            promotions, layoffs, shutdowns, the odd exit. Gray hatched ribbons are moves the crowd did not choose.
          </p>
        </div>
        <div className="cp-adv-controls">
          <div className="cp-control">
            <span className="cp-kicker">Persona</span>
            <div className="cp-seg" role="group" aria-label="Persona">
              {(["technical", "nontechnical"] as Persona[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`cp-btn ${persona === p ? "active" : ""}`}
                  aria-pressed={persona === p}
                  onClick={() => { if (p !== persona) { onPersona(p); reset(); } }}
                >
                  {p === "technical" ? "Technical" : "Non-technical"}
                </button>
              ))}
            </div>
          </div>
          <div className="cp-control">
            <span className="cp-kicker">Run</span>
            <button type="button" className="cp-btn" onClick={reset}>Start over</button>
          </div>
        </div>
      </div>

      <Run key={`${persona}:${seed}`} model={model} persona={persona} seed={seed} active={active} onReset={reset} />
    </div>
  );
}
