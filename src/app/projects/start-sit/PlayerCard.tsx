"use client";

import type { Breakdown } from "@/lib/start-sit/scoring";
import type { SimResult } from "@/lib/start-sit/simulate";
import type { Game, Player } from "@/lib/start-sit/types";
import { Headshot } from "./Headshot";
import { InjuryTag } from "./InjuryTag";
import { PointsBar } from "./PointsBar";
import { StatTable } from "./StatTable";
import { COVERAGE_LABEL, kickoffLabel, matchup, pts, teamTotal } from "./format";
import type { TeamMap } from "./teams";
import { TeamLogo, teamOf } from "./teams";

export function PlayerCard({
  player, breakdown, sim, games, teams, scale, state,
}: {
  player: Player;
  breakdown: Breakdown | null;
  sim: SimResult | null;
  games: Map<string, Game>;
  teams: TeamMap;
  scale: number;
  state: "best" | "tied" | "rest" | "out";
}) {
  const total = teamTotal(player, games);
  const tag = COVERAGE_LABEL[player.coverage];
  return (
    <article className={`ss-card is-${state} ss-pos-${player.pos}`} style={{ ["--team-color" as string]: teamOf(teams, player.team).color }}>
      <header className="ss-card-head">
        <Headshot name={player.name} espnId={player.espnId} fallbackUrl={null} team={player.team} teams={teams} size={48} />
        <div className="ss-card-id">
          <h3 className="ss-card-name">
            {player.name}
            <InjuryTag injury={player.injury} />
          </h3>
          <p className="ss-card-meta">
            <span className={`ss-pos ss-pos-${player.pos}`}>{player.pos}</span>
            <TeamLogo abbr={player.team} teams={teams} size={13} />
            <span>{player.team}</span>
            {player.opp && <span>· {matchup(player)} · {kickoffLabel(player.kickoff)}</span>}
          </p>
          {total != null && (
            <p className="ss-card-total">Implied team total <span className="ss-num">{total.toFixed(1)}</span></p>
          )}
        </div>
        {state === "best" && <span className="ss-card-flag">Start</span>}
        {state === "tied" && <span className="ss-card-flag ss-card-flag--tied">Too close</span>}
      </header>

      {breakdown && sim ? (
        <>
          <div className="ss-card-figure">
            <span className="ss-card-pts ss-num">{pts(breakdown.mean)}</span>
            <span className="ss-card-pts-label">expected points</span>
            <span className="ss-card-band ss-num">{pts(sim.p20)} – {pts(sim.p80)}</span>
            <span className="ss-card-band-label">floor to ceiling</span>
          </div>
          <PointsBar breakdown={breakdown} scale={scale} />
          {tag && <p className="ss-card-partial">{tag[0].toUpperCase() + tag.slice(1)}: the market has not posted every line it usually does for a {player.pos}, so this total leans on what is up.</p>}
          <StatTable player={player} breakdown={breakdown} />
        </>
      ) : (
        <p className="ss-card-none">
          {player.coverage === "bye" && "On bye this week."}
          {player.coverage === "played" && "His game has already been played this week."}
          {player.coverage === "none" && "The market has no line on him this week. That is a signal in itself: the books and the pick'em apps did not think he would see enough volume to price."}
        </p>
      )}
    </article>
  );
}
