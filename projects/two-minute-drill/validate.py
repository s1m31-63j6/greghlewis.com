"""validate.py — does the engine actually know anything?

This is the gate the rest of the project sits behind. If the engine's win
probabilities do not track what really happened, then grading a player's
decisions against them is theatre, and no amount of interface work fixes that.

Three checks:

1. **Calibration against outcomes.** Take real states from the final two
   minutes of one-score games, ask the engine for a win probability, and
   compare against whether that team went on to win. Reported as a reliability
   curve and a Brier score, alongside nflfastR's `vegas_wp` on exactly the same
   states so there is a reference point rather than a bare number.

2. **Known answers.** A short list of situations where football has a correct
   answer and any working engine must produce it.

3. **Era separation.** The 2025 and pre-2025 kicking models should disagree on
   long attempts and agree on short ones.

Usage:
    uv run python validate.py                # 1,200 states, 1,500 rollouts each
    uv run python validate.py --plays 3000 --rollouts 3000
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from engine import PLAY, State, evaluate, load_models, win_probability
from pbp import endgame, load_seasons

HERE = Path(__file__).parent
OUT_DIR = HERE / "methodology"

# Play outcomes after which the clock is stopped at the next snap.
CLOCK_STOPPING = {"incomplete", "oob", "score", "timeout", "punt", "kickoff", "turnover"}


def _clock_running_before(g: pd.DataFrame) -> pd.Series:
    """Infer whether the clock was running at each snap from the previous play.

    pbp records the clock at the snap but not whether it was moving. The
    previous play's outcome determines it: an incompletion, a trip out of
    bounds, a timeout or a change of possession all leave it stopped.
    """
    prev_desc = g.desc.shift(1).fillna("")
    prev_type = g.play_type.shift(1).fillna("")
    prev_incomplete = g.incomplete_pass.shift(1).fillna(0) == 1
    prev_oob = prev_desc.str.contains(r"\bob\b|out of bounds", case=False)
    prev_timeout = g.timeout.shift(1).fillna(0) == 1
    prev_change = prev_type.isin(["punt", "kickoff", "field_goal", "extra_point"])
    prev_td = g.touchdown.shift(1).fillna(0) == 1
    stopped = prev_incomplete | prev_oob | prev_timeout | prev_change | prev_td
    return (~stopped).fillna(False)


def build_states(seasons: list[int], n_plays: int, seed: int) -> pd.DataFrame:
    """Real endgame states, paired with who actually won the game."""
    df = load_seasons(seasons)
    df = df.sort_values(["game_id", "qtr", "play_id"])
    df["clock_running"] = (
        df.groupby("game_id", group_keys=False).apply(_clock_running_before,
                                                      include_groups=False)
    )
    eg = endgame(df)

    # Only snaps — a state has to be something the engine can be asked about.
    eg = eg[eg.play_type.isin(["pass", "run", "punt", "field_goal"])]
    eg = eg[eg.down.between(1, 4) & eg.yardline_100.between(1, 99)]
    eg = eg.dropna(subset=["quarter_seconds_remaining", "score_differential",
                           "ydstogo", "vegas_wp", "result"])

    # Ground truth: did the team with the ball win this game?
    home_won = np.sign(eg.result)
    pos_is_home = eg.posteam == eg.home_team
    pos_margin = np.where(pos_is_home, home_won, -home_won)
    eg = eg.assign(posteam_won=np.where(pos_margin > 0, 1.0,
                                        np.where(pos_margin < 0, 0.0, 0.5)))

    return eg.sample(min(n_plays, len(eg)), random_state=seed).reset_index(drop=True)


def state_from_row(r) -> State:
    return State(
        seconds=int(r.quarter_seconds_remaining),
        phase=PLAY,
        diff=int(r.score_differential),
        yardline=int(r.yardline_100),
        down=int(r.down),
        ydstogo=int(min(r.ydstogo, r.yardline_100)),
        off_to=int(r.posteam_timeouts_remaining or 0),
        def_to=int(r.defteam_timeouts_remaining or 0),
        clock_running=bool(r.clock_running),
        two_minute_done=True,  # every state here is already inside 2:00
        offense_is_user=True,
    )


def brier(p: np.ndarray, y: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def reliability(p: np.ndarray, y: np.ndarray, bins: int = 10) -> pd.DataFrame:
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    rows = []
    for b in range(bins):
        sel = idx == b
        if sel.sum() == 0:
            continue
        rows.append({
            "bin": f"{edges[b]:.1f}-{edges[b + 1]:.1f}",
            "n": int(sel.sum()),
            "predicted": round(float(p[sel].mean()), 4),
            "observed": round(float(y[sel].mean()), 4),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Known answers
# ---------------------------------------------------------------------------

def known_answers(m) -> list[tuple[str, bool, str]]:
    """Situations with a correct answer. Returns (name, passed, detail)."""
    results = []

    # Raw, uncalibrated numbers throughout. These checks are about whether the
    # simulator's mechanics are right; the calibration curve is a display
    # transform and its flat segments legitimately collapse near-ties.
    def ev(s, actions=None, n=6000):
        return {e.action: e.wp for e in evaluate(s, m, actions, n=n, calibrated=False)}

    def best(s, actions=None, n=6000):
        return evaluate(s, m, actions, n=n, calibrated=False)[0]

    # Leading with the ball and the opponent out of timeouts: kneel it out.
    s = State(seconds=80, diff=4, yardline=60, down=1, ydstogo=10,
              off_to=3, def_to=0, clock_running=True)
    top = best(s)
    results.append(("kneel-out wins when opponent has no timeouts",
                    top.action == "kneel", f"best={top.action} {top.wp:.3f}"))

    # Down two inside field goal range with time expiring: kick it.
    s = State(seconds=25, diff=-2, yardline=20, down=4, ydstogo=3,
              off_to=1, def_to=2, clock_running=False)
    top = best(s)
    results.append(("field goal when down 2 in range",
                    top.action == "field_goal", f"best={top.action} {top.wp:.3f}"))

    # Same spot, down four: a field goal cannot win, so it must not be chosen.
    s = State(seconds=25, diff=-4, yardline=20, down=4, ydstogo=3,
              off_to=1, def_to=2, clock_running=False)
    evs = ev(s)
    results.append(("field goal rejected when down 4",
                    evs["field_goal"] < evs["pass"],
                    f"fg={evs['field_goal']:.3f} pass={evs['pass']:.3f}"))

    # Trailing on a kickoff late: onside must beat a deep kick.
    from engine import KICKOFF
    s = State(seconds=50, diff=-6, phase=KICKOFF, yardline=35, off_to=1, def_to=1)
    evs = ev(s)
    results.append(("onside beats deep kick when trailing late",
                    evs["onside"] > evs["deep"],
                    f"onside={evs['onside']:.4f} deep={evs['deep']:.4f}"))

    # Leading on a kickoff: deep must beat onside.
    s = State(seconds=50, diff=6, phase=KICKOFF, yardline=35, off_to=1, def_to=1)
    evs = ev(s)
    results.append(("deep kick beats onside when leading",
                    evs["deep"] > evs["onside"],
                    f"deep={evs['deep']:.4f} onside={evs['onside']:.4f}"))

    # Spiking with plenty of clock and timeouts in hand throws away a down for
    # nothing. (Spiking on third down to guarantee a field goal attempt is a
    # different situation and a genuinely good play, so it is not tested here.)
    s = State(seconds=95, diff=-7, yardline=70, down=1, ydstogo=10,
              off_to=3, def_to=1, clock_running=True)
    evs = ev(s)
    results.append(("spike wastes a down on 1st with timeouts left",
                    evs.get("spike", 1.0) < evs["pass"],
                    f"spike={evs.get('spike'):.3f} pass={evs['pass']:.3f}"))

    return results


def era_separation() -> list[tuple[str, bool, str]]:
    """The kicking surface must move with the season, and move the right way."""
    out = []
    old, mid, new_ = load_models(1999), load_models(2012), load_models(2025)
    for dist in (25, 35, 45, 55, 62):
        a, b, c = old.fg_make(dist), mid.fg_make(dist), new_.fg_make(dist)
        # Monotone improvement across the window at every distance.
        ok = a < b < c
        out.append((f"{dist}-yd FG improves 1999 -> 2012 -> 2025", ok,
                    f"{a:.3f} -> {b:.3f} -> {c:.3f}"))
    # The gain should be roughly uniform in log-odds, which is what the fit says
    # and what makes short kicks look flat while their miss rate halves.
    import math
    lods = []
    for dist in (25, 35, 45, 55):
        a, c = old.fg_make(dist), new_.fg_make(dist)
        lods.append(math.log(c / (1 - c)) - math.log(a / (1 - a)))
    spread = max(lods) - min(lods)
    out.append(("1999->2025 gain is uniform in log-odds", spread < 0.05,
                f"gains {[round(v, 3) for v in lods]}, spread {spread:.4f}"))
    # Out-of-range seasons clamp rather than crash.
    out.append(("season clamps to the fitted range",
                load_models(1980).season == old.season and load_models(2100).season == new_.season,
                f"1980 -> {load_models(1980).season}, 2100 -> {load_models(2100).season}"))
    return out


# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plays", type=int, default=1200)
    ap.add_argument("--rollouts", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--seasons", nargs=2, type=int, default=[2016, 2025])
    args = ap.parse_args()

    seasons = list(range(args.seasons[0], args.seasons[1] + 1))
    m = load_models(2025)

    print("=" * 66)
    print("KNOWN ANSWERS")
    print("=" * 66)
    checks = known_answers(m) + era_separation()
    for name, ok, detail in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name:<46} {detail}")
    n_failed = sum(1 for _, ok, _ in checks if not ok)

    print()
    print("=" * 66)
    print(f"CALIBRATION — {args.plays:,} real states, {args.rollouts:,} rollouts each")
    print("=" * 66)
    states = build_states(seasons, args.plays, args.seed)
    print(f"  sampled from {states.game_id.nunique():,} games, "
          f"{seasons[0]}–{seasons[-1]}")

    engine_wp = np.array([
        win_probability(state_from_row(r), m, n=args.rollouts, seed=args.seed + i)[0]
        for i, r in enumerate(states.itertuples())
    ])
    vegas = states.vegas_wp.to_numpy(dtype=float)
    y = states.posteam_won.to_numpy(dtype=float)

    b_engine, b_vegas = brier(engine_wp, y), brier(vegas, y)
    # A model that always guesses the base rate. Anything worse than this is
    # not adding information.
    b_base = brier(np.full_like(y, y.mean()), y)
    print(f"\n  Brier score (lower is better)")
    print(f"    engine        {b_engine:.4f}")
    print(f"    nflfastR wp   {b_vegas:.4f}")
    print(f"    base rate     {b_base:.4f}")
    print(f"    engine skill vs base rate: {1 - b_engine / b_base:+.1%}")

    rel = reliability(engine_wp, y)
    print("\n  Reliability — engine")
    print(rel.to_string(index=False))
    print("\n  Reliability — nflfastR vegas_wp")
    print(reliability(vegas, y).to_string(index=False))

    corr = float(np.corrcoef(engine_wp, vegas)[0, 1])
    mad = float(np.mean(np.abs(engine_wp - vegas)))
    print(f"\n  Agreement with nflfastR: r={corr:.3f}, mean abs diff={mad:.3f}")

    OUT_DIR.mkdir(exist_ok=True)
    report = {
        "seasons": seasons,
        "n_states": int(len(states)),
        "n_games": int(states.game_id.nunique()),
        "rollouts_per_state": args.rollouts,
        "brier": {"engine": b_engine, "vegas_wp": b_vegas, "base_rate": b_base},
        "skill_vs_base": 1 - b_engine / b_base,
        "agreement_with_vegas_wp": {"pearson_r": corr, "mean_abs_diff": mad},
        "reliability_engine": rel.to_dict("records"),
        "reliability_vegas": reliability(vegas, y).to_dict("records"),
        "known_answers": [{"check": c, "passed": ok, "detail": d} for c, ok, d in checks],
    }
    (OUT_DIR / "validation.json").write_text(json.dumps(report, indent=2))
    print(f"\n  wrote {OUT_DIR / 'validation.json'}")

    if n_failed:
        raise SystemExit(f"\n{n_failed} known-answer check(s) failed")


if __name__ == "__main__":
    main()
