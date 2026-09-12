import type { Simulation } from "@/lib/start-sit/simulate";
import type { Verdict } from "@/lib/start-sit/verdict";
import { explain } from "@/lib/start-sit/verdict";
import type { Player, Scoring } from "@/lib/start-sit/types";
import { pct, pts } from "./format";

function names(list: Player[]): string {
  const n = list.map((p) => p.short);
  if (n.length <= 1) return n.join("");
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

export function VerdictBanner({
  selected, verdict, sim, simOrder, scoring,
}: {
  selected: Player[];
  verdict: Verdict;
  sim: Simulation | null;
  /** Player ids in the order the simulation was run. */
  simOrder: string[];
  scoring: Scoring;
}) {
  const byId = new Map(selected.map((p) => [p.id, p]));
  const priced = verdict.ranked.map((r) => byId.get(r.id)!).filter(Boolean);
  const excluded = verdict.excluded.map((id) => byId.get(id)!).filter(Boolean);

  if (selected.length === 0) {
    return <div className="ss-verdict is-empty"><p className="ss-verdict-head">Pick two players to compare.</p></div>;
  }
  if (priced.length === 0) {
    return (
      <div className="ss-verdict is-empty">
        <p className="ss-verdict-head">The market has no line on {names(excluded)} this week.</p>
      </div>
    );
  }

  const best = byId.get(verdict.best!)!;
  const top = verdict.ranked[0];
  if (priced.length === 1) {
    return (
      <div className="ss-verdict">
        <p className="ss-verdict-head">{best.short} projects to {pts(top.mean)} points.</p>
        {excluded.length > 0 && <p className="ss-verdict-note">No line on {names(excluded)}.</p>}
        <p className="ss-verdict-note">Add another player to get a verdict.</p>
      </div>
    );
  }

  const tied = verdict.tied.map((id) => byId.get(id)!);
  const runnerUp = byId.get(verdict.ranked[1].id)!;
  const idx = (id: string) => simOrder.indexOf(id);
  const pWin = sim && idx(best.id) >= 0 && idx(runnerUp.id) >= 0
    ? sim.pWin[idx(best.id)][idx(runnerUp.id)] : null;
  const why = explain(best, runnerUp, scoring);
  const gap = top.mean - verdict.ranked[1].mean;
  // The largest single gap between the two, stated from the side that leads it.
  const edge = why && Math.abs(why.diff) >= 0.5
    ? `${why.diff > 0 ? best.short : runnerUp.short} is ${pts(Math.abs(why.diff))} ahead on ${why.label.replace(/^./, (c) => c.toLowerCase())}`
    : null;

  return (
    <div className={`ss-verdict${tied.length ? " is-tied" : ""}`}>
      {tied.length ? (
        <p className="ss-verdict-head">Too close to call: {names([best, ...tied])}.</p>
      ) : (
        <p className="ss-verdict-head">Start {best.short}.</p>
      )}
      <p className="ss-verdict-why">
        {tied.length > 0 ? (
          <>
            {best.short} projects {pts(gap)} points ahead of {runnerUp.short}, which is inside what
            the lines can resolve{pWin != null && <>; he outscores him in {pct(pWin)} of simulated games</>}.
          </>
        ) : (
          <>
            {best.short} projects {pts(gap)} points ahead of {runnerUp.short}
            {pWin != null && <> and outscores him in {pct(pWin)} of simulated games</>}.
          </>
        )}
        {edge && <> The largest single difference: {edge}.</>}
      </p>
      {verdict.partial && (
        <p className="ss-verdict-note">One of these totals rests on incomplete pricing. Read the cards before trusting the call.</p>
      )}
      {excluded.length > 0 && (
        <p className="ss-verdict-note">No line on {names(excluded)}, so {excluded.length === 1 ? "he is" : "they are"} left out of the verdict.</p>
      )}
    </div>
  );
}
