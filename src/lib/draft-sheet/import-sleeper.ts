/**
 * Import a league's real settings from Sleeper.
 *
 * Sleeper's read API is public, unauthenticated, and sends
 * `access-control-allow-origin: *`, so the browser calls it directly. No
 * server, no secret, no proxy — which is why this is the import that ships
 * first and works for everybody.
 *
 * Two entry points, because people remember different things: a username (then
 * pick from their leagues) or a league id pasted out of the Sleeper URL.
 */

import { defaultConfig } from "./presets.ts";
import type { LeagueConfig, RosterSlots } from "./types.ts";

const API = "https://api.sleeper.app/v1";

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
}

export interface LeagueChoice {
  id: string;
  name: string;
  teams: number;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(String(r.status));
  const body = (await r.json()) as T | null;
  if (body == null) throw new Error("404");
  return body;
}

/** A Sleeper league id is a long digit string; anything else is a username. */
export function looksLikeLeagueId(s: string): boolean {
  return /^\d{6,}$/.test(s.trim());
}

export async function leaguesForUser(
  username: string,
  season: string,
): Promise<LeagueChoice[]> {
  const user = await get<{ user_id: string }>(`/user/${encodeURIComponent(username.trim())}`);
  const leagues = await get<SleeperLeague[]>(`/user/${user.user_id}/leagues/nfl/${season}`);
  return leagues.map((l) => ({ id: l.league_id, name: l.name, teams: l.total_rosters }));
}

export async function fetchLeague(leagueId: string): Promise<SleeperLeague> {
  return get<SleeperLeague>(`/league/${encodeURIComponent(leagueId.trim())}`);
}

/** What Sleeper's current season is, so a username lookup asks for the right year. */
export async function currentSeason(): Promise<string> {
  try {
    const s = await get<{ league_season?: string; season?: string }>("/state/nfl");
    return s.league_season ?? s.season ?? String(new Date().getFullYear());
  } catch {
    return String(new Date().getFullYear());
  }
}

/**
 * Sleeper's roster slot vocabulary. Anything not listed — bench, IR, taxi, and
 * the whole IDP set — does not create starter demand and is either counted as
 * bench or ignored.
 */
const SLOT_MAP: Record<string, keyof RosterSlots> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  FLEX: "FLEX",
  WRRB_FLEX: "FLEX",
  WRRB_WRT: "FLEX",
  REC_FLEX: "FLEX",
  SUPER_FLEX: "SUPERFLEX",
  K: "K",
  DEF: "DST",
  BN: "BENCH",
};

const IGNORED = new Set(["IR", "TAXI"]);

export function toConfig(league: SleeperLeague): LeagueConfig {
  const base = defaultConfig();
  const roster: RosterSlots = {
    QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0, K: 0, DST: 0, BENCH: 0,
  };

  for (const raw of league.roster_positions ?? []) {
    if (IGNORED.has(raw)) continue;
    const slot = SLOT_MAP[raw];
    // An unmapped slot is almost always IDP (DL, LB, DB, IDP_FLEX). Those are
    // real starters but this sheet has no defensive players to rank, so they
    // are deliberately dropped rather than counted as flex.
    if (slot) roster[slot] += 1;
  }

  const s = league.scoring_settings ?? {};
  const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);

  return {
    ...base,
    name: league.name || base.name,
    teams: league.total_rosters || base.teams,
    roster,
    scoring: {
      rec: num(s.rec, base.scoring.rec),
      passTd: num(s.pass_td, base.scoring.passTd),
      // Sleeper models a tight-end premium as a per-reception bonus.
      teRecBonus: num(s.bonus_rec_te, 0),
    },
  };
}

/** A short, human summary of what the import actually changed. */
export function describe(c: LeagueConfig): string {
  const ppr = c.scoring.rec === 1 ? "full PPR" : c.scoring.rec === 0 ? "standard" : `${c.scoring.rec} PPR`;
  const bits = [
    `${c.teams} teams`,
    ppr,
    `${c.roster.QB}QB/${c.roster.RB}RB/${c.roster.WR}WR/${c.roster.TE}TE`,
    c.roster.FLEX ? `${c.roster.FLEX} flex` : null,
    c.roster.SUPERFLEX ? "superflex" : null,
    c.scoring.teRecBonus ? "TE premium" : null,
    c.scoring.passTd === 6 ? "6pt pass TD" : null,
  ].filter(Boolean);
  return bits.join(" · ");
}
