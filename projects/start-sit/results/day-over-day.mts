/**
 * day-over-day.mts — the gate that makes an unattended run trustworthy.
 *
 * Same idea as the draft sheet's: every other gate checks one run against
 * itself, and all of them pass on a run where a feed quietly served last
 * week's lines or half its usual payload. This compares the fresh artifacts
 * against the last committed ones, read out of git.
 *
 * FAIL means: commit nothing, keep the last lines live, open an issue.
 *
 * --require-baseline forbids the bootstrap path; the scheduled runner always
 * passes it. The assertion counter at the end guards against a baseline lookup
 * that silently failed and disarmed every comparison.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { components } from "../../../src/lib/start-sit/scoring.ts";
import type { Player } from "../../../src/lib/start-sit/types.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const DIR = "public/start-sit";
const REQUIRE_BASELINE = process.argv.includes("--require-baseline");

/** Same week: this share of yesterday's priced players must still be priced. */
const PRICED_FLOOR = 0.8;
/** Same week: of yesterday's top 50 by PPR points, how many must still be there. */
const TOP50_MIN_OVERLAP = 40;
/** Sportsbooks must not quietly drop out once they are live. */
const BOOKS_FLOOR = 4;
/** A full run with a baseline makes 10 assertions; a disarmed one makes 4. */
const MIN_ASSERTIONS_WITH_BASELINE = 9;

let failures = 0;
let assertions = 0;
function check(label: string, ok: boolean, detail = ""): void {
  assertions++;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

const current = <T,>(f: string): T => JSON.parse(readFileSync(join(ROOT, DIR, f), "utf8")) as T;
function previous<T>(f: string): T | null {
  try {
    const raw = execFileSync("git", ["show", `HEAD:${DIR}/${f}`], {
      cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
function identicalToHead(f: string): boolean {
  try {
    const raw = execFileSync("git", ["show", `HEAD:${DIR}/${f}`], {
      cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
    });
    return raw === readFileSync(join(ROOT, DIR, f), "utf8");
  } catch {
    return false;
  }
}

interface Meta {
  built: string; builtAt: string; week: number;
  counts: Record<string, number>;
  freshness?: { sleeperLines?: number; sgoFetchedAt?: string | null };
}
const meta = current<Meta>("meta.json");
const now = current<{ players: Player[] }>("players.json").players;
const metaWas = previous<Meta>("meta.json");
const was = previous<{ players: Player[] }>("players.json")?.players ?? null;
const firstRun = was === null || metaWas === null;
const PPR = { rec: 1 as const, passTd: 4 as const };
const priced = (ps: Player[]) => ps.filter((p) => Object.keys(p.stats).length > 0);
const top50 = (ps: Player[]) =>
  priced(ps).map((p) => ({ id: p.id, m: components(p, PPR).mean }))
    .sort((a, b) => b.m - a.m).slice(0, 50).map((x) => x.id);

console.log("\n1. This run");
check("build date is today", meta.built === new Date().toISOString().slice(0, 10), `meta.built=${meta.built}`);
check(`${priced(now).length} priced players`, priced(now).length >= 120);

console.log("\n2. Against the last good run");
if (firstRun) {
  check("a baseline exists to compare against", !REQUIRE_BASELINE,
    REQUIRE_BASELINE ? "no previous commit for public/start-sit — the scheduled run requires one" : "first run, comparisons skipped");
} else {
  check(`week ${meta.week} follows week ${metaWas.week}`,
    meta.week === metaWas.week || meta.week === metaWas.week + 1);
  check("builtAt advanced", meta.builtAt > metaWas.builtAt, `${metaWas.builtAt} → ${meta.builtAt}`);
  if (meta.week === metaWas.week) {
    // A game that kicked off since the last run takes its players with it:
    // Friday's snapshot legitimately loses Thursday night's slate. Compare
    // against yesterday's players whose games are still open today.
    const playedNow = new Set(now.filter((p) => p.coverage === "played").map((p) => p.game));
    const wasOpen = was.filter((p) => !playedNow.has(p.game));
    const ratio = priced(now).length / Math.max(1, priced(wasOpen).length);
    check(`priced ${priced(now).length} (was ${priced(wasOpen).length} in games still open)`, ratio >= PRICED_FLOOR,
      `${(ratio * 100).toFixed(0)}% of last run, floor ${PRICED_FLOOR * 100}%`);
    const a = new Set(top50(now));
    const overlap = top50(wasOpen).filter((id) => a.has(id)).length;
    check(`top 50 overlaps the last run by ${overlap}`, overlap >= TOP50_MIN_OVERLAP, `minimum ${TOP50_MIN_OVERLAP}`);
    // Lines move every day. Byte-identical output with a newer source stamp
    // means the fetch handed us something cached.
    const frozen = identicalToHead("players.json");
    const moved = (meta.freshness?.sleeperLines ?? 0) > (metaWas.freshness?.sleeperLines ?? 0)
      || (meta.freshness?.sgoFetchedAt ?? "") > (metaWas.freshness?.sgoFetchedAt ?? "");
    if (frozen && moved) {
      check("players.json moved, because the sources did", false, "sources advanced and the output is byte-identical");
    } else if (frozen) {
      console.log("  --    players.json unchanged, and so are the sources — a genuine no-op");
      assertions++;
    } else {
      check("players.json changed since the last run", true);
    }
  } else {
    // A new week: the slate turns over, so only the shape is comparable.
    check("new week still prices a full slate", priced(now).length >= 120);
    check("new week has games", (meta.counts.games ?? 0) >= 13);
    assertions++;
  }
  const booksWas = metaWas.counts.books ?? 0;
  check(`sportsbook books ${meta.counts.books} (was ${booksWas})`,
    booksWas === 0 || (meta.counts.books ?? 0) >= Math.min(BOOKS_FLOOR, booksWas),
    "the sportsbook tier thinned out or disappeared");
}

if (!firstRun && assertions < MIN_ASSERTIONS_WITH_BASELINE) {
  failures++;
  console.log(`\n  FAIL  only ${assertions} assertions ran, expected at least ${MIN_ASSERTIONS_WITH_BASELINE}`);
}
console.log(failures === 0
  ? `\nday-over-day: ${assertions} checks passed\n`
  : `\nday-over-day: ${failures} FAILURE${failures > 1 ? "S" : ""} — publishing nothing\n`);
process.exit(failures === 0 ? 0 : 1);
