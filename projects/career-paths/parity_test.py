"""parity_test.py — prove the TypeScript engine is the Python engine.

Both sides are driven from the same mulberry32 stream. Every discrete outcome
(track, level, event kinds and years, milestone nodes) must agree exactly, and
every dollar figure within 1e-9 relative, which is the tolerance for libm
differences in log/exp/cos between V8 and CPython. Any logic divergence
desynchronises the uniform stream and shows up as a wall of mismatches.

Usage:
    uv run python parity_test.py
    uv run python parity_test.py --balls 1000
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from engine import avg_first, ltv, milestone_nodes, simulate
from params import PARAMS, plain
from rng import Mulberry32

HERE = Path(__file__).parent
RESULTS = HERE / "results"
TS_DIR = HERE.parent.parent / "src" / "app" / "projects" / "career-paths" / "engine"

RESOLVER = """
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[a-z]+$/i.test(specifier)) {
    try { return await next(specifier + ".ts", context); } catch { /* fall through */ }
  }
  return next(specifier, context);
}
"""

REGISTER = """
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./resolve-ts.mjs", pathToFileURL("__RESULTS__/"));
"""

RUNNER = """
import { simulate, avgFirst, ltv, milestoneNodes } from "__TS__/engine.ts";
import { loadParams } from "__TS__/params.ts";
import { mulberry32 } from "__TS__/rng.ts";
import { readFileSync } from "node:fs";

const P = loadParams(JSON.parse(readFileSync("__HERE__/params.json", "utf8")));
const cases = JSON.parse(readFileSync("__RESULTS__/cases.json", "utf8"));
const out = [];
for (const c of cases) {
  const rng = mulberry32(c.seed);
  const s = simulate(c.persona, c.first, P, rng, { stage: c.stage, pinned: c.pinned, stay: c.stay });
  out.push({
    track: s.track, level: s.level,
    events: s.events.map((e) => [e.year, e.kind, e.amount]),
    nodes: milestoneNodes(s, P),
    realized: s.realized, avg30: avgFirst(s, 30), ltv: ltv(s),
  });
}
console.log(JSON.stringify(out));
"""

STAGES = [None, "seed", "seriesAB", "growth", "bootstrapped", "pe"]
CHOICES = ["stay", "switch:corporate", "switch:consulting", "switch:startup", "switch:startup:seed",
           "mba:corporate", "mba:consulting", "mba:startup", "found"]


def make_cases(n: int) -> list[dict]:
    r = Mulberry32(20260906)
    cases = []
    for _ in range(n):
        persona = "technical" if r.random() < 0.5 else "nontechnical"
        first = ["startup", "corporate", "consulting"][int(r.random() * 3)]
        stage = STAGES[int(r.random() * len(STAGES))]
        u = r.random()
        pinned = None
        stay = False
        if u < 0.25:
            pinned = {m: CHOICES[int(r.random() * len(CHOICES))] for m in [3, 5, 10, 15, 20, 30]
                      if r.random() < 0.6}
        elif u < 0.4:
            stay = True
        cases.append({"persona": persona, "first": first, "stage": stage, "pinned": pinned,
                      "stay": stay, "seed": int(r.random() * 10_000_000) + 1})
    return cases


def py_row(c: dict, P) -> dict:
    pinned = {int(k): v for k, v in c["pinned"].items()} if c["pinned"] else None
    s = simulate(c["persona"], c["first"], P, Mulberry32(c["seed"]), stage=c["stage"],
                 pinned=pinned, stay=c["stay"])
    return {"track": s.track, "level": s.level,
            "events": [[e.year, e.kind, e.amount] for e in s.events],
            "nodes": milestone_nodes(s, P), "realized": s.realized,
            "avg30": avg_first(s, 30), "ltv": ltv(s)}


def close(a: float, b: float) -> bool:
    return abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--balls", type=int, default=500)
    args = ap.parse_args()
    RESULTS.mkdir(exist_ok=True)
    P = plain(PARAMS)
    if not (HERE / "params.json").exists():
        print("params.json missing: run `uv run python params.py` first", file=sys.stderr)
        return 1
    cases = make_cases(args.balls)
    (RESULTS / "cases.json").write_text(json.dumps(cases))
    (RESULTS / "parity_runner.mjs").write_text(
        RUNNER.replace("__TS__", TS_DIR.as_posix()).replace("__HERE__", HERE.as_posix())
              .replace("__RESULTS__", RESULTS.as_posix()))
    (RESULTS / "resolve-ts.mjs").write_text(RESOLVER)
    register = RESULTS / "register.mjs"
    register.write_text(REGISTER.replace("__RESULTS__", RESULTS.as_posix()))

    proc = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", "--import", str(register),
         str(RESULTS / "parity_runner.mjs")], capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stderr[-4000:], file=sys.stderr)
        return 1
    ts_rows = json.loads(proc.stdout)

    bad = 0
    for i, (c, ts) in enumerate(zip(cases, ts_rows)):
        py = py_row(c, P)
        problems = []
        if py["track"] != ts["track"] or py["level"] != ts["level"]:
            problems.append(f"end state {py['track']}/{py['level']} vs {ts['track']}/{ts['level']}")
        if py["nodes"] != ts["nodes"]:
            problems.append(f"nodes {py['nodes']} vs {ts['nodes']}")
        pe, te = py["events"], ts["events"]
        if len(pe) != len(te) or any(a[0] != b[0] or a[1] != b[1] or not close(a[2], b[2]) for a, b in zip(pe, te)):
            problems.append(f"events {pe[:6]} vs {te[:6]}")
        if len(py["realized"]) != len(ts["realized"]) or any(not close(a, b) for a, b in zip(py["realized"], ts["realized"])):
            problems.append("realized differs")
        if problems:
            bad += 1
            if bad <= 5:
                print(f"case {i} {c}: " + "; ".join(problems))
    print(f"{len(cases)} careers, {len(cases) - bad} agree, {bad} differ")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
