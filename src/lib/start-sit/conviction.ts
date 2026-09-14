/**
 * How firm a line is.
 *
 * Two signals the feed carries: how many books post the line and how tightly
 * they agree, and how far the consensus has moved since it opened. A line
 * five or more books agree on within a unit, that has not moved a unit, is
 * `firm`. A line that has moved a unit or more is `moving`, and the direction
 * is the market's conviction. One or two books is `thin`. A pick'em line is
 * its own thing and stays labeled `pick'em`.
 *
 * Units are one "unit of the stat": three yards, half a reception, a carry,
 * and a fifth of a passing touchdown or interception.
 */

import type { StatKey, StatLine, TdLine } from "./types.ts";

export type Conviction = "firm" | "moving" | "thin" | "pickem";

export const UNIT: Record<StatKey, number> = {
  pass_yds: 10, pass_tds: 0.2, ints: 0.2, rush_yds: 3, rush_att: 1, rec: 0.5, rec_yds: 3,
};
export const FIRM_BOOKS = 5;
/** Agreement across books must be inside this many units to call a line firm. */
export const AGREE_UNITS = 1;
/** Movement since open of at least this many units marks a line as moving. */
export const MOVE_UNITS = 1;
/** Touchdown probability spread across books that still counts as agreement. */
export const TD_AGREE = 0.12;

export interface Firmness {
  kind: Conviction;
  /** Movement since open in stat units, signed; null when unknown. */
  move: number | null;
  books: number;
}

export function firmness(key: StatKey, s: StatLine): Firmness {
  if (s.tier === "dfs") return { kind: "pickem", move: null, books: s.books };
  const unit = UNIT[key];
  const move = s.move == null ? null : s.move;
  if (move != null && Math.abs(move) >= MOVE_UNITS * unit) return { kind: "moving", move, books: s.books };
  if (s.books >= FIRM_BOOKS && s.agree != null && s.agree <= AGREE_UNITS * unit) return { kind: "firm", move, books: s.books };
  if (s.books <= 2) return { kind: "thin", move, books: s.books };
  return { kind: "thin", move, books: s.books };
}

export function tdFirmness(t: TdLine): Firmness {
  if (t.tier === "dfs") return { kind: "pickem", move: null, books: t.books };
  if (t.books >= FIRM_BOOKS && t.agree != null && t.agree <= TD_AGREE) return { kind: "firm", move: null, books: t.books };
  return { kind: "thin", move: null, books: t.books };
}

export function summarize(stats: Partial<Record<StatKey, StatLine>> & { td?: TdLine }): Record<Conviction, number> {
  const out: Record<Conviction, number> = { firm: 0, moving: 0, thin: 0, pickem: 0 };
  for (const [k, s] of Object.entries(stats)) {
    const f = k === "td" ? tdFirmness(s as TdLine) : firmness(k as StatKey, s as StatLine);
    out[f.kind] += 1;
  }
  return out;
}
