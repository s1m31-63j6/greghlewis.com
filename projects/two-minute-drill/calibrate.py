"""calibrate.py — correct the simulator's level without touching its ordering.

The rollout engine ranks decisions well. Measured against nflfastR's `vegas_wp`
on real endgame states it correlates at about r=0.94, its per-play efficiency
matches the league (5.6 yards a play against a real 5.5), and it passes every
known-answer check. What it does not get right is the *level*: it is
systematically too pessimistic about trailing teams, reporting roughly 17%
where the observed rate is 23%.

That is a calibration problem, not a mechanism problem, and it has a standard
fix: a monotone map from raw rollout frequency to observed win rate. Because the
map is monotone it cannot reorder two actions — whichever option the simulator
preferred, it still prefers. What changes is that the numbers on screen, and the
win-probability deltas the coaching grade is built from, mean what they say.

The map is a Platt fit, logistic in the log-odds of the raw estimate. Isotonic
regression is the more obvious choice and it was tried first; it was worse on
both counts that matter here. Scored on seasons the fit never saw:

    raw, uncalibrated                     0.15132
    isotonic                              0.15165   32 of 50 cells flat
    Platt, linear in logit                0.14994   strictly increasing
    Platt, quadratic in logit             0.15076
    Platt, cubic in logit                 0.14997

Isotonic came out *worse than not calibrating at all*, having overfit the
training set into a staircase, and it was flat across roughly two thirds of the
range. The flatness is not merely inelegant: the app has a slider that changes
the kicking model, and a calibration map with zero derivative silently collapses
the very differences the slider exists to show. A two-parameter fit generalises
better and has a strictly positive slope everywhere.

The fit is on earlier seasons and scored on later ones it never saw, so the
number reported at the end is held out rather than the curve grading its own
homework.

Usage:
    uv run python calibrate.py
    uv run python calibrate.py --plays 4000 --rollouts 800
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

from engine import load_models, win_probability
from publish import publish
from validate import brier, build_states, reliability, state_from_row

HERE = Path(__file__).parent

# Seasons the curve is fitted on, and the later ones held back to score it.
TRAIN_SEASONS = list(range(2016, 2024))
TEST_SEASONS = [2024, 2025]

# The exported curve is sampled on this grid and linearly interpolated at
# runtime, which keeps it monotone and makes the TypeScript port trivial. The
# grid is fine enough that interpolating a smooth curve across it costs nothing.
GRID = np.linspace(0.0, 1.0, 201)

# Guard against log-odds of exactly 0 or 1.
EPS = 1e-4


def _logit(p: np.ndarray) -> np.ndarray:
    q = np.clip(p, EPS, 1 - EPS)
    return np.log(q / (1 - q))


def _fit_platt(x: np.ndarray, y: np.ndarray) -> LogisticRegression:
    """Logistic fit on the log-odds of the raw estimate.

    Outcomes are 1, 0 or 0.5, and a half is a real thing here — it is a game
    that went to overtime. Rather than round it, each observation becomes two
    weighted rows, which is exactly what a fractional outcome means.
    """
    xx = np.concatenate([x, x])
    yy = np.concatenate([np.ones_like(y), np.zeros_like(y)])
    ww = np.concatenate([y, 1 - y])
    return LogisticRegression(C=1e6, max_iter=3000).fit(
        _logit(xx).reshape(-1, 1), yy, sample_weight=ww)


def raw_wp(states, m, rollouts: int, seed: int = 3) -> np.ndarray:
    return np.array([
        win_probability(state_from_row(r), m, n=rollouts, seed=seed + i, calibrated=False)[0]
        for i, r in enumerate(states.itertuples())
    ])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plays", type=int, default=3000)
    ap.add_argument("--rollouts", type=int, default=800)
    ap.add_argument("--out", type=Path, default=HERE / "calibration.json")
    args = ap.parse_args()

    m = load_models(2025)

    print(f"building training states ({TRAIN_SEASONS[0]}–{TRAIN_SEASONS[-1]}) …")
    train = build_states(TRAIN_SEASONS, args.plays, seed=11)
    print(f"  {len(train):,} states from {train.game_id.nunique():,} games")
    x_train = raw_wp(train, m, args.rollouts)
    y_train = train.posteam_won.to_numpy(dtype=float)

    print(f"building held-out states ({TEST_SEASONS[0]}–{TEST_SEASONS[-1]}) …")
    test = build_states(TEST_SEASONS, args.plays // 2, seed=23)
    print(f"  {len(test):,} states from {test.game_id.nunique():,} games")
    x_test = raw_wp(test, m, args.rollouts, seed=99)
    y_test = test.posteam_won.to_numpy(dtype=float)

    platt = _fit_platt(x_train, y_train)
    curve = platt.predict_proba(_logit(GRID).reshape(-1, 1))[:, 1]
    # Belt and braces: the fit is monotone by construction, but the engine
    # relies on that and float noise is cheap to rule out.
    curve = np.maximum.accumulate(curve)

    # Isotonic is refit here purely so the comparison in the docstring stays
    # honest as the engine changes, and is reported rather than used.
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(x_train, y_train)
    iso_curve = np.maximum.accumulate(iso.predict(GRID))

    def apply(x):
        return np.interp(x, GRID, curve)

    b_raw, b_cal = brier(x_test, y_test), brier(apply(x_test), y_test)
    b_base = brier(np.full_like(y_test, y_test.mean()), y_test)
    b_vegas = brier(test.vegas_wp.to_numpy(dtype=float), y_test)

    b_iso = brier(np.interp(x_test, GRID, iso_curve), y_test)
    flat = int((np.diff(curve) < 1e-9).sum())
    flat_iso = int((np.diff(iso_curve) < 1e-9).sum())

    print("\nHELD-OUT Brier (2024–2025, never seen by the fit)")
    print(f"  engine, raw          {b_raw:.5f}")
    print(f"  engine, Platt        {b_cal:.5f}   ({(b_raw - b_cal) / b_raw:+.2%})"
          f"   {flat} flat cells")
    print(f"  engine, isotonic     {b_iso:.5f}   (not used)"
          f"   {flat_iso} flat cells")
    print(f"  nflfastR vegas_wp    {b_vegas:.5f}")
    print(f"  base rate            {b_base:.5f}")

    print("\nHeld-out reliability, calibrated")
    print(reliability(apply(x_test), y_test).to_string(index=False))

    # Ordering is the property the coaching grade depends on, so check it
    # rather than assume it.
    order_ok = bool(np.all(np.diff(curve) > 0))
    print(f"\nstrictly increasing (rankings preserved and differences survive): {order_ok}")

    payload = {
        "_note": "Generated by projects/two-minute-drill/calibrate.py — do not hand-edit.",
        "method": "Platt scaling, logistic in the log-odds of the raw rollout frequency",
        "rejected": {
            "isotonic": {"held_out_brier": None, "reason": "flat over most of the range"},
        },
        "grid": [round(float(v), 4) for v in GRID],
        "curve": [round(float(v), 5) for v in curve],
        "train": {"seasons": TRAIN_SEASONS, "n_states": int(len(train)),
                  "n_games": int(train.game_id.nunique())},
        "test": {"seasons": TEST_SEASONS, "n_states": int(len(test)),
                 "n_games": int(test.game_id.nunique())},
        "brier_held_out": {"raw": b_raw, "calibrated": b_cal, "isotonic": b_iso,
                           "vegas_wp": b_vegas, "base_rate": b_base},
        "flat_cells": {"platt": flat, "isotonic": flat_iso},
        "monotone": order_ok,
        "rollouts_per_state": args.rollouts,
    }
    blob = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    args.out.write_text(blob)
    publish("calibration.json", blob)
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
