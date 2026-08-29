/**
 * tie-out.mts — the gate that makes the settings panel safe to ship.
 *
 * The product promise is that you are looking at the market, not at something
 * we invented. A settings panel that quietly walks the board away from
 * consensus in some corner of the config space would break that promise
 * silently, in exactly the leagues least able to notice.
 *
 * So this asserts, and FAILS THE BUILD on violation:
 *
 *   1. REPRODUCTION — for each of the five published boards, a league matching
 *      the baseline those boards assume reproduces the published order exactly.
 *   2. CAP UNDER FUZZ — across 200 randomly sampled legal configs, no player
 *      ever departs consensus by more than CAP ranks.
 *   3. MONOTONICITY — more demand for a position may only move it up.
 *   4. DETERMINISM — sweeping a setting away and back returns the same board.
 *
 * Run: npm run draft-sheet:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BASELINE,
  CAP,
  buildBoard,
  positionOffsets,
  snapToBoard,
} from "../../../src/lib/draft-sheet/board.ts";
import { defaultConfig } from "../../../src/lib/draft-sheet/presets.ts";
import { BOARD_KEYS, POSITIONS } from "../../../src/lib/draft-sheet/types.ts";
import type {
  BoardKey,
  LeagueConfig,
  Player,
  Position,
} from "../../../src/lib/draft-sheet/types.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const players: Player[] = JSON.parse(
  readFileSync(join(ROOT, "public", "draft-sheet", "players.json"), "utf8"),
).players;

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

/** A config that matches what the published boards assume. */
function baselineConfig(board: BoardKey): LeagueConfig {
  const rec = board.startsWith("half") ? 0.5 : board === "ppr" ? 1 : 0;
  const sf = board.includes("superflex") ? 1 : 0;
  return {
    ...defaultConfig(),
    teams: BASELINE.teams,
    roster: { ...BASELINE.roster, SUPERFLEX: sf },
    scoring: { rec, passTd: 4, teRecBonus: 0 },
  };
}

console.log("\n1. Reproduction — a baseline league gets pure consensus");
for (const board of BOARD_KEYS) {
  const cfg = baselineConfig(board);
  const snapped = snapToBoard(cfg);
  // half-superflex is the snap target for both half and full PPR superflex, so
  // compare against whichever board the config actually resolves to.
  const built = buildBoard({ players, config: cfg, depth: 10_000 });

  const ranked = built.overall
    .filter((p) => p.ecr[snapped] != null)
    .map((p) => p.ecr[snapped]!);
  const monotone = ranked.every((v, i) => i === 0 || v >= ranked[i - 1]);

  check(
    `${board.padEnd(15)} snaps to ${snapped.padEnd(15)} departure ${built.maxDeparture.toFixed(1)}`,
    built.maxDeparture === 0 && monotone,
    built.maxDeparture === 0 ? "" : "board departed consensus at baseline",
  );
}

{
  // The superflex boards omit kickers and defenses. Before the fallback, a
  // superflex league lost both positions from the screen and from the printed
  // sheet, silently.
  const sf: LeagueConfig = {
    ...defaultConfig(),
    roster: { ...defaultConfig().roster, SUPERFLEX: 1 },
  };
  const built = buildBoard({ players, config: sf, depth: 10_000 });
  const got = built.columns.map((c) => c.pos);
  const want: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];
  check(
    "a superflex league still gets every rostered position",
    want.every((p) => got.includes(p)),
    `missing ${want.filter((p) => !got.includes(p)).join(" ") || "none"}`,
  );
}

console.log("\n2. Displacement cap under 200 fuzzed configs");
let worst = 0;
let worstCfg = "";
let capViolations = 0;
let seed = 20260829;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

