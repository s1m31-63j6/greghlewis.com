"""fit_tendencies.py — what an average NFL coach actually does, by situation.

Writes `tendencies.json`. This is the policy the simulated opponent follows,
and it is also the policy both teams follow *after* the root decision during a
rollout. That makes the engine's output mean something specific and worth
stating plainly: the win probability attached to an action is the probability
of winning if you take that action now and everyone plays like an average NFL
team from there on. It is not the probability of winning against optimal play,
and it is not a claim about what a great coach would do.

Modelling the opponent this way is a deliberate choice. A solver that assumed
optimal play on both sides would be recursive, far more expensive, and would
answer a question nobody asked — you are not playing Belichick's ghost, you are
playing the league.

Tables are emitted at three levels of specificity. The engine looks up the most
specific key first and falls back when a bucket is too thin to trust, which is
why every entry carries its sample count.

Usage:
    uv run python fit_tendencies.py
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from buckets import diff_band, key, time_band, yardline_band, ytg_band
from publish import publish
from pbp import DEFAULT_SEASONS, load_seasons

# A bucket needs at least this many observations before the engine will use it
# instead of falling back to a coarser table.
MIN_N = 25

# Tendencies are fit on the fourth quarter from five minutes out. Earlier-game
# fourth-down behaviour is a different decision problem (field position and
# expected points rather than the clock), so pooling it in would blur exactly
# the situations this project is about.
WINDOW = "qtr == 4 and quarter_seconds_remaining <= 300"


def _shares(g: pd.DataFrame, col: str, options: list[str]) -> dict:
    counts = g[col].value_counts()
    n = int(counts.sum())
    return {
        "p": {o: round(float(counts.get(o, 0)) / n, 5) for o in options},
        "n": n,
    }


def _table(df: pd.DataFrame, col: str, options: list[str], levels: list[list[str]]) -> dict:
    """Build one decision's tables at several specificity levels.

    `levels` is ordered most-specific first. Buckets thinner than MIN_N are
    dropped rather than emitted, so a lookup miss is the signal to fall back.
    """
    out = {}
    for i, cols in enumerate(levels):
        name = f"L{i}"
        tbl = {}
        for kv, g in df.groupby(cols, observed=True):
            kv = kv if isinstance(kv, tuple) else (kv,)
            entry = _shares(g, col, options)
            if entry["n"] >= MIN_N:
                tbl[key(*[str(x) for x in kv])] = entry
        out[name] = {"by": cols, "table": tbl}
    out["global"] = _shares(df, col, options)
    return out


# Fourth-down behaviour is fit on a tighter window than everything else.
# Inside two and a half minutes a trailing team has essentially no chance of
# getting the ball back, and the real punt rate for one collapses to near zero
# (0.3% in a matched sample). Fitting on the full five-minute window pools in
# situations where punting is still sensible and leaves the engine punting away
# roughly one comeback drive in eight.
FOURTH_DOWN_WINDOW = "qtr == 4 and quarter_seconds_remaining <= 150"


def fourth_down(w: pd.DataFrame) -> dict:
    """Go / kick / punt, as coaches actually called it."""
    d = w.query(FOURTH_DOWN_WINDOW)
    d = d[(d.down == 4) & d.play_type.notna()].copy()
    d = d[d.play_type.isin(["pass", "run", "field_goal", "punt", "qb_kneel"])]
    d["choice"] = d.play_type.map(
        {"pass": "go", "run": "go", "qb_kneel": "kneel",
         "field_goal": "fg", "punt": "punt"}
    )
    d = _annotate(d)
    # Fallback order matters more here than anywhere else in the file. Score
    # and clock are what decide whether a team punts; distance and field
    # position only shape how likely the attempt is to work. An earlier version
    # fell back to distance-and-field-position alone, which pooled trailing
    # teams together with leading ones and told the engine that a team down
    # three with 1:40 left punts on 4th-and-8 about 70% of the time. Score
    # context is therefore given up last.
    return _table(d, "choice", ["go", "fg", "punt", "kneel"], [
        ["ytg_b", "yl_b", "time_b", "diff_b"],
        ["yl_b", "diff_b", "time_b"],
        ["ytg_b", "yl_b", "diff_b"],
        ["yl_b", "diff_b"],
        ["ytg_b", "yl_b"],
    ])


def play_call(w: pd.DataFrame) -> dict:
    """Run / pass / spike / kneel on first through third down.

    Spikes and kneels have to be admitted here, not filtered out. nflverse
    gives a spike `play_type == "pass"` and a kneel its own `qb_kneel` type, so
    restricting to pass and run silently drops every kneel and leaves the
    engine unable to run out a lead the way real teams do.
    """
    d = w[(w.down.isin([1, 2, 3])) & w.play_type.notna()].copy()
    d = d[d.play_type.isin(["pass", "run", "qb_kneel", "qb_spike", "field_goal"])]
    d["choice"] = "pass"
    d.loc[d.play_type == "run", "choice"] = "run"
    d.loc[d.play_type == "field_goal", "choice"] = "fg"
    d.loc[(d.qb_spike == 1) | (d.play_type == "qb_spike"), "choice"] = "spike"
    d.loc[(d.qb_kneel == 1) | (d.play_type == "qb_kneel"), "choice"] = "kneel"
    d = _annotate(d)
    # Field goals belong in the early-down option set. A team in range with a
    # few seconds left kicks on second down rather than running another play,
    # and leaving that out gives the engine no way to end a drive except by
    # scoring a touchdown, turning it over, or letting the clock expire —
    # which it then does on about a third of drives against a real rate of
    # under five percent.
    return _table(d, "choice", ["run", "pass", "fg", "spike", "kneel"], [
        ["down_s", "ytg_b", "yl_b", "time_b", "diff_b"],
        ["yl_b", "time_b", "diff_b"],
        ["ytg_b", "time_b", "diff_b"],
        ["time_b", "diff_b"],
    ])


def two_point(df: pd.DataFrame) -> dict:
    """Whether a team goes for two after a touchdown, keyed on the exact score.

    This one decision refuses to be bucketed. The conversion charts every team
    carries are step functions on the exact differential — down 2 go, down 3
    kick, down 5 go, down 10 go — and the data reproduces them cleanly: 80% go
    at down 2, 85% at down 10, 85% at up 1, under 1% at down 3. Grouping those
    into a "down 1-3" band averages a go decision and a kick decision together
    and produces a number that describes neither.

    `score_differential` on a PAT row is post-touchdown and pre-try, which is
    exactly the number the decision keys off.
    """
    d = df[(df.two_point_attempt == 1) | (df.extra_point_attempt == 1)].copy()
    d["choice"] = d.two_point_attempt.fillna(0).map({1: "two", 0: "kick"})
    d["exact"] = d.score_differential.fillna(0).clip(-16, 16).astype(int).astype(str)
    return _table(d, "choice", ["two", "kick"], [["exact"]])


def onside(df: pd.DataFrame) -> dict:
    """Whether a kicking team declares an onside attempt, by score and time.

    Identified from the play description. Kick distance is not a usable proxy:
    a leading team's squib is also a short kick, so thresholding on distance
    reports leading teams as the most frequent onside kickers.
    """
    d = df[(df.kickoff_attempt == 1) & (df.qtr == 4)].copy()
    d["choice"] = d.desc.fillna("").str.contains("onside", case=False).map(
        {True: "onside", False: "deep"}
    )
    # On a kickoff row nflverse sets `posteam` to the RECEIVING team (verified:
    # it matches the next snap's posteam on 98.5% of kickoffs), so
    # `score_differential` is in the receiver's frame. The decision belongs to
    # the kicking team, so the sign flips. Without this the table reports that
    # teams leading by nine or more are the league's most eager onside kickers.
    d["diff_b"] = (-d.score_differential.fillna(0)).map(diff_band)
    d["time_b"] = d.quarter_seconds_remaining.fillna(0).map(time_band)
    return _table(d, "choice", ["onside", "deep"], [["diff_b", "time_b"], ["diff_b"]])


def _timeout_table(w: pd.DataFrame, side: str) -> dict:
    """How often one side stops the clock, given it has a timeout to spend.

    Measured as: of all snaps in this bucket where that side had a timeout
    left, on what share was one charged before the next snap.

    Both sides matter. Fitting only the defence — as an earlier version did —
    leaves a trailing offence in the rollout unable to stop the clock, which
    makes every comeback drive slower than the real thing and drags trailing
    win probabilities well below what actually happens.
    """
    team_col = "posteam" if side == "offense" else "defteam"
    to_col = f"{'pos' if side == 'offense' else 'def'}team_timeouts_remaining"

    d = w.sort_values(["game_id", "play_id"]).copy()
    is_snap = d.play_type.notna() & (d.play_type != "no_play")

    # A charged timeout is its own row with `play_type == "no_play"` (2,375 of
    # 2,399 in a spot check), so it cannot be found by shifting a frame that
    # has already dropped non-snaps — do that and every timeout rate comes back
    # as a flat zero, and the rollout's offence never stops the clock.
    #
    # `snap_group` counts snaps strictly before each row, which lines a timeout
    # up with the snap it immediately precedes. That is the orientation the
    # engine needs: standing at this down and distance, do I spend a timeout
    # before snapping?
    d["snap_group"] = is_snap.groupby(d.game_id).cumsum() - is_snap.astype(int)
    tos = d[(d.timeout == 1) & d.timeout_team.notna()]
    called = {
        (g, grp, team)
        for g, grp, team in zip(tos.game_id, tos.snap_group, tos.timeout_team)
    }

    d = d[is_snap & (d[to_col].fillna(0) > 0)]
    d = d.assign(choice=[
        "timeout" if (g, grp, team) in called else "none"
        for g, grp, team in zip(d.game_id, d.snap_group, d[team_col])
    ])
    d = _annotate(d)
    return _table(d, "choice", ["timeout", "none"], [
        ["time_b", "diff_b", "down_s"],
        ["time_b", "diff_b"],
    ])


def _annotate(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    d["time_b"] = d.quarter_seconds_remaining.fillna(0).map(time_band)
    d["diff_b"] = d.score_differential.fillna(0).map(diff_band)
    d["ytg_b"] = d.ydstogo.fillna(10).map(ytg_band)
    d["yl_b"] = d.yardline_100.fillna(50).map(yardline_band)
    d["down_s"] = d.down.fillna(1).astype(int).astype(str)
    return d


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seasons", nargs=2, type=int, metavar=("FIRST", "LAST"),
                    default=[DEFAULT_SEASONS.start, DEFAULT_SEASONS.stop - 1])
    ap.add_argument("--out", type=Path, default=Path(__file__).parent / "tendencies.json")
    args = ap.parse_args()

    seasons = list(range(args.seasons[0], args.seasons[1] + 1))
    print(f"loading {seasons[0]}–{seasons[-1]} …")
    df = load_seasons(seasons)
    w = df.query(WINDOW)
    print(f"  {len(w):,} plays in the Q4 five-minute window")

    out = {
        "_note": "Generated by projects/two-minute-drill/fit_tendencies.py — do not hand-edit.",
        "meta": {
            "seasons": [seasons[0], seasons[-1]],
            "window": WINDOW,
            "min_n": MIN_N,
            "interpretation": (
                "Conditional action frequencies for an average NFL team. The engine "
                "uses these as the rollout policy for both sides after the root "
                "decision, so its win probabilities describe play against the league, "
                "not against an optimal opponent."
            ),
        },
        "fourth_down": fourth_down(w),
        "play_call": play_call(w),
        "two_point": two_point(df),
        "onside": onside(df),
        "offensive_timeout": _timeout_table(w, "offense"),
        "defensive_timeout": _timeout_table(w, "defense"),
    }

    blob = json.dumps(out, separators=(",", ":"), allow_nan=False)
    args.out.write_text(blob)
    publish("tendencies.json", blob)
    print(f"wrote {args.out} ({len(blob) / 1024:.0f} KB)")

    print("\nfourth-down go rate by distance and field position (coarsest table):")
    tbl = out["fourth_down"]["L2"]["table"]
    for k in sorted(tbl):
        e = tbl[k]
        print(f"  {k:<14} go={e['p']['go']:.2f} fg={e['p']['fg']:.2f} "
              f"punt={e['p']['punt']:.2f}  (n={e['n']:,})")
    print("\ntwo-point rate by exact differential faced:")
    for k, e in sorted(out["two_point"]["L0"]["table"].items(), key=lambda kv: int(kv[0])):
        print(f"  {k:>4} two={e['p']['two']:.3f}  (n={e['n']:,})")
    print("\nonside rate by differential:")
    for k, e in sorted(out["onside"]["L1"]["table"].items()):
        print(f"  {k:<10} onside={e['p']['onside']:.3f}  (n={e['n']:,})")


if __name__ == "__main__":
    main()
