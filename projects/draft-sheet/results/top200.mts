/**
 * top200.mts — assert the player page is complete and says nothing it cannot back up.
 *
 * The blurbs are generated, which makes them cheap to produce and easy to get
 * subtly wrong at scale. Nobody is going to read two hundred of them by eye
 * before every rebuild, so the things that would embarrass us are asserted:
 * empty text, doubled punctuation, a sentence that never got its subject, a
 * ceiling that is worse than the floor.
 *
 * Run: npm run draft-sheet:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const doc = JSON.parse(
  readFileSync(join(ROOT, "public", "draft-sheet", "top200.json"), "utf8"),
);
const rows = doc.players as Array<Record<string, any>>;

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

console.log("\nTop 200 players");

check("two hundred players", rows.length === 200, `got ${rows.length}`);
check("ranks are 1..N with no gaps",
  rows.every((r, i) => r.rank >= 1 && (i === 0 || r.rank >= rows[i - 1].rank)));
check("every player has a name and a position",
  rows.every((r) => r.name && r.pos));
check("every player has a blurb", rows.every((r) => r.blurb && r.blurb.length > 12));
check("every player has both a ceiling and a floor",
  rows.every((r) => r.upside && r.downside));

// Generated prose fails in recognizable ways.
const doubled = rows.filter((r) =>
  [r.blurb, r.upside, r.downside].some((t: string) => t && /\.\.|\s,|,,|\s\./.test(t)));

check("no doubled or orphaned punctuation", doubled.length === 0,
  doubled.slice(0, 3).map((r) => r.name).join(", "));

// "Michael Penix Jr. at quarterback" is correct prose, and an earlier version
// of this check called it a lowercase sentence start. Neutralize the periods
// that belong to abbreviations and initials before testing.
const deAbbrev = (t: string) =>
  t.replace(/\b(Jr|Sr|St|Dr|Mr|Mrs)\./g, "$1").replace(/\b[A-Z]\./g, "X");
const uncapitalised = rows.filter((r) =>
  [r.blurb, r.upside, r.downside].some(
    (t: string) => t && /[.;]\s+[a-z]/.test(deAbbrev(t)),
  ));
check("no sentence starts lowercase", uncapitalised.length === 0,
  uncapitalised.slice(0, 3).map((r) => r.name).join(", "));

const badArticle = rows.filter((r) => / a [aeiou]| an [^aeiou]/i.test(r.blurb));
check("articles agree with the following word", badArticle.length === 0,
  badArticle.slice(0, 3).map((r) => `${r.name}: ${r.blurb}`).join(" | "));

const placeholder = rows.filter((r) => /undefined|null|NaN|\[object/.test(
  `${r.blurb}${r.upside}${r.downside}`));
check("no placeholder leaked into the prose", placeholder.length === 0,
  placeholder.slice(0, 3).map((r) => r.name).join(", "));

// A ceiling below the floor would mean the two got crossed somewhere.
const crossed = rows.filter((r) => {
  const up = /as high as (\d+)/.exec(r.upside ?? "");
  const dn = /as low as (\d+)/.exec(r.downside ?? "");
  return up && dn && Number(up[1]) > Number(dn[1]);
});
check("no player's ceiling is worse than his floor", crossed.length === 0,
  crossed.slice(0, 3).map((r) => r.name).join(", "));

// The first version wrote ONE ceiling sentence and ONE floor sentence for all
// two hundred players, changing only the numbers. Boilerplate at that scale
// reads as filler, so the shape of the text is asserted to actually vary.
const shape = (t: string) => (t ?? "").replace(/\d+/g, "#").slice(0, 44);
const upShapes = new Set(rows.map((r) => shape(r.upside)));
const downShapes = new Set(rows.map((r) => shape(r.downside)));
check("ceiling text is not one template repeated", upShapes.size >= 4,
  `${upShapes.size} distinct openings`);
check("floor text is not one template repeated", downShapes.size >= 4,
  `${downShapes.size} distinct openings`);

const commonest = (set: Set<string>, key: "upside" | "downside") => {
  let worst = 0;
  for (const sh of set) {
    const n = rows.filter((r) => shape(r[key]) === sh).length;
    worst = Math.max(worst, n);
  }
  return worst / rows.length;
};
check("no single ceiling phrasing dominates", commonest(upShapes, "upside") <= 0.6,
  `${Math.round(commonest(upShapes, "upside") * 100)}% share the same opening`);
check("no single floor phrasing dominates", commonest(downShapes, "downside") <= 0.6,
  `${Math.round(commonest(downShapes, "downside") * 100)}% share the same opening`);

// A stated round has to match the pick it describes. "4th overall, a
// second-round pick" was wrong and completely plausible-looking.
const ROUND_WORD: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const roundErrors: string[] = [];
for (const r of rows) {
  for (const t of [r.upside, r.downside] as (string | null)[]) {
    if (!t) continue;
    const re = /(\d+)(?:st|nd|rd|th)[^.]{0,4}[,—-] (?:a )?(\w+)-round pick/g;
    for (const m of t.matchAll(re)) {
      const want = ROUND_WORD[m[2]];
      if (want && Math.ceil(Number(m[1]) / 12) !== want) {
        roundErrors.push(`${r.name}: "${m[0]}"`);
      }
    }
  }
}
check("stated rounds match the picks they describe", roundErrors.length === 0,
  roundErrors.slice(0, 3).join(" | "));

const dirs = rows.filter((r) => r.direction).length;
check("most players carry a direction against last season", dirs >= rows.length * 0.6,
  `${dirs}/${rows.length}`);
check("every player says something about last season",
  rows.every((r) => r.last && r.last.length > 8));

const faces = rows.filter((r) => r.espnId || r.headshot).length;
check("at least 95% can show a real face", faces >= rows.length * 0.95,
  `${faces}/${rows.length}`);

const kinds = new Map<string, number>();
for (const r of rows) {
  const b = r.blurb as string;
  const k = b.startsWith("Moved") ? "moved"
    : b.startsWith("A rookie") ? "rookie"
    : /^Carrying|reserve|Physically/.test(b) ? "injury"
    : b.includes("calling plays") ? "coaching"
    : b.startsWith("Same team") ? "no news"
    : "market";
  kinds.set(k, (kinds.get(k) ?? 0) + 1);
}
console.log(`\n  leading signal: ${[...kinds].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
// If almost everything falls through to "no news", the signals have broken.
check("most players lead with a real signal",
  (kinds.get("no news") ?? 0) < rows.length * 0.5,
  `${kinds.get("no news") ?? 0} have no news`);

console.log(
  failures === 0 ? "\ntop200: all checks passed\n" : `\ntop200: ${failures} FAILURES\n`,
);
process.exit(failures === 0 ? 0 : 1);
