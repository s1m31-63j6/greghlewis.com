/**
 * odds-shape.mts — the published artifacts are numbers a page can trust.
 *
 * Every line has a finite expectation inside a plausible distance of its
 * market line; every touchdown rate is a rate; every priced player is on a team
 * in a game this week; every game's implied team totals add to its total; and
 * the publisher's own sanity check actually ran.
 *
 * Run: npm run start-sit:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const DIR = join(ROOT, "public", "start-sit");
const raw = (f: string) => readFileSync(join(DIR, f), "utf8");
const read = (f: string) => JSON.parse(raw(f));

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const players: any[] = read("players.json").players;
const games: any[] = read("games.json").games;
const meta = read("meta.json");

console.log("\nArtifacts");
for (const f of ["players.json", "games.json", "meta.json"]) {
  check(`${f} carries no NaN or Infinity`, !/\bNaN\b|Infinity/.test(raw(f)));
}
check("meta.sanity.ran", meta.sanity?.ran === true);
const fs = meta.sanity?.fantasyScore;
check(`books' fantasy-score line agrees: n=${fs?.n} r=${fs?.r} gap=${fs?.meanGap}`,
  !!fs && (meta.counts.books === 0 || (fs.n >= 50 && fs.r >= 0.98 && Math.abs(fs.meanGap) <= 0.5)));
check(`week ${meta.week} is a regular-season week`, meta.week >= 1 && meta.week <= 18);
check(`${games.length} games`, games.length >= 13 && games.length <= 16);

console.log("\nGames");
const gameIds = new Set(games.map((g) => g.id));
let totalsOk = 0;
for (const g of games) {
  if (g.total == null || g.spread == null) continue;
  const ok =
    g.total >= 30 && g.total <= 65 && Math.abs(g.spread) <= 21 &&
    Math.abs(g.homeTotal + g.awayTotal - g.total) < 0.11;
  if (ok) totalsOk++;
  else check(`${g.id} line is sane`, false, JSON.stringify([g.spread, g.total, g.homeTotal, g.awayTotal]));
}
check(`${totalsOk} games with implied team totals that add up`, totalsOk >= games.length - 2);

console.log("\nPlayers");
const priced = players.filter((p) => Object.keys(p.stats).length > 0);
check(`${priced.length} priced players`, priced.length >= 120);
let badLine = 0, badTd = 0, badGame = 0, badTier = 0, badCoverage = 0;
const VALID = new Set(["full", "partial", "td-only", "none", "bye", "played"]);
for (const p of players) {
  if (!VALID.has(p.coverage)) badCoverage++;
  if (p.game && !gameIds.has(p.game)) badGame++;
  if (p.game) {
    const g = games.find((x) => x.id === p.game);
    if (g && p.team !== g.home && p.team !== g.away) badGame++;
  }
  for (const [k, s] of Object.entries<any>(p.stats)) {
    if (!["book", "dfs"].includes(s.tier)) badTier++;
    if (k === "td") {
      if (!(s.p > 0 && s.p < 0.95 && s.lambda > 0 && s.lambda < 2.5 && s.books >= 1)) badTd++;
      continue;
    }
    const finite = [s.line, s.ev, s.sd].every(Number.isFinite);
    if (!finite || s.sd <= 0 || s.books < 1 || Math.abs(s.ev - s.line) > 1.5 * s.sd) badLine++;
  }
}
check("every coverage value is known", badCoverage === 0, `${badCoverage} bad`);
check("every priced player is in a game this week, on one of its teams", badGame === 0, `${badGame} bad`);
check("every line is finite with sd > 0 and |ev − line| ≤ 1.5·sd", badLine === 0, `${badLine} bad`);
check("every touchdown rate is in range", badTd === 0, `${badTd} bad`);
check("every tier is book or dfs", badTier === 0, `${badTier} bad`);

const dupes = new Map<string, number>();
for (const p of players) dupes.set(`${p.name}|${p.team}`, (dupes.get(`${p.name}|${p.team}`) ?? 0) + 1);
check("no two players share a name and team", [...dupes.values()].every((n) => n === 1));

const full = players.filter((p) => p.coverage === "full").length;
check(`${full} players fully priced`, full >= 60);
const byPos = new Map<string, number>();
for (const p of priced) byPos.set(p.pos, (byPos.get(p.pos) ?? 0) + 1);
check(`priced by position ${JSON.stringify(Object.fromEntries(byPos))}`,
  (byPos.get("QB") ?? 0) >= 12 && (byPos.get("RB") ?? 0) >= 25 && (byPos.get("WR") ?? 0) >= 40 && (byPos.get("TE") ?? 0) >= 12);

console.log(failures === 0 ? "\nodds-shape: all checks passed\n" : `\nodds-shape: ${failures} FAILURES\n`);
process.exit(failures === 0 ? 0 : 1);
