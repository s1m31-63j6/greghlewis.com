"use client";

/**
 * The scoreboard bug.
 *
 * Club mark, abbreviation, nickname and score on each side, with the team's own
 * colour as a bar down the outer edge; clock in the middle, turning amber when
 * it is stopped. Everything numeric is tabular so nothing reflows as it counts.
 */

import type { GameState } from "./engine/types";
import { fieldPosition, formatClock } from "./scenarios";
import { TeamLogo, type TeamMap, teamOf } from "./teams";

interface Props {
  state: GameState;
  userTeam: string;
  opponent: string;
  score: { user: number; opponent: number };
  teams: TeamMap;
}

function Timeouts({ n, color }: { n: number; color: string }) {
  return (
    <span className="tmd-timeouts" style={{ ["--pip" as string]: color }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`tmd-to${i < n ? " on" : ""}`} />
      ))}
    </span>
  );
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

function Side({
  abbr, teams, score, isUser, right,
}: {
  abbr: string; teams: TeamMap; score: number; isUser: boolean; right?: boolean;
}) {
  const team = teamOf(teams, abbr);
  return (
    <div
      className={`tmd-sb-team${right ? " right" : ""}`}
      style={{ ["--bar" as string]: team.color }}
    >
      <TeamLogo abbr={abbr} teams={teams} size={36} />
      <span className="tmd-sb-id">
        <span className={`tmd-sb-abbr${isUser ? " tmd-sb-you" : ""}`}>
          {abbr}
          {isUser && " · you"}
        </span>
        <span className="tmd-sb-nick">{team.nick || team.name}</span>
      </span>
      <span className="tmd-sb-score">{score}</span>
    </div>
  );
}

export default function Scoreboard({ state, userTeam, opponent, score, teams }: Props) {
  const userTo = state.offenseIsUser ? state.offTo : state.defTo;
  const oppTo = state.offenseIsUser ? state.defTo : state.offTo;
  const user = teamOf(teams, userTeam);
  const opp = teamOf(teams, opponent);
  const goalToGo = state.ydstogo >= state.yardline;

  return (
    <>
      <div className="tmd-scoreboard">
        <Side abbr={userTeam} teams={teams} score={score.user} isUser />
        <div className="tmd-sb-clock">
          <span className={`tmd-sb-time${state.clockRunning ? "" : " stopped"}`}>
            {formatClock(state.seconds)}
          </span>
          <span className="tmd-sb-qtr">
            4th · {state.clockRunning ? "running" : "stopped"}
          </span>
        </div>
        <Side abbr={opponent} teams={teams} score={score.opponent} isUser={false} right />
      </div>

      <div className="tmd-situation">
        <span>
          {state.phase === "pat" ? (
            <strong>conversion</strong>
          ) : state.phase === "kickoff" ? (
            <strong>kickoff</strong>
          ) : (
            <>
              <strong>
                {ORDINAL[state.down]} &amp; {goalToGo ? "goal" : state.ydstogo}
              </strong>{" "}
              at the {fieldPosition(state.yardline)}
            </>
          )}
        </span>
        <span>
          {state.offenseIsUser
            ? `${userTeam} have the ball`
            : `${opponent} have the ball`}
        </span>
        <span>
          {userTeam} timeouts
          <Timeouts n={userTo} color={user.color} />
        </span>
        <span>
          {opponent} timeouts
          <Timeouts n={oppTo} color={opp.color} />
        </span>
      </div>
    </>
  );
}
