/**
 * League presets and defaults.
 *
 * The default is a 12-team half-PPR league because that is the most common
 * shape, and because it snaps to a published consensus board with a zero
 * positional offset — a first-time visitor sees pure consensus, unedited.
 */

import type { LeagueConfig, RosterSlots } from "./types.ts";

export const DEFAULT_ROSTER: RosterSlots = {
  QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SUPERFLEX: 0, K: 1, DST: 1, BENCH: 6,
};

export function defaultConfig(): LeagueConfig {
  return {
    v: 1,
    name: "My league",
    teams: 12,
    roster: { ...DEFAULT_ROSTER },
    scoring: { rec: 0.5, passTd: 4, teRecBonus: 0 },
    adpSource: "mean",
  };
}

/**
 * TWO DIFFERENT KINDS OF CONTROL, and mixing them was a real bug.
 *
 * All five used to sit in one row and each one spread the previous config, so
 * clicking Superflex and then TE premium left BOTH on with no way to see it and
 * no way back — and nothing was ever marked active. Scoring is one exclusive
 * choice; superflex and a tight-end premium are independent switches on top of
 * it. Now they look like what they are.
 */
export interface ScoringPreset {
  id: string;
  label: string;
  hint: string;
  rec: number;
}

export const SCORING_PRESETS: ScoringPreset[] = [
  { id: "standard", label: "Standard", hint: "No points per catch", rec: 0 },
  { id: "half", label: "Half PPR", hint: "0.5 per catch", rec: 0.5 },
  { id: "ppr", label: "Full PPR", hint: "1 per catch", rec: 1 },
];

export interface LeagueToggle {
  id: string;
  label: string;
  hint: string;
  isOn: (c: LeagueConfig) => boolean;
  toggle: (c: LeagueConfig) => LeagueConfig;
}

export const LEAGUE_TOGGLES: LeagueToggle[] = [
  {
    id: "superflex",
    label: "Superflex",
    hint: "A second quarterback may start in the flex",
    isOn: (c) => c.roster.SUPERFLEX > 0,
    toggle: (c) => ({
      ...c,
      roster: { ...c.roster, SUPERFLEX: c.roster.SUPERFLEX > 0 ? 0 : 1 },
    }),
  },
  {
    id: "te-premium",
    label: "TE premium",
    hint: "Bonus points on every tight-end catch",
    isOn: (c) => c.scoring.teRecBonus > 0,
    toggle: (c) => ({
      ...c,
      scoring: { ...c.scoring, teRecBonus: c.scoring.teRecBonus > 0 ? 0 : 0.5 },
    }),
  },
  {
    id: "sixpt",
    label: "6pt pass TD",
    hint: "Six points for a passing touchdown instead of four",
    isOn: (c) => c.scoring.passTd >= 6,
    toggle: (c) => ({
      ...c,
      scoring: { ...c.scoring, passTd: c.scoring.passTd >= 6 ? 4 : 6 },
    }),
  },
];

/** Which scoring preset the current config matches, if any. */
export function activeScoring(c: LeagueConfig): string | null {
  return SCORING_PRESETS.find((p) => p.rec === c.scoring.rec)?.id ?? null;
}

export const TEAM_COUNTS = [8, 10, 12, 14, 16];
