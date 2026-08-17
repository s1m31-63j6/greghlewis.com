"use client";

/**
 * The post-game grade.
 *
 * Every call you made, what the engine would have done, and how much win
 * probability the difference was worth. Calls inside the search's noise are
 * marked as toss-ups and contribute nothing to the total, because claiming a
 * player gave away half a point when the error bar is a full point would be
 * making something up.
 */

import { grade, tally, totalLoss, VERDICT_STYLE, type Graded } from "./grade";
import type { Decision } from "./useDrill";
import BranchDiagram from "./BranchDiagram";
import WinProbTrack from "./WinProbTrack";
import { narrate, ACTION_LABEL } from "./narrate";
import type { RealPlay } from "./scenarios";
import { formatClock } from "./scenarios";
import { TeamLogo, type TeamMap, teamOf } from "./teams";

interface Props {
  decisions: Decision[];
  sequence: RealPlay[] | null;
  userTeam: string;
  opponent: string;
  teams: TeamMap;
  won: number; // 1, 0 or 0.5
  onReplay: () => void;
  onPick: () => void;
}

export default function GameReview({
  decisions, sequence, userTeam, opponent, teams, won, onReplay, onPick,
}: Props) {
  const grades: Graded[] = decisions.map((d) => grade(d.evals, d.action));
  const counts = tally(grades);
  const lost = totalLoss(grades);
  const worstIdx = grades.reduce(
    (best, g, i) => (g.verdict !== "toss" && g.loss > (grades[best]?.loss ?? -1) ? i : best),
    0,
  );

  const winner = won === 1 ? userTeam : won === 0 ? opponent : null;
  const result =
    won === 1
      ? `The ${teamOf(teams, userTeam).nick || userTeam} won.`
      : won === 0
        ? `The ${teamOf(teams, opponent).nick || opponent} won.`
        : "It went to overtime.";

  return (
    <div>
      <h2 className="tmd-section-title"
          style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        {winner && <TeamLogo abbr={winner} teams={teams} size={34} />}
        {result}
      </h2>
      {/*
        Built as strings rather than interleaved JSX. Spacing across a line
        break between an element and the text after it is a JSX rule nobody
        should have to hold in their head, and getting it wrong produces
        "win probabilityagainst" — which it did.
      */}
      <p className="tmd-note" style={{ maxWidth: "62ch" }}>
        {`You made ${decisions.length} ${decisions.length === 1 ? "call" : "calls"} and gave away `}
        <strong>{`${(lost * 100).toFixed(1)} points of win probability`}</strong>
        {` against the engine's preferred line.`}
        {counts.toss > 0 &&
          ` ${counts.toss} of them came out inside the search's margin of error and are not counted against you.`}
      </p>

      <div className="tmd-panel" style={{ marginTop: "1rem" }}>
        <div className="tmd-panel-head"><span>win probability, your side</span></div>
        <div className="tmd-panel-body">
          <WinProbTrack decisions={decisions} grades={grades} />
        </div>
      </div>

      <div className="tmd-panel" style={{ marginTop: "1rem" }}>
        <div className="tmd-panel-head"><span>where you left the real game</span></div>
        <div className="tmd-panel-body">
          <BranchDiagram decisions={decisions} sequence={sequence} userTeam={userTeam} />
        </div>
      </div>

      <div className="tmd-panel" style={{ marginTop: "1rem" }}>
        <div className="tmd-panel-head">
          <span>every call</span>
          <span>
            {counts.best} best · {counts.toss} too close · {counts.fine} reasonable ·{" "}
            {counts.costly} costly · {counts.bad} big
          </span>
        </div>
        <div className="tmd-panel-body">
          {decisions.map((d, i) => {
            const g = grades[i];
            const style = VERDICT_STYLE[g.verdict];
            return (
              <div className="tmd-log-row" key={i}
                   style={i === worstIdx && g.loss > 0.03
                     ? { background: "var(--paper-shade)", marginInline: "-0.9rem", paddingInline: "0.9rem" }
                     : undefined}>
                <div className="tmd-log-meta">
                  <span>{formatClock(d.before.seconds)}</span>
                  <span className={style.className}>{style.label}</span>
                  {d.fromHistory && <span className="tmd-tag real">as played</span>}
                  {!d.fromHistory && <span className="tmd-tag sim">simulated</span>}
                </div>
                <div className="tmd-log-desc">
                  You chose <strong>{ACTION_LABEL[d.action] ?? d.action}</strong>
                  {g.chosen && <> ({(g.chosen.wp * 100).toFixed(1)}%)</>}
                  {g.verdict !== "best" && g.best && (
                    <>
                      {" "}· engine preferred <strong>{ACTION_LABEL[g.best.action] ?? g.best.action}</strong>{" "}
                      ({(g.best.wp * 100).toFixed(1)}%)
                      {g.verdict !== "toss" && <> · cost {(g.loss * 100).toFixed(1)} points</>}
                    </>
                  )}
                  <div style={{ color: "var(--ink-meta)", marginTop: 3, fontSize: 12.5 }}>
                    {d.fromHistory && d.realDesc
                      ? d.realDesc
                      : narrate(
                          d.side === "defense" ? d.offenseAction ?? d.action : d.action,
                          d.outcome,
                          d.before,
                          d.after,
                          d.side === "defense" ? opponent : null,
                        )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
        <button className="tmd-btn primary" onClick={onReplay}>Play it again</button>
        <button className="tmd-btn" onClick={onPick}>Another scenario</button>
      </div>
    </div>
  );
}
