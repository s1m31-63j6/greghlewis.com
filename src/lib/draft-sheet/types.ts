/**
 * Draft Sheet — shared types.
 *
 * The governing rule of this project is that CONSENSUS IS THE SPINE. The board
 * a user sees is the expert consensus board for their format, with tiers where
 * 100+ analysts put them. Nothing here re-ranks players inside a position; the
 * only thing configuration is allowed to do is shift positions relative to one
 * another, and even that is capped. See `board.ts`.
 */

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

/** The five consensus boards published by FantasyPros. */
export type BoardKey =
  | "standard"
  | "half"
  | "ppr"
  | "superflex"
  | "half-superflex";

export const BOARD_KEYS: BoardKey[] = [
  "standard",
  "half",
  "ppr",
  "superflex",
  "half-superflex",
];

/** A lane on the ADP track. `kind` is honest about what the number is. */
export type PlatformKey = "yahoo" | "espn" | "sleeper" | "ffc";

export interface PlatformSpec {
  key: PlatformKey;
  label: string;
  /** Three characters, for the header that sits over a 24px cell. */
  short: string;
  /**
   * "adp" is a real average draft position. "rank" is a platform's own
   * ordering — Sleeper publishes no ADP, and saying so is better than
   * quietly averaging a rank into a mean of picks.
   */
  kind: "adp" | "rank";
}

export const PLATFORMS: PlatformSpec[] = [
  { key: "yahoo", label: "Yahoo", short: "YAH", kind: "adp" },
  { key: "espn", label: "ESPN", short: "ESP", kind: "adp" },
  { key: "sleeper", label: "Sleeper", short: "SLP", kind: "rank" },
  { key: "ffc", label: "Mocks", short: "MCK", kind: "adp" },
];

export interface Player {
  id: string;
  name: string;
  /** "J. Chase" — already short enough for the printed sheet's name budget. */
  short: string;
  pos: Position;
  team: string | null;
  bye: number | null;
  espnId: string | null;
  yahooHeadshot: string | null;
  ecr: Record<BoardKey, number | null>;
  tier: Record<BoardKey, number | null>;
  posRank: Record<BoardKey, string | null>;
  /** Expert dispersion on the PPR board — how much analysts disagree. */
  ecrStd: number | null;
  /**
   * Sleeper's injury designation, with what it means for availability. Sleeper
   * gives no return date, so `detail` says what the designation itself
   * guarantees under the roster rules rather than guessing a comeback week.
   */
  injury: {
    status: string;
    severity: "out" | "doubtful" | "questionable";
    part: string | null;
    detail: string;
  } | null;
  /** Sleeper's depth-chart position at the player's own team. */
  depth: number | null;
}

export interface Adp {
  id: string;
  raw: Record<PlatformKey, number | null>;
  /** Rank across the whole board on that platform. Drives the spread. */
  rank: Record<PlatformKey, number | null>;
  /**
   * Rank WITHIN the player's position on that platform, and the consensus
   * equivalent. Cell color uses these, never the overall ranks: Sleeper's
   * ordering puts quarterbacks far above where a PPR consensus board does, so
   * an overall-rank difference paints every QB as a reach on Sleeper. That is
   * platform bias, not a market edge.
   */
  posRank: Record<PlatformKey, number | null>;
  posRankEcr: number | null;
  mean: number | null;
  spread: number | null;
  n: number;
  dispersion: {
    stdev: number | null;
    high: number | null;
    low: number | null;
    drafts: number | null;
  };
  espnPctOwned: number | null;
  espnRankPpr: number | null;
  /**
   * Change in ADP over the trailing 30 days. POSITIVE MEANS RISING — the sign
   * is flipped in publish.py so no component has to remember that ADP falls as
   * a player climbs. Null where the history does not reach back far enough.
   */
  move: number | null;
}

export interface RosterSlots {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  SUPERFLEX: number;
  K: number;
  DST: number;
  BENCH: number;
}

export interface ScoringRules {
  /** 0 | 0.5 | 1 — the PPR question. */
  rec: number;
  /** 4 | 6 — the QB touchdown question. */
  passTd: number;
  /** Added to `rec` for tight ends only. */
  teRecBonus: number;
}

export interface LeagueConfig {
  v: 1;
  name: string;
  teams: number;
  roster: RosterSlots;
  scoring: ScoringRules;
  /** Which lane drives the displayed ADP column. */
  adpSource: PlatformKey | "mean";
}

/** Per-viewer state. Never leaves the browser. */
export interface SheetPrefs {
  removed: string[];
  starred: string[];
  notes: Record<string, string>;
}

export interface TierGroup {
  tier: number;
  players: Player[];
  /** True when the tier came from consensus rather than being recomputed. */
  fromConsensus: boolean;
}

export interface BoardColumn {
  pos: Position;
  tiers: TierGroup[];
  /** The rank at which this position stops producing starters. */
  replacement: number;
}

export interface BuiltBoard {
  /** Which published board this config snapped to. */
  board: BoardKey;
  columns: BoardColumn[];
  /** Overall order across positions, after any bounded positional shift. */
  overall: Player[];
  /** Largest |adjusted - consensus| rank move applied. 0 means pure consensus. */
  maxDeparture: number;
}
