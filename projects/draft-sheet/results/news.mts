/**
 * news.mts — assert the headline wire is honest about who it is describing.
 *
 * This is the only place in the project that attaches free text written by
 * somebody else to a named player, which makes it the only place where being
 * wrong is a libel-shaped problem rather than a ranking-shaped one. A headline
 * about a linebacker filed under a running back of the same surname is worse
 * than no headline at all, so the matcher's own claim is re-tested here against
 * the published artifact: every item must literally contain the name of the
 * player it is filed under.
 *
 * It also guards the quiet failure. The wires are RSS, and an RSS feed that
 * stops answering does not error — it returns nothing, and nothing looks
 * exactly like a slow news day.
 *
 * Run: npm run draft-sheet:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (f: string) =>
  JSON.parse(readFileSync(join(ROOT, "public", "draft-sheet", f), "utf8"));

const wire = read("news.json");
const players: any[] = read("players.json").players;
const byId = new Map(players.map((p) => [p.id, p]));

const entries = wire.news as Record<string, { headline: string; url: string; source: string; ts: string }[]>;
const items = Object.entries(entries).flatMap(([pid, list]) => list.map((i) => ({ pid, ...i })));

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

console.log("\nHeadline wire");

check("the file has headlines at all", items.length > 0, `${items.length}`);
check(`at least two wires answered`, (wire.wiresLive ?? 0) >= 2, `${wire.wiresLive} live`);
check("every source is named", wire.sources?.length > 0);

// THE ONE THAT MATTERS. The matcher claims a headline is about this player;
// the only defensible evidence for that is his name being in it.
const misfiled = items.filter((i) => {
  const p = byId.get(i.pid);
  return !p || !i.headline.includes(p.name);
});
check("every headline names the player it is filed under", misfiled.length === 0,
  misfiled.slice(0, 3).map((i) => `${byId.get(i.pid)?.name ?? i.pid}: "${i.headline.slice(0, 50)}"`).join(" | "));

// A defence is named after its team, so it matches every headline about the
// team. That was a real bug, and this is what stops it coming back.
const defences = Object.keys(entries).filter((pid) => byId.get(pid)?.pos === "DST");
check("no team defences carrying team news", defences.length === 0,
  defences.map((d) => byId.get(d)?.name).join(" "));

const unranked = Object.keys(entries).filter((pid) => {
  const ecr = byId.get(pid)?.ecr ?? {};
  return !Object.values(ecr).some((v) => v !== null);
});
check("every player with news is rankable", unranked.length === 0, `${unranked.length}`);

const badUrl = items.filter((i) => !/^https:\/\//.test(i.url));
check("every item links out over https", badUrl.length === 0, `${badUrl.length}`);

const dupes = Object.entries(entries).filter(([, list]) => new Set(list.map((i) => i.url)).size !== list.length);
check("no player carries the same link twice", dupes.length === 0, dupes.map(([p]) => p).join(" "));

const over = Object.entries(entries).filter(([, list]) => list.length > 4);
check("nobody exceeds the four-item cap", over.length === 0, over.map(([p]) => p).join(" "));

const cutoff = Date.now() - (wire.windowDays + 1) * 86_400_000;
const stale = items.filter((i) => Date.parse(i.ts) < cutoff);
check(`nothing older than the ${wire.windowDays}-day window`, stale.length === 0, `${stale.length}`);

// Headlines only. If a body ever starts arriving we are republishing somebody
// else's work rather than pointing at it, and that is a licence question.
const essay = items.filter((i) => i.headline.length > 220);
check("headlines are headlines, not article bodies", essay.length === 0, `${essay.length}`);

const bySource = new Map<string, number>();
for (const i of items) bySource.set(i.source, (bySource.get(i.source) ?? 0) + 1);
console.log(`\n  ${items.length} headlines across ${Object.keys(entries).length} players`);
console.log(`  ${[...bySource].map(([s, n]) => `${s} ${n}`).join(" · ")}`);

console.log(failures === 0 ? "\nnews: all checks passed\n" : `\nnews: ${failures} FAILURES\n`);
process.exit(failures === 0 ? 0 : 1);
