/**
 * day-over-day.mts — the gate that makes an unattended run trustworthy.
 *
 * Every other harness in this directory checks ONE RUN AGAINST ITSELF: does the
 * board reproduce consensus, do the joins attach, is the prose well formed. All
 * of those pass happily on a run where a feed quietly served last week's numbers,
 * or returned half its usual payload, or changed shape enough to parse into
 * garbage. Nobody is watching a 3am cron, so those have to be caught here.
 *
 * This compares the freshly built artifacts against the LAST GOOD ONES, read
 * straight out of git. On the first run there is no previous commit, and that is
 * reported and skipped rather than failed — a first run has nothing to regress
 * against.
 *
 * FAIL means: commit nothing, keep yesterday's data live, open an issue. Stale
 * but correct beats fresh but wrong on a sheet people draft from.
 *
 * The thresholds below were calibrated on a single day. Once a few runs have
 * accumulated, look at how much each feed actually moves overnight and tighten
 * them — a threshold set from one sample is a guess with a number on it.
 *
 * Run: npm run draft-sheet:drift   (or as part of draft-sheet:daily)
 *
 * Pass --require-baseline to forbid the bootstrap path. The scheduled runner
 * always passes it. A gate that no-ops when its own baseline lookup fails is
 * worse than no gate, because it reports green: a detached HEAD, a shallow
 * clone or a renamed path would disarm every comparison below and nothing
 * would say so. The assertion counter at the end is the second half of that
 * insurance.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const DIR = "public/draft-sheet";

/** Days a source's own timestamp may lag the run before we stop trusting it. */
const MAX_SOURCE_AGE_DAYS = 3;
/** A source may lose this much of its row count overnight before it is a failure. */
const VOLUME_FLOOR = 0.8;
/** Below this, a drop is worth printing but not worth stopping for. */
const VOLUME_WARN = 0.95;
/** The consensus pool is steadier than any single feed, so it is held tighter. */
const POOL_FLOOR = 0.9;
/** Of the top 50, how many must still be there tomorrow. */
const TOP50_MIN_OVERLAP = 45;

const REQUIRE_BASELINE = process.argv.includes("--require-baseline");

let failures = 0;
let warnings = 0;
let assertions = 0;
/**
 * Below this, the gate did not actually run and must not report success.
 * A full run with a baseline makes 13 assertions; a run whose baseline lookup
 * silently failed makes 7. Twelve separates them with room for a check to be
 * added or removed without a false alarm.
 */
const MIN_ASSERTIONS_WITH_BASELINE = 12;

/**
 * `detail` prints in both states; `whenFailed` only when the check fails, for
 * the ones whose explanation reads as an alarm on a passing line.
 */
