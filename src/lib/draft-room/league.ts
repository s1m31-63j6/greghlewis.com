// One-time league setup for the hidden draft room. Keepers were transcribed
// from the league's Google Sheet on 2026-09-08 and resolved to draft-sheet
// player ids (public/draft-sheet/players.json). Draft order is the sheet's
// left-to-right, top-to-bottom order.

export const LEAGUE_ID = "2026-yahoo-redo";
export const TEAMS = ["Grey", "Bray", "Greg", "Dean", "David", "Landon", "Nathan", "Paul"] as const;
export type Team = (typeof TEAMS)[number];
export const ROUNDS = 8;
export const TOTAL_PICKS = ROUNDS * TEAMS.length;
export const POOL_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

export const KEEPERS: Record<Team, string[]> = {
  Grey: ["19196", "19211", "20130", "19222", "23106", "22955", "23160"],
  Bray: ["17233", "26148", "19202", "18218", "23062", "24209", "19790"],
  Greg: ["23084", "23021", "15514", "19236", "23064", "23072", "25247"],
  Dean: ["17298", "25989", "22982", "23113", "22916", "19210", "25391"],
  David: ["16393", "25395", "22963", "25409", "25417", "12123", "27016"],
  Landon: ["22958", "22968", "20111", "26122", "22739", "25324", "26006"],
  Nathan: ["23133", "23070", "23163", "23886", "19245", "22978", "23781"],
  Paul: ["23059", "19217", "19799", "17265", "25981", "26434", "27050"],
};

export const KEPT_IDS = new Set(Object.values(KEEPERS).flat());

export const isTeam = (s: unknown): s is Team => TEAMS.includes(s as Team);

/** Snake: even rounds run left to right, odd rounds run back. */
export function pickOwner(index: number): Team {
  const round = Math.floor(index / TEAMS.length);
  const slot = index % TEAMS.length;
  return round % 2 === 0 ? TEAMS[slot] : TEAMS[TEAMS.length - 1 - slot];
}
