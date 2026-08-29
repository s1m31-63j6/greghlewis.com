/**
 * Board construction — and the rule that keeps it honest.
 *
 * CONSENSUS IS THE SPINE. This module never re-ranks players within a position.
 * Two wide receivers keep the order 100+ analysts put them in, whatever the
 * league settings are, because the market's opinion of two receivers is better
 * than anything we would compute. What configuration IS allowed to change is
 * how positions interleave — whether the 24th receiver goes before or after the
 * 18th running back genuinely depends on how many of each your league starts,
 * and consensus cannot personalise that.
 *
 * The shift is a single bounded term:
 *
 *     offset(pos) = K_SHIFT * ln( demandBaseline(pos) / demandLeague(pos) )
 *     adjusted    = clamp(ecr + offset, ecr - CAP, ecr + CAP)
 *
 * Three properties matter, and all three are asserted in
 * projects/draft-sheet/results/tie-out.mts:
 *
 *   1. It REPRODUCES consensus exactly when the league matches the baseline the
 *      consensus board assumes — the ratio is 1, ln(1) is 0, the offset
 *      vanishes. Tie-out is structural, not a tuned coincidence.
 *   2. It is MONOTONE. More demand for a position can only move that position
 *      up, never down.
 *   3. It is BOUNDED. No player moves more than CAP ranks from consensus, so a
 *      weird league setting cannot manufacture a garbage tier.
 */

import type {
  Adp,
  BoardKey,
  BoardColumn,
  BuiltBoard,
  LeagueConfig,
  Player,
  Position,
  RosterSlots,
  SheetPrefs,
  TierGroup,
} from "./types.ts";
import { POSITIONS } from "./types.ts";

/** Picks of movement per e-fold of demand change. */
const K_SHIFT = 14;

/**
 * The two scoring axes NO published board covers.
 *
 * FantasyPros publishes boards across reception value and superflex, so those
 * are handled by snapping. Tight-end premium and six-point passing touchdowns
 * are not published anywhere, which is exactly the case a bounded delta exists
 * for — without these, choosing "TE premium" would change nothing at all, and a
 * setting that visibly does nothing is worse than no setting.
 *
 * Ranks of movement per point of bonus. A half-point tight-end premium is worth
 * roughly forty points over a season to a starting tight end, which is a real
 * but not enormous move; six-point passing touchdowns lift every quarterback
 * together, so the within-position order is untouched and only the position's
 * placement against the others changes.
 */
const K_TE_PREMIUM = 14;
const K_PASS_TD = 3;

/** Hard displacement cap, in ranks, against the consensus board. */
export const CAP = 18;

/**
 * What the published consensus boards assume: a conventional 12-team league.
 *
 * This is PER BOARD, not global. The superflex boards have already priced in a
 * second quarterback slot — that is what makes them different boards — so
 * measuring a superflex league against a one-quarterback baseline would count
 * the same effect twice and walk QBs off consensus at the exact settings where
 * consensus is most trustworthy. The tie-out harness caught precisely this.
 */
export const BASELINE: { teams: number; roster: RosterSlots } = {
  teams: 12,
  roster: {
    QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SUPERFLEX: 0,
    K: 1, DST: 1, BENCH: 6,
  },
};

export function baselineFor(board: BoardKey): { teams: number; roster: RosterSlots } {
  return {
    teams: BASELINE.teams,
    roster: {
      ...BASELINE.roster,
      SUPERFLEX: board.includes("superflex") ? 1 : 0,
    },
  };
}

/**
 * How a FLEX slot is actually spent, league-wide. Not a model — an allocation
 * assumption, stated here rather than buried, and surfaced on the methodology
 * page.
 */
const FLEX_SHARE: Partial<Record<Position, number>> = { RB: 0.35, WR: 0.5, TE: 0.15 };
const SUPERFLEX_SHARE: Partial<Record<Position, number>> = {
  QB: 0.75, RB: 0.08, WR: 0.14, TE: 0.03,
};

/** Starter demand for one position, in players, across the whole league. */
export function demand(pos: Position, teams: number, roster: RosterSlots): number {
  const dedicated = roster[pos] ?? 0;
  const flex = (FLEX_SHARE[pos] ?? 0) * roster.FLEX;
  const sf = (SUPERFLEX_SHARE[pos] ?? 0) * roster.SUPERFLEX;
  return teams * (dedicated + flex + sf);
}

/**
 * Replacement rank: the point past which a position stops producing starters,
 * plus the share of the bench that position tends to absorb.
 */
export function replacementRank(
  pos: Position,
  teams: number,
  roster: RosterSlots,
): number {
  const starters = demand(pos, teams, roster);
  const benchWeight = (FLEX_SHARE[pos] ?? (pos === "QB" ? 0.1 : 0.02));
  return Math.ceil(starters + teams * roster.BENCH * benchWeight * 0.25);
}