function check(label: string, ok: boolean, detail = "", whenFailed = ""): void {
  assertions++;
  if (!ok) failures++;
  const tail = ok ? detail : [detail, whenFailed].filter(Boolean).join("; ");
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${tail ? `  — ${tail}` : ""}`);
}

function warn(label: string, ok: boolean, detail = ""): void {
  if (!ok) warnings++;
  console.log(`  ${ok ? "ok  " : "warn"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

function current<T>(file: string): T {
  return JSON.parse(readFileSync(join(ROOT, DIR, file), "utf8")) as T;
}

/** The previous committed version of an artifact, or null on the first run. */
function previous<T>(file: string): T | null {
  try {
    const raw = execFileSync("git", ["show", `HEAD:${DIR}/${file}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function identicalToHead(file: string): boolean {
  try {
    const raw = execFileSync("git", ["show", `HEAD:${DIR}/${file}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return raw === readFileSync(join(ROOT, DIR, file), "utf8");
  } catch {
    return false;
  }
}

/**
 * FantasyPros stamps "8/29" — no year, no timezone. Parsing that with Date.parse
 * would guess a year, and near New Year it would guess wrong. Resolve it against
 * the run date instead, and allow that a date a few days AHEAD of us is just a
 * timezone edge rather than a feed from the future.
 */
function ageInDaysOfMonthDay(stamp: string, now: Date): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(stamp.trim());
  if (!m) return null;
  const [, mo, da] = m;
  const year = now.getUTCFullYear();
  let then = Date.UTC(year, Number(mo) - 1, Number(da));
  // A stamp more than half a year ahead is last year's, not next year's.
  if (then - now.getTime() > 183 * 86_400_000) {
    then = Date.UTC(year - 1, Number(mo) - 1, Number(da));
  }
  return (now.getTime() - then) / 86_400_000;
}

function ageInDaysOfIso(stamp: string, now: Date): number | null {
  const t = Date.parse(`${stamp}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 86_400_000;
}

// ── load ─────────────────────────────────────────────────────────────────────

interface Meta {
  built: string;
  freshness?: {
    rankings?: string;
    adpWindowEnd?: string | null;
    adpDrafts?: number | null;
  };
}
interface AdpRow {
  id: string;
  raw: Record<string, number | null>;
}
interface PlayerRow { id: string; ecr: Record<string, number | null> }

const meta = current<Meta>("meta.json");
const adpNow = current<{ adp: AdpRow[] }>("adp.json").adp;
const playersNow = current<{ players: PlayerRow[] }>("players.json").players;

const adpWas = previous<{ adp: AdpRow[] }>("adp.json")?.adp ?? null;
const playersWas = previous<{ players: PlayerRow[] }>("players.json")?.players ?? null;
const metaWas = previous<Meta>("meta.json");
const firstRun = adpWas === null || playersWas === null;

// FantasyPros is a US site stamping Eastern dates, and the runner is on UTC. A
// job near midnight sees "tomorrow" in one zone and fires a spurious failure, so
// every M/D comparison is made against the Eastern date.
const easternToday = new Date(
  `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())}T00:00:00Z`,
);
const now = new Date();
const PLATFORMS = ["yahoo", "espn", "sleeper", "ffc"] as const;
const withAdp = (rows: AdpRow[], key: string) =>
  rows.filter((r) => (r.raw ?? {})[key] != null).length;

// ── 1. is the DATA fresh, as the sources themselves report it ────────────────

console.log("\n1. Source freshness");

const rankStamp = meta.freshness?.rankings;
if (!rankStamp) {
  check("rankings carry a source timestamp", false, "meta.freshness.rankings missing");
} else {
  const age = ageInDaysOfMonthDay(rankStamp, easternToday);
  // A stamp one day AHEAD is a timezone edge, not a feed from the future.
  check(
    `expert rankings stamped ${rankStamp}`,
    age !== null && age <= MAX_SOURCE_AGE_DAYS && age >= -1,
    age === null ? "unparseable" : `${age.toFixed(0)} days old, limit ${MAX_SOURCE_AGE_DAYS}`,
  );
}

const adpEnd = meta.freshness?.adpWindowEnd;
if (!adpEnd) {
  check("mock-draft pool carries a window", false, "meta.freshness.adpWindowEnd missing");
} else {
  const age = ageInDaysOfIso(adpEnd, easternToday);
  check(
    `mock-draft pool through ${adpEnd}`,
    age !== null && age <= MAX_SOURCE_AGE_DAYS && age >= -1,
    age === null ? "unparseable" : `${age.toFixed(0)} days old, limit ${MAX_SOURCE_AGE_DAYS}`,
  );
}

check(
  "build date is today",
  meta.built === now.toISOString().slice(0, 10),
  `meta.built=${meta.built}`,
);

// ── 2. did any feed quietly shrink ───────────────────────────────────────────

console.log("\n2. Volume against the last good run");

if (firstRun) {
  check(
    "a baseline exists to compare against",
    !REQUIRE_BASELINE,
    "",
    "no previous commit for public/draft-sheet — the scheduled run requires one",
  );
  console.log("  --    first run, comparisons skipped");
} else {
  for (const key of PLATFORMS) {
    const nowN = withAdp(adpNow, key);
    const wasN = withAdp(adpWas!, key);
    const ratio = wasN === 0 ? 1 : nowN / wasN;
    // The join-quality gate cannot see this: it measures attached over published,
    // so a feed that publishes half as much still scores a perfect rate.
    check(
      `${key.padEnd(8)} ${nowN} rows (was ${wasN})`,
      ratio >= VOLUME_FLOOR,
      `${(ratio * 100).toFixed(0)}% of yesterday, floor ${VOLUME_FLOOR * 100}%`,
    );
    if (ratio >= VOLUME_FLOOR) {
      warn(`${key.padEnd(8)} holding steady`, ratio >= VOLUME_WARN,
        `${(ratio * 100).toFixed(0)}% of yesterday`);
    }
  }

  const poolRatio = playersNow.length / playersWas!.length;
  check(
    `consensus pool ${playersNow.length} players (was ${playersWas!.length})`,
    poolRatio >= POOL_FLOOR,
    `${(poolRatio * 100).toFixed(0)}% of yesterday, floor ${POOL_FLOOR * 100}%`,
  );
}

// ── 3. does the board still look like yesterday's board ──────────────────────

console.log("\n3. Board stability");

if (firstRun) {
  console.log("  --    no previous commit to compare against; first run");
} else {
  const top = (rows: PlayerRow[]) =>
    rows
      .filter((p) => p.ecr.ppr != null)
      .sort((a, b) => (a.ecr.ppr as number) - (b.ecr.ppr as number))
      .slice(0, 50)
      .map((p) => p.id);
  const a = new Set(top(playersNow));
  const b = top(playersWas!);
  const overlap = b.filter((id) => a.has(id)).length;
  // A corrupted pull can be structurally perfect and obviously wrong to a human.
  // This is the check that looks at it the way a person would.
  check(
    `top 50 overlaps yesterday by ${overlap}`,
    overlap >= TOP50_MIN_OVERLAP,
    `minimum ${TOP50_MIN_OVERLAP}`,
  );
}

// ── 4. did anything actually move ────────────────────────────────────────────

console.log("\n4. Absolute tripwires (no baseline needed)");

// ESPN's ADP saturates: ~720 players share a value near 170, and adp_espn.py
// detects those buckets and nulls them. If that heuristic ever stops firing, a
// flood of fake ~170s pours into the mean and quietly wrecks the back half of
// the board. No existing gate catches it, because merge.py measures joins and
// not values.
const espnVals = adpNow.map((r) => (r.raw ?? {}).espn).filter((v): v is number => v != null);
check(
  `espn ADP kept for ${espnVals.length} players`,
  espnVals.length <= 400,
  "",
  "far more than expected — the clamp heuristic may have stopped firing",
);
check(
  `deepest espn ADP ${espnVals.length ? Math.max(...espnVals).toFixed(1) : "n/a"}`,
  espnVals.every((v) => v <= 200),
  "",
  "values past the clamp should have been discarded",
);

// If these two id sets ever diverge, publish.py's two record loops have drifted.
const adpIds = new Set(adpNow.map((r) => r.id));
check(
  "adp.json and players.json cover the same players",
  adpIds.size === playersNow.length && playersNow.every((p) => adpIds.has(p.id)),
  "",
  `${adpIds.size} adp rows vs ${playersNow.length} players — publish.py loops diverged`,
);

console.log("\n5. Movement");

if (firstRun) {
  console.log("  --    no previous commit to compare against; first run");
} else {
  // ADP moves every day through draft season. Byte-identical output means
  // something upstream handed us a cached response.
  // NOTE: compare the DATA files, never meta.json — `built` is today's date, so
  // meta.json differs every single day and a whole-directory byte comparison
  // would make this check dead code that looks like it works.
  //
  // AND identical output is only wrong if the INPUTS moved. Running twice in a
  // day legitimately produces the same board: these feeds publish about once a
  // day. Failing on that would mean a red run every time somebody reruns the
  // pipeline, and a gate that cries wolf daily gets ignored within a week —
  // which quietly disarms every other check in this file.
  const frozen = identicalToHead("adp.json");
  const sourcesMoved =
    metaWas != null &&
    (meta.freshness?.rankings !== metaWas.freshness?.rankings ||
      meta.freshness?.adpWindowEnd !== metaWas.freshness?.adpWindowEnd);

  if (frozen && sourcesMoved) {
    check(
      "adp.json moved, because the sources did",
      false,
      "",
      "the feeds published new data and our board is byte-identical — it is not reaching the output",
    );
  } else if (frozen) {
    console.log(
      `  --    adp.json unchanged, and so are the sources ` +
        `(rankings ${meta.freshness?.rankings}, pool ends ${meta.freshness?.adpWindowEnd}) — ` +
        "a genuine no-op, nothing to publish",
    );
  } else {
    check("adp.json changed since the last run", true);
  }

  warn("players.json changed", !identicalToHead("players.json"),
    "rankings can genuinely sit still for a day");
  warn("team-news.json changed", !identicalToHead("team-news.json"),
    "expected to move only when a roster does");
  // The history file refreshes weekly by design, so an unchanged one is normal.
  console.log(
    `  --    adp-history.json ${identicalToHead("adp-history.json") ? "unchanged (weekly by design)" : "refreshed"}`,
  );
}

// Each threshold above is calibrated to have a non-zero false-positive rate —
// that is what makes it sensitive. Three tripwires firing on one day is not
// three coincidences, it is one broken input showing up three ways.
const WARN_BUDGET = 3;
if (warnings >= WARN_BUDGET) {
  failures++;
  console.log(
    `\n  FAIL  ${warnings} warnings in one run exceeds the budget of ${WARN_BUDGET}`,
  );
}

if (!firstRun && assertions < MIN_ASSERTIONS_WITH_BASELINE) {
  failures++;
  console.log(
    `\n  FAIL  only ${assertions} assertions ran, expected at least ` +
      `${MIN_ASSERTIONS_WITH_BASELINE} — the gate did not actually check anything`,
  );
}

console.log(
  failures === 0
    ? `\nday-over-day: ${assertions} checks passed` +
        `${warnings ? ` (${warnings} warning${warnings > 1 ? "s" : ""})` : ""}\n`
    : `\nday-over-day: ${failures} FAILURE${failures > 1 ? "S" : ""} — publishing nothing\n`,
);
process.exit(failures === 0 ? 0 : 1);
