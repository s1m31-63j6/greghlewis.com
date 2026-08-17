"""parity_test.py — prove the TypeScript engine is the Python engine.

The app ships a TypeScript port of `engine.py` so the search can run in a Web
Worker. Two implementations of the same model is two chances to be wrong, and
the failure mode is quiet: a mistyped constant or a reordered branch produces an
engine that still looks plausible and grades every decision slightly wrong.

So both sides are driven from the *same* stream of uniforms — mulberry32,
implemented identically in `rng.py` and `engine/rng.ts` — and required to agree
exactly. Same state, same action, same seed must give the same outcome, the same
resulting state, and the same rollout result. Any divergence in branch order,
bucket boundary or arithmetic shows up immediately, because a single extra
`rng()` call desynchronises everything after it.

The runner is generated into `results/` (gitignored) and executed with Node's
type stripping, importing the real `.ts` sources rather than a copy.

Usage:
    uv run python parity_test.py
    uv run python parity_test.py --states 600
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path

import engine as E
from engine import KICKOFF, PAT, PLAY, State, load_models
from rng import Mulberry32

HERE = Path(__file__).parent
RESULTS = HERE / "results"
TS_DIR = HERE.parent.parent / "src" / "app" / "projects" / "two-minute-drill" / "engine"

# Node's ESM loader wants explicit file extensions; the app's TypeScript uses
# bundler-style extensionless imports, which is correct for Next.js and which
# we do not want to disfigure just to make this test run. A resolve hook
# bridges the two, so the test imports the real shipped sources unmodified.
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

# Placeholders rather than str.format, because the body is mostly JavaScript
# and every brace in it would have to be doubled.
RUNNER = """
import { buildModels } from "__TS__/models.ts";
import { resolve, resolvePat, resolveKickoff, rollout, legalActions,
         legalDefenseActions, resolveDefense } from "__TS__/engine.ts";
import { mulberry32 } from "__TS__/rng.ts";
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const m = buildModels({
  distributions: read("__HERE__/distributions.json"),
  tendencies: read("__HERE__/tendencies.json"),
  calibration: read("__HERE__/calibration.json"),
}, 2025);
const cases = read("__RESULTS__/cases.json");

