/**
 * The share link: `?p=<id>,<id>&s=<rec>-<passTd>`.
 */

import type { Scoring } from "./types.ts";
import { DEFAULT_SCORING, MAX_PICKS } from "./types.ts";

export function encodeState(ids: (string | null)[], s: Scoring): string {
  const q = new URLSearchParams();
  const picks = ids.filter((x): x is string => !!x);
  if (picks.length) q.set("p", picks.join(","));
  q.set("s", `${s.rec}-${s.passTd}`);
  return q.toString();
}

export function decodeState(search: string): { ids: string[]; scoring: Scoring } {
  const q = new URLSearchParams(search);
  const ids = (q.get("p") ?? "").split(",").filter((x) => /^\d+$/.test(x)).slice(0, MAX_PICKS);
  const [rec, passTd] = (q.get("s") ?? "").split("-").map(Number);
  const scoring: Scoring = {
    rec: rec === 0 || rec === 0.5 || rec === 1 ? rec : DEFAULT_SCORING.rec,
    passTd: passTd === 4 || passTd === 6 ? passTd : DEFAULT_SCORING.passTd,
  };
  return { ids, scoring };
}
