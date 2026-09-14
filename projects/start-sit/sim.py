"""sim.py — a Python mirror of src/lib/start-sit/simulate.ts.

Same model, for the evaluator: yards from a gamma matched to the expectation
and the fitted spread, receptions and carries from a rounded normal floored at
zero, passing touchdowns and interceptions Poisson at their expectation,
touchdowns Poisson at the published rate. Points per the scoring weights.

A mirror, not a parity target: it uses numpy's generator rather than
mulberry32, so draws differ from the browser's while the distribution does not.
"""
from __future__ import annotations

import numpy as np

POISSON = {"pass_tds", "ints"}
COUNTS = {"rec", "rush_att"}
YARDS = {"pass_yds", "rush_yds", "rec_yds"}


def weights(rec: float, pass_td: float = 4.0) -> dict[str, float]:
    return {"pass_yds": .04, "pass_tds": pass_td, "ints": -1.0, "rush_yds": .1,
            "rush_att": 0.0, "rec": rec, "rec_yds": .1, "td": 6.0}


def draw_points(stats: dict, w: dict[str, float], n: int, rng: np.random.Generator) -> np.ndarray:
    pts = np.zeros(n)
    for key, s in stats.items():
        if key == "td":
            pts += w["td"] * rng.poisson(s["lambda"], n)
        elif key in POISSON:
            pts += w[key] * rng.poisson(max(0.0, s["ev"]), n)
        elif key in YARDS:
            ev, sd = max(0.0, s["ev"]), max(1e-6, s["sd"])
            if ev > 0:
                pts += w[key] * rng.gamma(ev * ev / (sd * sd), (sd * sd) / ev, n)
        else:
            v = np.maximum(0.0, s["ev"] + s["sd"] * rng.standard_normal(n))
            if key in COUNTS:
                v = np.round(v)
            pts += w[key] * v
    return pts


def band(stats: dict, w: dict[str, float], n: int = 4000, seed: int = 7) -> tuple[float, float, float]:
    d = draw_points(stats, w, n, np.random.default_rng(seed))
    return float(np.percentile(d, 20)), float(np.percentile(d, 50)), float(np.percentile(d, 80))
