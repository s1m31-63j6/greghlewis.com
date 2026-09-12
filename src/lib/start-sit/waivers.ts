/**
 * Best available on waivers, from a Sleeper league id.
 *
 * A league's rosters name every player somebody holds, in the same id space as
 * our pool. "Available" is everyone priced this week who is on none of them,
 * ranked by expected points for the page's scoring. Waiver order, claims and
 * who is actually droppable are the league's business, and the report says so.
 *
 * The league and roster fetches reuse the draft sheet's Sleeper client, which
 * runs in the browser: Sleeper's read API is public and sends
 * `access-control-allow-origin: *`.
 */

import { fetchLeague, looksLikeLeagueId } from "../draft-sheet/import-sleeper.ts";
import type { SleeperLeague } from "../draft-sheet/import-sleeper.ts";
import { components, isPriced } from "./scoring.ts";
import { simulate } from "./simulate.ts";
import type { Player, Position, Scoring } from "./types.ts";

export { looksLikeLeagueId };

const API = "https://api.sleeper.app/v1";
export const PER_POSITION = 8;
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

interface Roster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
}

/** Every player id held by any roster in the league. */
export async function fetchRostered(leagueId: string): Promise<Set<string>> {
  const r = await fetch(`${API}/league/${leagueId}/rosters`);
  if (!r.ok) throw new Error(String(r.status));
  const rosters = (await r.json()) as Roster[] | null;
  if (!rosters) throw new Error("404");
  return new Set(rosters.flatMap((x) => x.players ?? []));
}

export interface WaiverRow {
  player: Player;
  mean: number;
  p20: number;
  p80: number;
}

export interface WaiverReport {
  league: { name: string; teams: number; rec: number | null; passTd: number | null };
  rosteredCount: number;
  byPos: Record<Position, WaiverRow[]>;
}

/** Pure: rank the unrostered, priced players with an open game, per position. */
export function waiverBoard(
  players: Player[],
  rostered: Set<string>,
  scoring: Scoring,
  per = PER_POSITION,
): Record<Position, WaiverRow[]> {
  const out = {} as Record<Position, WaiverRow[]>;
  for (const pos of POSITIONS) {
    const pool = players
      .filter((p) => p.pos === pos && isPriced(p) && p.game && p.coverage !== "played" && !rostered.has(p.id))
      .map((player) => ({ player, mean: components(player, scoring).mean }))
      .sort((a, b) => b.mean - a.mean)
      .slice(0, per);
    const sim = simulate(pool.map((x) => x.player), scoring, { draws: 1000 });
    out[pos] = pool.map((x, i) => ({ ...x, p20: sim.results[i].p20, p80: sim.results[i].p80 }));
  }
  return out;
}

export function describeLeague(l: SleeperLeague): WaiverReport["league"] {
  const s = l.scoring_settings ?? {};
  return {
    name: l.name,
    teams: l.total_rosters,
    rec: typeof s.rec === "number" ? s.rec : null,
    passTd: typeof s.pass_td === "number" ? s.pass_td : null,
  };
}

export async function loadWaivers(leagueId: string, players: Player[], scoring: Scoring): Promise<WaiverReport> {
  const [league, rostered] = await Promise.all([fetchLeague(leagueId), fetchRostered(leagueId)]);
  return {
    league: describeLeague(league),
    rosteredCount: rostered.size,
    byPos: waiverBoard(players, rostered, scoring),
  };
}
