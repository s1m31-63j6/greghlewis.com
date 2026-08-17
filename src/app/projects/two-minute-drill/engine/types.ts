/**
 * Shapes shared by the engine, the worker and the UI.
 *
 * `GameState` is expressed in the frame of whoever has the ball: `diff` is the
 * offence's score minus the defence's, and a change of possession flips the
 * sign along with everything else. That keeps the step function free of
 * "which team am I" branching, and it is why `userDiff` exists as the one
 * place the player's own perspective is recovered.
 */

export const PLAY = "play";
export const PAT = "pat";
export const KICKOFF = "kickoff";
export type Phase = typeof PLAY | typeof PAT | typeof KICKOFF;

export interface GameState {
  seconds: number;
  phase: Phase;
  diff: number;
  yardline: number; // yards from the offence to the opponent's goal, 1-99
  down: number;
  ydstogo: number;
  offTo: number;
  defTo: number;
  clockRunning: boolean;
  twoMinuteDone: boolean;
  offenseIsUser: boolean;
}

export type OffenseAction =
  | "run"
  | "pass"
  | "pass_sideline"
  | "field_goal"
  | "punt"
  | "spike"
  | "kneel"
  | "timeout";
export type PatAction = "kick" | "two";
export type KickoffAction = "deep" | "onside";
export type DefenseAction = "defend" | "timeout" | "concede";
export type Action = OffenseAction | PatAction | KickoffAction | DefenseAction;

/** What a play produced. Used for narration and for the branch diagram. */
export type Outcome =
  | "touchdown"
  | "fg_good"
  | "fg_miss"
  | "safety"
  | "first_down"
  | "gain"
  | "incomplete"
  | "sack"
  | "downs"
  | "interception"
  | "fumble"
  | "punt"
  | "spike"
  | "kneel"
  // Produced only by resolveDefense, when the play in front of you was a
  // conversion attempt or a kickoff rather than a snap.
  | "conversion"
  | "kickoff";

export interface Evaluation {
  action: Action;
  wp: number;
  stderr: number;
  n: number;
}

/** A single empirical distribution, stored as support + cumulative probability. */
export interface PmfBlob {
  v: number[];
  c: number[];
  n: number;
}

export interface Distributions {
  meta: Record<string, unknown>;
  run: {
    yards: Record<string, PmfBlob>;
    yards_all: PmfBlob;
    fumble_lost: number;
    out_of_bounds: number;
  };
  pass: {
    complete: Record<string, number>;
    complete_all: number;
    yards_complete: Record<string, PmfBlob>;
    yards_complete_all: PmfBlob;
    sack: number;
    sack_yards: PmfBlob;
    interception: number;
    out_of_bounds_given_complete: Record<string, number>;
    out_of_bounds_given_complete_all: number;
  };
  field_goal: {
    grid_lo: number;
    grid_hi: number;
    seasons: [number, number];
    /** Make probability over the distance grid, one row per season. */
    make_by_season: Record<string, number[]>;
    /** Raw observed rate and sample size per season per reporting bucket. */
    observed: Record<string, Record<string, { p: number; n: number }>>;
    report_labels: string[];
    season_log_odds_per_year: number;
    block_rate: number;
  };
  punt: { net: Record<string, PmfBlob>; net_all: PmfBlob; touchback: Record<string, number> };
  kickoff: {
    deep: { touchback: number; start: PmfBlob };
    onside: { recover: number; recover_legacy: number; fail_start: PmfBlob; n: number };
  };
  conversion: { two_point: number; extra_point: number };
  runoff: Record<string, Record<string, PmfBlob>>;
}

export interface TendencyLevel {
  by: string[];
  table: Record<string, { p: Record<string, number>; n: number }>;
}

export interface TendencySpec {
  [level: string]: TendencyLevel | { p: Record<string, number>; n: number } | undefined;
}

export interface Tendencies {
  meta: Record<string, unknown>;
  fourth_down: TendencySpec;
  play_call: TendencySpec;
  two_point: TendencySpec;
  onside: TendencySpec;
  offensive_timeout: TendencySpec;
  defensive_timeout: TendencySpec;
}

export interface Calibration {
  grid: number[];
  curve: number[];
}

/** Which season's kicking the engine should use. Nothing else moves with it. */
export type KickSeason = number;
