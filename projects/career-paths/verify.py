"""verify.py -> validation.json

Benchmarks the calibrated model against numbers the sources report directly.
Each check is a range; the script exits nonzero if any fails, and the
methodology page renders the table. These are the claims a reader can hold
the simulation to.

Run: uv run python verify.py
"""

from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

from engine import PAYDAY, avg_first, simulate
from params import PARAMS, plain
from publish import publish
from rng import Mulberry32
from simulate import cohort_seed, pct

HERE = Path(__file__).parent
N = 4000


def cohort(P, persona, first, stage=None, stay=False, n=N):
    rng = Mulberry32(cohort_seed(persona, first, stage, stay) ^ 0xA11CE)
    return [simulate(persona, first, P, rng, stage=stage, stay=stay) for _ in range(n)]


def check(name, value, lo, hi, source):
    ok = lo <= value <= hi
    return {"check": name, "value": value, "low": lo, "high": hi, "ok": ok, "source": source}


def main() -> int:
    P = plain(PARAMS)
    rows = []

    su = cohort(P, "technical", "startup")
    eq10 = [sum(e.amount for e in b.events if e.kind in ("exit", "tender") and e.year <= 10) for b in su]
    rows.append(check("Startup (blended, technical): median equity cash by year 10", pct(eq10, 0.5), 0, 5_000,
                      "Carta: 32% of vested in-the-money options exercised; 65% of VC investments return under 1x"))
    rows.append(check("Startup: share with $10K+ of equity cash by year 10", sum(1 for x in eq10 if x >= 10_000) / N, 0.08, 0.30,
                      "Correlation Ventures / PitchBook exit rates"))
    rows.append(check("Startup: share with a $100K+ payday by year 10", sum(1 for x in eq10 if x >= PAYDAY) / N, 0.02, 0.12,
                      "92% of VC M&A under $50M; preference stacks"))

    seed = cohort(P, "technical", "startup", stage="seed", stay=True)
    dead5 = sum(1 for b in seed if b.companies[0].failed) / N
    rows.append(check("Seed: share whose first company is gone by year 5", dead5, 0.45, 0.65,
                      "Carta: ~50% of seed companies reach A within 4 years"))

    co = cohort(P, "technical", "consulting")
    rows.append(check("Consulting: share still in consulting at year 5", sum(1 for b in co if b.milestone_track[1] == "consulting") / N, 0.20, 0.40,
                      "Consulting turnover 20-30% a year; average tenure 2.7 years"))
    rows.append(check("Consulting: share who make partner by year 15", sum(1 for b in co if any(e.kind == "partner" and e.year <= 15 for e in b.events)) / N, 0.02, 0.10,
                      "5-10% of an entering class make partner"))

    corp = cohort(P, "technical", "corporate", stay=True)
    r = pct([b.realized[19] / b.realized[0] for b in corp], 0.5)
    rows.append(check("Corporate (technical, no switching): median year-20 / year-1 pay", r, 1.6, 2.4,
                      "Deming: bachelor's real pay roughly doubles by mid-career"))

    inv = st.mean([sum(1 for e in b.events if e.kind in ("layoff", "fail")) / len(b.realized) for b in corp + co + su])
    rows.append(check("All tracks: involuntary separations per career-year", inv, 0.03, 0.08,
                      "JOLTS layoffs and discharges, scaled to professionals"))

    a_su = [avg_first(b, 30) for b in su]
    a_co = [avg_first(b, 30) for b in cohort(P, "technical", "corporate")]
    a_cs = [avg_first(b, 30) for b in co]
    rows.append(check("Startup: mean / median of 30-year average pay", st.mean(a_su) / pct(a_su, 0.5), 1.05, 2.0, "Lottery-shaped payoff: mean above median"))
    spread = {k: pct(v, 0.9) / pct(v, 0.1) for k, v in (("startup", a_su), ("corporate", a_co), ("consulting", a_cs))}
    seed_stay = cohort(P, "technical", "startup", stage="seed", stay=True)
    eq_seed = [sum(e.amount for e in b.events if e.kind in ("exit", "tender")) for b in seed_stay]
    rows.append(check("Seed hires who stay the course: share with $250K+ of equity over a career", sum(1 for x in eq_seed if x >= 250_000) / N, 0.05, 0.25,
                      "Derived: Carta new-grad grant sizes x dilution x the VC exit distribution"))
    rows.append(check("Consulting p10 exceeds startup p10", pct(a_cs, 0.1) / pct(a_su, 0.1), 1.0, 3.0, "Shape check"))

    founders = [b for b in su + cohort(P, "technical", "corporate") if any(e.kind == "found" for e in b.events)]
    fx = sum(1 for b in founders if any(e.kind == "exit" and e.amount >= PAYDAY for e in b.events)) / max(1, len(founders))
    rows.append(check("Founders: share with a $100K+ exit", fx, 0.05, 0.25, "Correlation Ventures: 65% of investments return under 1x; roughly 10% of founders reach a real exit"))

    out = {"n": N, "checks": rows, "spread": spread}
    blob = json.dumps(out, indent=1)
    (HERE / "validation.json").write_text(blob)
    publish("validation.json", blob)
    for row in rows:
        flag = "ok  " if row["ok"] else "FAIL"
        print(f"{flag} {row['check']}: {row['value']:.3f} in [{row['low']}, {row['high']}]")
    bad = [r for r in rows if not r["ok"]]
    print("p90/p10 spread:", {k: round(v, 2) for k, v in spread.items()})
    print(f"{len(rows) - len(bad)}/{len(rows)} benchmarks pass")
    return 1 if bad else 0




if __name__ == "__main__":
    sys.exit(main())