/** Which published board this league is closest to. */
export function snapToBoard(config: LeagueConfig): BoardKey {
  const sf = config.roster.SUPERFLEX > 0;
  const rec = config.scoring.rec;
  const nearest = [0, 0.5, 1].reduce((a, b) =>
    Math.abs(b - rec) < Math.abs(a - rec) ? b : a,
  );
  if (nearest === 1) return sf ? "half-superflex" : "ppr";
  if (nearest === 0.5) return sf ? "half-superflex" : "half";
  return sf ? "superflex" : "standard";
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The superflex boards omit kickers and defenses entirely.
 *
 * Reading a superflex league straight off that board therefore drops both
 * positions from the screen AND from the printed sheet — a superflex drafter
 * would take a sheet to their draft with no kicker on it. Superflex changes
 * what a second quarterback is worth and nothing whatsoever about a kicker, so
 * those two positions are read off the matching non-superflex board.
 */
const NON_SUPERFLEX: Partial<Record<BoardKey, BoardKey>> = {
  superflex: "standard",
  "half-superflex": "half",
};

export function boardFor(key: BoardKey, player: Player): BoardKey {
  if (player.ecr[key] != null) return key;
  const base = NON_SUPERFLEX[key];
  return base && player.ecr[base] != null ? base : key;
}

/**
 * The bounded positional offset. Negative moves a position UP the board.
 * Returns 0 for every position when the league matches BASELINE.
 */
export function positionOffsets(
  config: LeagueConfig,
  board: BoardKey = snapToBoard(config),
): Record<Position, number> {
  const baseline = baselineFor(board);
  const out = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const base = demand(pos, baseline.teams, baseline.roster);
    const league = demand(pos, config.teams, config.roster);
    // A position nobody starts (K or DST switched off) drops to the floor
    // rather than dividing by zero.
    if (league <= 0) {
      out[pos] = base > 0 ? CAP : 0;
      continue;
    }
    if (base <= 0) {
      out[pos] = -CAP;
      continue;
    }
    // Demand is proportional to team count, so scale both sides to a per-team
    // basis: otherwise a 14-team league would shift every position identically,
    // which is not a positional effect at all.
    const perTeamBase = base / baseline.teams;
    const perTeamLeague = league / config.teams;
    out[pos] = K_SHIFT * Math.log(perTeamBase / perTeamLeague);
  }

  // Off-axis scoring. Negative moves a position up.
  out.TE -= K_TE_PREMIUM * (config.scoring.teRecBonus ?? 0);
  out.QB -= K_PASS_TD * ((config.scoring.passTd ?? 4) - 4);

  for (const pos of POSITIONS) out[pos] = clamp(out[pos], -CAP, CAP);
  return out;
}

/**
 * Recompute tiers by gap detection. Only used when the config is off-axis
 * enough that consensus tiers no longer describe the adjusted order.
 *
 * Deliberately NOT k-means: non-deterministic seeding means dragging a slider
 * to 1.0 and back does not return the same board, and a tier boundary that
 * jumps while you tune settings destroys trust in the whole artifact.
 */
function gapTiers(players: Player[], key: BoardKey): TierGroup[] {
  const vals = players.map((p) => p.ecr[boardFor(key, p)] ?? Number.MAX_SAFE_INTEGER);
  const drops: number[] = [];
  for (let i = 1; i < vals.length; i++) drops.push(vals[i] - vals[i - 1]);
  const sorted = [...drops].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
  const threshold = Math.max(3, median * 2.5);

  const out: TierGroup[] = [];
  let cur: Player[] = [];
  let tier = 1;
  for (let i = 0; i < players.length; i++) {
    if (cur.length >= 2 && i > 0 && vals[i] - vals[i - 1] > threshold) {
      out.push({ tier: tier++, players: cur, fromConsensus: false });
      cur = [];
    } else if (cur.length >= 8) {
      out.push({ tier: tier++, players: cur, fromConsensus: false });
      cur = [];
    }
    cur.push(players[i]);
  }
  if (cur.length) out.push({ tier, players: cur, fromConsensus: false });
  return out;
}

function consensusTiers(players: Player[], key: BoardKey): TierGroup[] {
  const byTier = new Map<number, Player[]>();
  for (const p of players) {
    const t = p.tier[boardFor(key, p)];
    if (t == null) continue;
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(p);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, ps]) => ({ tier, players: ps, fromConsensus: true }));
}

export interface BuildInput {
  players: Player[];
  adp?: Map<string, Adp>;
  config: LeagueConfig;
  prefs?: SheetPrefs;
  /** How deep each position column runs on screen. */
  depth?: number;
}

export function buildBoard({
  players,
  config,
  prefs,
  depth = 60,
}: BuildInput): BuiltBoard {
  const key = snapToBoard(config);
  const removed = new Set(prefs?.removed ?? []);

  // Removed players (keepers) drop out BEFORE replacement level is computed, so
  // keeping twenty players genuinely moves where each position runs dry. That
  // is the one thing a static printed sheet can never do.
  const pool = players.filter(
    (p) => !removed.has(p.id) && p.ecr[boardFor(key, p)] != null,
  );

  const offsets = positionOffsets(config, key);
  const offAxis = POSITIONS.some((p) => Math.abs(offsets[p]) > 0.5);

  const adjusted = new Map<string, number>();
  let maxDeparture = 0;
  for (const p of pool) {
    const ecr = p.ecr[boardFor(key, p)]!;
    const moved = clamp(ecr + offsets[p.pos], ecr - CAP, ecr + CAP);
    adjusted.set(p.id, moved);
    maxDeparture = Math.max(maxDeparture, Math.abs(moved - ecr));
  }

  const overall = [...pool].sort((a, b) => {
    const d = adjusted.get(a.id)! - adjusted.get(b.id)!;
    // Ties break on consensus, never on anything we invented.
    return d !== 0 ? d : (a.ecr[boardFor(key, a)]! - b.ecr[boardFor(key, b)]!);
  });

  const columns: BoardColumn[] = POSITIONS.map((pos) => {
    const inPos = overall.filter((p) => p.pos === pos).slice(0, depth);
    return {
      pos,
      tiers: offAxis ? gapTiers(inPos, key) : consensusTiers(inPos, key),
      replacement: replacementRank(pos, config.teams, config.roster),
    };
  }).filter((c) => c.tiers.length > 0);

  return { board: key, columns, overall, maxDeparture };
}