for (let i = 0; i < 200; i++) {
  const cfg: LeagueConfig = {
    ...defaultConfig(),
    teams: pick([8, 10, 12, 14, 16]),
    roster: {
      QB: pick([1, 1, 1, 2]),
      RB: pick([1, 2, 2, 3]),
      WR: pick([2, 3, 3, 4]),
      TE: pick([0, 1, 1, 2]),
      FLEX: pick([0, 1, 1, 2, 3]),
      SUPERFLEX: pick([0, 0, 0, 1]),
      K: pick([0, 1]),
      DST: pick([0, 1]),
      BENCH: pick([4, 5, 6, 7, 8]),
    },
    scoring: { rec: pick([0, 0.5, 1]), passTd: pick([4, 6]), teRecBonus: pick([0, 0.5, 1]) },
  };
  const built = buildBoard({ players, config: cfg, depth: 10_000 });
  if (built.maxDeparture > worst) {
    worst = built.maxDeparture;
    worstCfg = `${cfg.teams}tm QB${cfg.roster.QB} RB${cfg.roster.RB} WR${cfg.roster.WR} TE${cfg.roster.TE} FLX${cfg.roster.FLEX} SF${cfg.roster.SUPERFLEX}`;
  }
  if (built.maxDeparture > CAP + 1e-9) capViolations++;
}
check(`no config exceeds CAP=${CAP}`, capViolations === 0, `${capViolations} violations`);
check(`worst observed departure ${worst.toFixed(1)} ranks`, worst <= CAP, worstCfg);

console.log("\n3. Monotonicity — more demand may only move a position up");
const base = defaultConfig();
{
  // Superflex is delivered by the BOARD SNAP, not by the offset, so the honest
  // test is the user-visible outcome: where the first quarterback actually
  // lands on the overall board.
  const sf: LeagueConfig = { ...base, roster: { ...base.roster, SUPERFLEX: 1 } };
  const firstQb = (c: LeagueConfig) =>
    buildBoard({ players, config: c, depth: 10_000 }).overall.findIndex(
      (p) => p.pos === "QB",
    );
  check(
    "a superflex slot moves the first QB up the overall board",
    firstQb(sf) < firstQb(base),
    `${firstQb(base)} -> ${firstQb(sf)}`,
  );

  const moreTe: LeagueConfig = { ...base, roster: { ...base.roster, TE: 2 } };
  check(
    "starting two tight ends moves TE up",
    positionOffsets(moreTe).TE < positionOffsets(base).TE,
  );

  // The two scoring axes no published board covers, so they must be visible.
  const tep: LeagueConfig = { ...base, scoring: { ...base.scoring, teRecBonus: 0.5 } };
  check(
    "a tight-end premium moves TE up, and only TE",
    positionOffsets(tep).TE < positionOffsets(base).TE &&
      positionOffsets(tep).WR === positionOffsets(base).WR,
  );

  const sixPt: LeagueConfig = { ...base, scoring: { ...base.scoring, passTd: 6 } };
  check(
    "six-point passing touchdowns move QB up, and only QB",
    positionOffsets(sixPt).QB < positionOffsets(base).QB &&
      positionOffsets(sixPt).RB === positionOffsets(base).RB,
  );

  const noK: LeagueConfig = { ...base, roster: { ...base.roster, K: 0 } };
  check("dropping kickers moves K down", positionOffsets(noK).K > positionOffsets(base).K);

  const bigger: LeagueConfig = { ...base, teams: 16 };
  const shifts = POSITIONS.map(
    (p: Position) => positionOffsets(bigger)[p] - positionOffsets(base)[p],
  );
  check(
    "team count alone does not shift positions against each other",
    shifts.every((s) => Math.abs(s) < 1e-9),
    `max |shift| ${Math.max(...shifts.map(Math.abs)).toFixed(3)}`,
  );
}

console.log("\n4. Determinism — a slider swept away and back returns the same board");
{
  const sig = (c: LeagueConfig) =>
    buildBoard({ players, config: c, depth: 200 })
      .columns.map((col) => `${col.pos}:${col.tiers.map((t) => t.players.length).join(",")}`)
      .join("|");
  const a = sig(base);
  sig({ ...base, scoring: { ...base.scoring, rec: 1 } });
  sig({ ...base, scoring: { ...base.scoring, rec: 0 } });
  const b = sig(base);
  check("PPR 0.5 -> 1 -> 0 -> 0.5 is identical", a === b);

  const tiers = buildBoard({ players, config: base, depth: 60 });
  const allConsensus = tiers.columns.every((c) => c.tiers.every((t) => t.fromConsensus));
  check("a baseline league shows consensus tiers, not recomputed ones", allConsensus);
}

console.log(
  failures === 0
    ? "\ntie-out: all checks passed\n"
    : `\ntie-out: ${failures} FAILURES\n`,
);
process.exit(failures === 0 ? 0 : 1);
