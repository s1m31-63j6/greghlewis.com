/**
 * simulate.mts — the browser arithmetic agrees with itself.
 *
 * The expected points shown on a card are closed-form (weight × expectation);
 * the band around them is simulated. Those must agree, the band must be
 * ordered, the same seed must give the same draws, head-to-head odds must be
 * complementary, and an unpriced player must never win a verdict.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { rankBoard } from "../../../src/lib/start-sit/board.ts";
import { components } from "../../../src/lib/start-sit/scoring.ts";
import { simulate } from "../../../src/lib/start-sit/simulate.ts";
import type { Player, Scoring } from "../../../src/lib/start-sit/types.ts";
import { decodeState, encodeState } from "../../../src/lib/start-sit/url.ts";
import { explain, verdict } from "../../../src/lib/start-sit/verdict.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const players: Player[] = JSON.parse(
  readFileSync(join(ROOT, "public", "start-sit", "players.json"), "utf8"),
).players;

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const PPR: Scoring = { rec: 1, passTd: 4 };
const priced = players.filter((p) => Object.keys(p.stats).length > 0);
const top = priced
  .map((p) => ({ p, mean: components(p, PPR).mean }))
  .sort((a, b) => b.mean - a.mean)
  .slice(0, 50)
  .map((x) => x.p);

console.log("\nSimulation");
const sim = simulate(top, PPR, { draws: 4000 });
let worst = 0;
let unordered = 0;
for (let i = 0; i < top.length; i++) {
  const r = sim.results[i];
  const gap = Math.abs(r.mean - components(top[i], PPR).mean);
  worst = Math.max(worst, gap);
  if (!(r.p20 <= r.p50 && r.p50 <= r.p80)) unordered++;
}
check(`simulated mean within 0.5 of closed form for the top 50 (worst ${worst.toFixed(2)})`, worst <= 0.5);
check("p20 ≤ p50 ≤ p80 for every player", unordered === 0, `${unordered} unordered`);
const again = simulate(top.slice(0, 3), PPR, { draws: 4000 });
check("same seed gives identical draws",
  again.results.every((r, i) => r.draws.every((v, d) => v === sim.results[i].draws[d])));
let comp = true;
for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (i !== j && Math.abs(sim.pWin[i][j] + sim.pWin[j][i] - 1) > 1e-6) comp = false;
check("pWin[i][j] + pWin[j][i] = 1", comp);
check("a player beats himself half the time", sim.pWin[0][0] === 0.5);

console.log("\nVerdict");
const a = top[0], b = top[1], c = top[20];
const none = players.find((p) => p.coverage === "none")!;
const v = verdict([c, none, a], PPR);
check("the highest mean wins", v.best === a.id);
check("an unpriced player is excluded, not ranked", v.excluded.includes(none.id) && !v.ranked.some((r) => r.id === none.id));
const self = verdict([a, { ...a, id: "twin" }], PPR);
check("a player against his twin is too close to call", self.tied.includes("twin"));
const far = verdict([a, c], PPR);
check(`a ${(components(a, PPR).mean - components(c, PPR).mean).toFixed(1)}-point gap is called`, far.tied.length === 0);
const why = explain(a, b, PPR);
check("explain names a component", why !== null && Number.isFinite(why.diff));
check("verdict with nobody priced has no winner", verdict([none], PPR).best === null);

console.log("\nBoard");
const wr = rankBoard(players, PPR, "WR", 500);
check(`WR board has ${wr.length} rows, sorted by mean`, wr.length >= 40 && wr.every((r, i) => i === 0 || r.mean <= wr[i - 1].mean));
check("board bands are ordered", wr.every((r) => r.p20 <= r.p80));

console.log("\nShare link");
const enc = encodeState([a.id, null, b.id], { rec: 0.5, passTd: 6 });
const dec = decodeState(`?${enc}`);
check("round-trips picks and scoring", dec.ids.join() === [a.id, b.id].join() && dec.scoring.rec === 0.5 && dec.scoring.passTd === 6);
check("garbage falls back to defaults", decodeState("?p=x,y&s=9-9").scoring.rec === 0.5 && decodeState("?p=x").ids.length === 0);

console.log(failures === 0 ? "\nsimulate: all checks passed\n" : `\nsimulate: ${failures} FAILURES\n`);
process.exit(failures === 0 ? 0 : 1);
