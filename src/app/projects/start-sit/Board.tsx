"use client";

/**
 * Every priced player at a position, ranked by expected points for the
 * viewer's scoring, with the simulated floor and ceiling. A row's button drops
 * that player into the advisor.
 */

import { useMemo, useState } from "react";

import { rankBoard } from "@/lib/start-sit/board";
import type { Game, Player, Position, Scoring } from "@/lib/start-sit/types";
import { Headshot } from "./Headshot";
import { InjuryTag } from "./InjuryTag";
import { COVERAGE_LABEL, kickoffLabel, matchup, pts, teamTotal } from "./format";
import type { TeamMap } from "./teams";
import { TeamLogo, teamOf } from "./teams";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export function Board({
  players, games, teams, scoring, onAdd, picked,
}: {
  players: Player[];
  games: Map<string, Game>;
  teams: TeamMap;
  scoring: Scoring;
  onAdd: (id: string) => void;
  picked: Set<string>;
}) {
  const [pos, setPos] = useState<Position>("WR");
  const rows = useMemo(() => rankBoard(players, scoring, pos), [players, scoring, pos]);
  const tiers = rows.filter((r) => Object.values(r.player.stats).some((s) => s.tier === "book")).length;

  return (
    <section className="ss-board" aria-label="The board">
      <div className="ss-board-bar">
        <div className="ss-seg" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p} type="button" className="ss-seg-btn" aria-pressed={pos === p} data-pos={p}
              onClick={() => setPos(p)} data-tel="ss-board-pos">
              {p}
            </button>
          ))}
        </div>
        <span className="ss-board-count">
          {rows.length} priced {pos}s · {tiers} with a sportsbook line
        </span>
      </div>
      <div className="ss-table-wrap">
      <table className="ss-table">
        <thead>
          <tr>
            <th scope="col" className="ss-num">#</th>
            <th scope="col">Player</th>
            <th scope="col" className="ss-col-game">Game</th>
            <th scope="col" className="ss-num ss-col-total">Team total</th>
            <th scope="col" className="ss-num">Pts</th>
            <th scope="col" className="ss-num ss-col-band">Floor – ceiling</th>
            <th scope="col" className="ss-col-src">Lines</th>
            <th scope="col"><span className="ss-sr">Add</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const p = r.player;
            const total = teamTotal(p, games);
            const books = Math.max(0, ...Object.values(p.stats).map((s) => (s.tier === "book" ? s.books : 0)));
            const tag = COVERAGE_LABEL[p.coverage];
            return (
              <tr key={p.id} className={`ss-row ss-pos-${p.pos}`} style={{ ["--team-color" as string]: teamOf(teams, p.team).color }}>
                <td className={`ss-num ss-rank${i < 3 ? " is-top" : ""}`}>{i + 1}</td>
                <td className="ss-cell-player">
                  <Headshot name={p.name} espnId={p.espnId} fallbackUrl={null} team={p.team} teams={teams} size={26} />
                  <span className="ss-cell-name">
                    {p.name}
                    <InjuryTag injury={p.injury} />
                  </span>
                  <TeamLogo abbr={p.team} teams={teams} size={13} />
                  {tag && <span className="ss-cov">{tag}</span>}
                </td>
                <td className="ss-cell-game ss-col-game">{matchup(p)} <span className="ss-cell-time">{kickoffLabel(p.kickoff)}</span></td>
                <td className="ss-num ss-col-total">{total == null ? "—" : total.toFixed(1)}</td>
                <td className="ss-num ss-cell-pts">{pts(r.mean)}</td>
                <td className="ss-num ss-col-band">{pts(r.p20)} – {pts(r.p80)}</td>
                <td className="ss-cell-src ss-col-src">{books ? `${books} books` : "pick'em"}</td>
                <td>
                  <button type="button" className="ss-row-add" disabled={picked.has(p.id)}
                    onClick={() => onAdd(p.id)} data-tel="ss-board-add" aria-label={`Add ${p.name} to the advisor`}>
                    <span className="ss-row-add-long">{picked.has(p.id) ? "Added" : "Compare"}</span>
                    <span className="ss-row-add-short" aria-hidden="true">{picked.has(p.id) ? "✓" : "+"}</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
  );
}
