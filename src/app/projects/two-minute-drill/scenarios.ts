/**
 * The scenario corpus: real endgame situations and the plays that followed.
 *
 * Two files, because the picker needs only the situation and the teams (74 KB,
 * loads with the page) while the play sequences are most of the weight (about
 * a megabyte) and are not needed until someone actually starts a scenario.
 */

import { KICKOFF, PAT, PLAY, type GameState, type Phase } from "./engine/types";

export interface ScenarioStart {
  posteam: string;
  defteam: string;
  sec: number;
  diff: number;
  yl: number;
  down: number;
  ytg: number;
  oto: number;
  dto: number;
  run: boolean;
}

export interface RealPlay {
  run: boolean;
  /** Team charged a timeout immediately before this snap, if any. */
  to: string | null;
  posteam: string;
  sec: number | null;
  down: number | null;
  ytg: number | null;
  yl: number | null;
  diff: number | null;
  oto: number;
  dto: number;
  action: string;
  outcome: string;
  gain: number | null;
  desc: string;
}

/** nflverse round codes, in the order they are played. */
export type Round = "REG" | "WC" | "DIV" | "CON" | "SB";

export const ROUND_NAME: Record<Round, string> = {
  REG: "Regular season",
  WC: "Wild Card",
  DIV: "Divisional",
  CON: "Conference Championship",
  SB: "Super Bowl",
};

/** Compact enough for a card corner. */
export const ROUND_SHORT: Record<Round, string> = {
  REG: "",
  WC: "Wild Card",
  DIV: "Divisional",
  CON: "Conf. Championship",
  SB: "Super Bowl",
};

export interface Scenario {
  id: string;
  season: number;
  week: number;
  type: string;
  /** Which round. Taken from the schedule, not inferred from the week number. */
  round: Round;
  home: string;
  away: string;
  final: { home: number | null; away: number | null };
  start: ScenarioStart;
  points_in_window: number;
  n_plays: number;
}

export interface ScenarioIndex {
  meta: { seasons: [number, number]; count: number; filter: string };
  scenarios: Scenario[];
}

export async function loadIndex(base = "/two-minute-drill"): Promise<ScenarioIndex> {
  const res = await fetch(`${base}/scenarios.json`);
  if (!res.ok) throw new Error(`scenarios.json: ${res.status}`);
  return res.json();
}

export async function loadPlays(base = "/two-minute-drill"): Promise<Record<string, RealPlay[]>> {
  const res = await fetch(`${base}/scenario-plays.json`);
  if (!res.ok) throw new Error(`scenario-plays.json: ${res.status}`);
  return (await res.json()).plays;
}

/** Which phase a recorded play belongs to. */
export function phaseOf(p: RealPlay): Phase {
  if (p.action === "deep" || p.action === "onside") return KICKOFF;
  if (p.action === "two" || p.action === "kick" || p.down === null) return PAT;
  return PLAY;
}

/**
 * The engine state standing at a recorded play, from `userTeam`'s point of view.
 *
 * Recorded `diff` is already in the possessing team's frame, which is the frame
 * `GameState` wants, so the only thing to work out is whether that possessing
 * team is the player's.
 */
export function stateAtPlay(p: RealPlay, userTeam: string): GameState {
  return {
    seconds: p.sec ?? 0,
    phase: phaseOf(p),
    diff: p.diff ?? 0,
    yardline: Math.min(99, Math.max(1, p.yl ?? 50)),
    down: p.down ?? 1,
    ydstogo: Math.max(1, Math.min(p.ytg ?? 10, p.yl ?? 10)),
    offTo: p.oto,
    defTo: p.dto,
    clockRunning: p.run,
    twoMinuteDone: true,
    offenseIsUser: p.posteam === userTeam,
  };
}

export function startState(s: Scenario, userTeam: string): GameState {
  return {
    seconds: s.start.sec,
    phase: PLAY,
    diff: s.start.diff,
    yardline: s.start.yl,
    down: s.start.down,
    ydstogo: Math.max(1, Math.min(s.start.ytg, s.start.yl)),
    offTo: s.start.oto,
    defTo: s.start.dto,
    clockRunning: s.start.run,
    twoMinuteDone: true,
    offenseIsUser: s.start.posteam === userTeam,
  };
}

/**
 * The call the real coach made at this snap, in the vocabulary of the side you
 * are playing.
 *
 * On offence that is simply the recorded play. On defence the recorded play
 * belongs to the *other* team, so there is nothing to compare a defensive
 * choice against directly — what the real defence decided was whether to spend
 * a timeout, and that is what the transcript's `to` field records.
 *
 * Both the "as played" flag and the on-rails check run through here. They used
 * to disagree: the rails check compared a defensive choice against the
 * opposing offence's play, which can never match, so taking the defensive side
 * left history on the very first snap and the whole replay-until-you-diverge
 * idea quietly stopped working on that side of the ball.
 */
export function realChoiceFor(
  side: "offense" | "defense",
  play: RealPlay | null,
  userTeam: string,
): string | null {
  if (!play) return null;
  if (side === "offense") return play.action;
  return play.to === userTeam ? "timeout" : "defend";
}

export function teamsOf(s: Scenario): [string, string] {
  return [s.start.posteam, s.start.defteam];
}

export function scoreAt(s: Scenario, state: GameState, userTeam: string): {
  user: number;
  opponent: number;
} {
  // Only the differential is tracked through the game; the absolute score is
  // reconstructed from where the scenario started so the scoreboard reads like
  // a scoreboard rather than a signed integer.
  const userLead = state.offenseIsUser ? state.diff : -state.diff;
  const startLead = s.start.posteam === userTeam ? s.start.diff : -s.start.diff;
  const base = baseScores(s, userTeam);
  const delta = userLead - startLead;
  return delta >= 0
    ? { user: base.user + delta, opponent: base.opponent }
    : { user: base.user, opponent: base.opponent - delta };
}

function baseScores(s: Scenario, userTeam: string): { user: number; opponent: number } {
  // The corpus records the final score, not the score at the snap, so the
  // opening scoreboard is derived from the differential with a floor of zero.
  // It reads correctly relative to itself, which is what the player needs.
  const lead = s.start.posteam === userTeam ? s.start.diff : -s.start.diff;
  const low = 14;
  return lead >= 0 ? { user: low + lead, opponent: low } : { user: low, opponent: low - lead };
}

export function formatClock(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "own 32" / "opp 18" / "midfield", from a yards-to-goal number. */
export function fieldPosition(yardline: number): string {
  if (yardline === 50) return "midfield";
  return yardline > 50 ? `own ${100 - yardline}` : `opp ${yardline}`;
}
