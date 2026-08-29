/**
 * import.mts — Sleeper league-settings mapping.
 *
 * The mapping is where an import goes quietly wrong: a superflex read as a
 * plain flex, or an IDP slot counted as a starter, produces a board that is
 * confidently wrong for exactly the leagues that most needed a custom sheet.
 *
 * Run: npm run draft-sheet:check
 */

import { toConfig, looksLikeLeagueId, describe } from "../../../src/lib/draft-sheet/import-sleeper.ts";
import type { SleeperLeague } from "../../../src/lib/draft-sheet/import-sleeper.ts";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

const league = (
  name: string,
  rosters: number,
  positions: string[],
  scoring: Record<string, number>,
): SleeperLeague => ({
  league_id: "1", name, season: "2026",
  total_rosters: rosters, roster_positions: positions, scoring_settings: scoring,
});

console.log("\nSleeper import mapping");

{
  const c = toConfig(league("Standard 12", 12,
    ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "K", "DEF",
     "BN", "BN", "BN", "BN", "BN", "BN"],
    { rec: 0.5, pass_td: 4 }));
  check("conventional league maps exactly",
    c.teams === 12 && c.roster.QB === 1 && c.roster.RB === 2 && c.roster.WR === 3 &&
    c.roster.TE === 1 && c.roster.FLEX === 1 && c.roster.K === 1 && c.roster.DST === 1 &&
    c.roster.BENCH === 6 && c.scoring.rec === 0.5 && c.scoring.passTd === 4,
    describe(c));
}

{
  const c = toConfig(league("Superflex", 10,
    ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "BN"],
    { rec: 1, pass_td: 6 }));
  check("SUPER_FLEX becomes superflex, not another flex",
    c.roster.SUPERFLEX === 1 && c.roster.FLEX === 1 && c.scoring.passTd === 6,
    describe(c));
}

{
  // IDP slots are real starters but this sheet ranks no defensive players, so
  // they must be dropped rather than silently inflating flex demand.
  const c = toConfig(league("IDP", 12,
    ["QB", "RB", "WR", "WR", "TE", "FLEX", "DL", "LB", "LB", "DB", "IDP_FLEX",
     "BN", "BN", "IR", "TAXI"],
    { rec: 1 }));
  check("IDP slots are dropped, not counted as flex",
    c.roster.FLEX === 1 && c.roster.BENCH === 2,
    describe(c));
  check("IR and TAXI never count as bench", c.roster.BENCH === 2);
}

{
  const c = toConfig(league("TE premium", 12,
    ["QB", "RB", "RB", "WR", "WR", "TE", "REC_FLEX", "BN"],
    { rec: 0.5, bonus_rec_te: 0.5 }));
  check("bonus_rec_te becomes a TE premium",
    c.scoring.teRecBonus === 0.5 && c.roster.FLEX === 1, describe(c));
}

{
  const c = toConfig(league("Sparse", 8, ["QB", "RB", "WR"], {}));
  check("missing scoring falls back to defaults rather than zero",
    c.scoring.rec === 0.5 && c.scoring.passTd === 4, describe(c));
  check("a league with no bench does not invent one", c.roster.BENCH === 0);
}

{
  check("a long digit string reads as a league id", looksLikeLeagueId("1048112194440777728"));
  check("a username does not", !looksLikeLeagueId("greglewis"));
  check("a short number does not", !looksLikeLeagueId("12345"));
}

console.log(
  failures === 0 ? "\nimport: all checks passed\n" : `\nimport: ${failures} FAILURES\n`,
);
process.exit(failures === 0 ? 0 : 1);
