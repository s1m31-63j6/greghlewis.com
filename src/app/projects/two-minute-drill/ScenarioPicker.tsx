"use client";

import { useMemo, useState } from "react";

import {
  fieldPosition, formatClock, ROUND_SHORT, type Round, type Scenario,
} from "./scenarios";
import { TeamLogo, type TeamMap, teamOf } from "./teams";

interface Props {
  scenarios: Scenario[];
  teams: TeamMap;
  onPick: (s: Scenario, userTeam: string) => void;
}

/** How the situation reads from a given team's point of view. */
function margin(diff: number): string {
  if (diff === 0) return "tied";
  return diff > 0 ? `up ${diff}` : `down ${-diff}`;
}

export default function ScenarioPicker({ scenarios, teams, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("all");
  const [round, setRound] = useState("all");

  const seasons = useMemo(
    () => Array.from(new Set(scenarios.map((s) => s.season))).sort((a, b) => b - a),
    [scenarios],
  );

  // How many playoff games are in the set at all, so the control can say so
  // rather than silently filtering to nothing.
  const postCount = useMemo(
    () => scenarios.filter((s) => s.round !== "REG").length,
    [scenarios],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scenarios
      .filter((s) => season === "all" || String(s.season) === season)
      .filter((s) => {
        if (round === "all") return true;
        if (round === "POST") return s.round !== "REG";
        return s.round === round;
      })
      .filter((s) => {
        if (!q) return true;
        // Search the full names too, so "chiefs" and "kansas" both work.
        const hay = [
          s.home, s.away, s.season, "week", s.week,
          ROUND_SHORT[s.round], s.round !== "REG" ? "playoffs postseason" : "",
          teamOf(teams, s.home).name, teamOf(teams, s.away).name,
          teamOf(teams, s.home).nick, teamOf(teams, s.away).nick,
        ]
          .join(" ")
          .toLowerCase();
        return q.split(/\s+/).every((t) => hay.includes(t));
      })
      .slice(0, 60);
  }, [scenarios, query, season, round, teams]);

  return (
    <div>
      <div className="tmd-filters">
        <input
          className="tmd-input"
          placeholder="Team or season — try “chiefs 2021”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter scenarios"
        />
        <select
          className="tmd-select"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          aria-label="Filter by season"
        >
          <option value="all">Every season</option>
          {seasons.map((s) => (
            <option key={s} value={String(s)}>{s}</option>
          ))}
        </select>
        <select
          className="tmd-select"
          value={round}
          onChange={(e) => setRound(e.target.value)}
          aria-label="Filter by round"
        >
          <option value="all">Every round</option>
          <option value="REG">Regular season</option>
          <option value="POST">Playoffs ({postCount})</option>
          <option value="WC">— Wild Card</option>
          <option value="DIV">— Divisional</option>
          <option value="CON">— Conference Championship</option>
          <option value="SB">— Super Bowl</option>
        </select>
        <span className="tmd-note">{shown.length} shown</span>
      </div>

      <div className="tmd-cards">
        {shown.map((s) => {
          const away = teamOf(teams, s.away);
          const home = teamOf(teams, s.home);
          const pos = s.start.posteam;
          const def = s.start.defteam;
          return (
            <div className="tmd-card" key={s.id}>
              <div className="tmd-card-strip">
                <span style={{ background: away.color }} />
                <span style={{ background: home.color }} />
              </div>
              <div className="tmd-card-body">
                <div className="tmd-card-meta">
                  {s.season}
                  {s.round === "REG" && ` · week ${s.week}`}
                  {s.round !== "REG" && (
                    <span className={`tmd-round${s.round === "SB" ? " sb" : ""}`}>
                      {ROUND_SHORT[s.round as Round]}
                    </span>
                  )}
                </div>

                <div className="tmd-card-teams">
                  <TeamLogo abbr={s.away} teams={teams} size={30} />
                  <span className="tmd-card-abbr">{s.away}</span>
                  <span className="tmd-card-vs">at</span>
                  <TeamLogo abbr={s.home} teams={teams} size={30} />
                  <span className="tmd-card-abbr">{s.home}</span>
                </div>

                <div className="tmd-card-sit">
                  <b>{formatClock(s.start.sec)}</b> left ·{" "}
                  {teamOf(teams, pos).nick || pos} ball at the{" "}
                  {fieldPosition(s.start.yl)}
                  <br />
                  {pos} {margin(s.start.diff)} · {def} {margin(-s.start.diff)}
                </div>

                <div className="tmd-card-take">
                  <button
                    className="tmd-take"
                    style={{ ["--take" as string]: teamOf(teams, pos).color }}
                    onClick={() => onPick(s, pos)}
                  >
                    <TeamLogo abbr={pos} teams={teams} size={16} />
                    Take {pos}
                  </button>
                  <button
                    className="tmd-take"
                    style={{ ["--take" as string]: teamOf(teams, def).color }}
                    onClick={() => onPick(s, def)}
                  >
                    <TeamLogo abbr={def} teams={teams} size={16} />
                    Take {def}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