const out = [];
for (const c of cases) {
  const s = c.state;
  const legal = legalActions(s);
  const row = { resolved: {}, rollouts: {}, legal };
  for (const a of legal) {
    const rng = mulberry32(c.seed);
    let nxt, ev;
    if (s.phase === "pat") { nxt = resolvePat(s, a, m, rng); ev = "pat"; }
    else if (s.phase === "kickoff") { nxt = resolveKickoff(s, a, m, rng); ev = "kickoff"; }
    else if (a === "timeout") { nxt = { ...s, offTo: s.offTo - 1, clockRunning: false }; ev = "timeout"; }
    else { [nxt, ev] = resolve(s, a, m, rng); }
    row.resolved[a] = [ev, nxt.seconds, nxt.phase, nxt.diff, nxt.yardline, nxt.down,
                       nxt.ydstogo, nxt.offTo, nxt.defTo, nxt.clockRunning,
                       nxt.twoMinuteDone, nxt.offenseIsUser];
    row.rollouts[a] = rollout(s, m, mulberry32(c.seed + 1));
  }
  row.defLegal = legalDefenseActions(s);
  row.defense = {};
  for (const a of row.defLegal) {
    const [d, ev, off] = resolveDefense(s, a, m, mulberry32(c.seed + 2));
    row.defense[a] = [ev, off, d.seconds, d.phase, d.diff, d.yardline, d.down, d.ydstogo,
                      d.offTo, d.defTo, d.clockRunning, d.twoMinuteDone, d.offenseIsUser];
  }
  out.push(row);
}
console.log(JSON.stringify(out));
"""


def make_states(n: int) -> list[dict]:
    """Deterministic pseudo-random states spanning every branch of the engine."""
    r = Mulberry32(20260817)

    def pick(lo, hi):
        return lo + int(r.random() * (hi - lo + 1))

    cases = []
    for i in range(n):
        phase = PLAY
        u = r.random()
        if u > 0.90:
            phase = PAT
        elif u > 0.80:
            phase = KICKOFF
        yardline = pick(1, 99)
        state = State(
            seconds=pick(1, 240),
            phase=phase,
            diff=pick(-14, 14),
            yardline=35 if phase == KICKOFF else yardline,
            down=pick(1, 4),
            ydstogo=min(pick(1, 15), yardline),
            off_to=pick(0, 3),
            def_to=pick(0, 3),
            clock_running=r.random() < 0.5,
            two_minute_done=r.random() < 0.7,
            offense_is_user=r.random() < 0.5,
        )
        cases.append({"state": state, "seed": pick(1, 10_000_000)})
    return cases


def to_js_state(s: State) -> dict:
    return {
        "seconds": s.seconds, "phase": s.phase, "diff": s.diff, "yardline": s.yardline,
        "down": s.down, "ydstogo": s.ydstogo, "offTo": s.off_to, "defTo": s.def_to,
        "clockRunning": s.clock_running, "twoMinuteDone": s.two_minute_done,
        "offenseIsUser": s.offense_is_user,
    }


def py_row(case: dict, m) -> dict:
    s: State = case["state"]
    seed = case["seed"]
    acts = E.legal_actions(s)
    resolved, rollouts = {}, {}
    for a in acts:
        rng = Mulberry32(seed)
        if s.phase == PAT:
            nxt, ev = E.resolve_pat(s, a, m, rng), "pat"
        elif s.phase == KICKOFF:
            nxt, ev = E.resolve_kickoff(s, a, m, rng), "kickoff"
        elif a == "timeout":
            from dataclasses import replace
            nxt, ev = replace(s, off_to=s.off_to - 1, clock_running=False), "timeout"
        else:
            nxt, ev = E.resolve(s, a, m, rng)
        resolved[a] = [ev, nxt.seconds, nxt.phase, nxt.diff, nxt.yardline, nxt.down,
                       nxt.ydstogo, nxt.off_to, nxt.def_to, nxt.clock_running,
                       nxt.two_minute_done, nxt.offense_is_user]
        rollouts[a] = E.rollout(s, m, Mulberry32(seed + 1))
    def_legal = E.legal_defense_actions(s)
    defense = {}
    for a in def_legal:
        d, ev, off = E.resolve_defense(s, a, m, Mulberry32(seed + 2))
        defense[a] = [ev, off, d.seconds, d.phase, d.diff, d.yardline, d.down, d.ydstogo,
                      d.off_to, d.def_to, d.clock_running, d.two_minute_done,
                      d.offense_is_user]
    return {"resolved": resolved, "rollouts": rollouts, "legal": acts,
            "defLegal": def_legal, "defense": defense}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--states", type=int, default=500)
    args = ap.parse_args()

    RESULTS.mkdir(exist_ok=True)
    m = load_models(2025)
    cases = make_states(args.states)

    (RESULTS / "cases.json").write_text(json.dumps(
        [{"state": to_js_state(c["state"]), "seed": c["seed"]} for c in cases]))

    runner = (RUNNER.replace("__TS__", TS_DIR.as_posix())
                    .replace("__HERE__", HERE.as_posix())
                    .replace("__RESULTS__", RESULTS.as_posix()))
    runner_path = RESULTS / "parity_runner.mjs"
    runner_path.write_text(runner)
    (RESULTS / "resolve-ts.mjs").write_text(RESOLVER)
    register_path = RESULTS / "register.mjs"
    register_path.write_text(REGISTER.replace("__RESULTS__", RESULTS.as_posix()))

    print(f"running {args.states} states through the TypeScript engine …")
    proc = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings",
         "--import", str(register_path), str(runner_path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        print(proc.stderr[-4000:], file=sys.stderr)
        return 1
    ts_rows = json.loads(proc.stdout)

    mismatches = []
    checks = 0
    for i, (case, ts) in enumerate(zip(cases, ts_rows)):
        py = py_row(case, m)
        if sorted(py["legal"]) != sorted(ts["legal"]):
            mismatches.append((i, "legal_actions", py["legal"], ts["legal"]))
            continue
        for a in py["legal"]:
            checks += 1
            if py["resolved"][a] != ts["resolved"][a]:
                mismatches.append((i, f"resolve/{a}", py["resolved"][a], ts["resolved"][a]))
            if py["rollouts"][a] != ts["rollouts"][a]:
                mismatches.append((i, f"rollout/{a}", py["rollouts"][a], ts["rollouts"][a]))
        if sorted(py["defLegal"]) != sorted(ts["defLegal"]):
            mismatches.append((i, "legal_defense", py["defLegal"], ts["defLegal"]))
            continue
        for a in py["defLegal"]:
            checks += 1
            if py["defense"][a] != ts["defense"][a]:
                mismatches.append((i, f"defense/{a}", py["defense"][a], ts["defense"][a]))

    print(f"compared {checks:,} (state, action) pairs across {len(cases):,} states")
    if mismatches:
        print(f"\n{len(mismatches)} MISMATCHES — showing the first 10:")
        for idx, what, p, t in mismatches[:10]:
            print(f"  case {idx} {what}")
            print(f"    python: {p}")
            print(f"    ts    : {t}")
            print(f"    state : {asdict(cases[idx]['state'])}")
        return 1

    print("PASS — the two engines agree on every outcome, state and rollout.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
