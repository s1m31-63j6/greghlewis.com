import type { Game, Player } from "@/lib/start-sit/types";

/** "Sun 1:00 pm ET" in the viewer's terms, from a UTC kickoff. */
export function kickoffLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/New_York" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  }).format(d).toLowerCase().replace(" ", " ");
  return `${day} ${time} ET`;
}

export function matchup(p: Player): string {
  if (!p.opp) return "Bye";
  return `${p.home ? "vs" : "at"} ${p.opp}`;
}

export function teamTotal(p: Player, games: Map<string, Game>): number | null {
  const g = p.game ? games.get(p.game) : undefined;
  if (!g) return null;
  return p.home ? g.homeTotal : g.awayTotal;
}

export function pts(n: number): string {
  return n.toFixed(1);
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export const COVERAGE_LABEL: Record<Player["coverage"], string> = {
  full: "",
  partial: "partly priced",
  "td-only": "TD line only",
  none: "no line",
  bye: "bye",
  played: "already played",
};
