"""fit_distributions.py — the empirical outcome models the rollout engine samples from.

Writes `distributions.json`. Every number in it is estimated from nflverse
play-by-play; nothing is hand-tuned and nothing is copied from a rulebook.

Two choices worth explaining, because they shape everything downstream.

**Clock runoff is measured, not derived.** The obvious way to advance the clock
in a simulator is to encode the NFL's stoppage rules — incompletion stops it,
out of bounds stops it inside such-and-such a window, the play clock is 40
seconds. That approach is only as good as the rulebook you remember, and it
still has to guess at huddle speed. Instead we measure the actual elapsed time
between consecutive snaps in the fourth quarter and fit an empirical
distribution per outcome class. Real hurry-up behaviour, the two-minute warning,
spike timing and referee ready-for-play all come along for free.

**Play outcomes are fit on a hurry-up window, not the whole game.** A first-down
pass on the opening drive is a different animal from a first-down pass down four
with ninety seconds left. Fits use the last five minutes of either half with the
game inside 16 points, which is close enough in regime to be honest and large
enough not to be noise (43.9k passes, 21.2k runs). Rates that are situation
independent — field goal accuracy by distance, extra point rate — use every
attempt in the corpus.

Usage:
    uv run python fit_distributions.py
    uv run python fit_distributions.py --seasons 2016 2025 --out distributions.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from buckets import YTG_LABELS, YARDLINE_LABELS, yardline_band, ytg_band
from publish import publish
from pbp import DEFAULT_SEASONS, load_seasons

# The regime the play-outcome fits are estimated on: late in either half, game
# still close enough that both teams are playing situationally.
HURRY = "(qtr == 2 or qtr == 4) and half_seconds_remaining <= 300 " \
        "and abs(score_differential) <= 16"

# Clock runoff is fit on the fourth quarter only, where the hurry-up is real.
RUNOFF_WINDOW = "qtr == 4 and quarter_seconds_remaining <= 300"

# Band definitions live in `buckets.py` and nowhere else. The engine looks these
# distributions up by calling the same functions, so a second set of boundaries
# defined here would produce keys the engine never asks for — which is exactly
# what happened before, leaving every distance-conditioned lookup falling
# through to the pooled distribution without anything appearing to be wrong.

# Where the empirical yardage support gets truncated. Mass beyond these ends is
# piled onto the endpoint rather than discarded, so the PMFs still sum to 1.
RUN_CLIP = (-15, 50)
PASS_CLIP = (-10, 75)
SACK_CLIP = (-25, 0)

# nflverse describes an out-of-bounds finish as "ran ob at", "pushed ob at",
# or "out of bounds". Anchored on the token so it can't match inside a word.
OOB_RE = re.compile(r"\bob\b|out of bounds", re.IGNORECASE)

# The dynamic kickoff arrived in 2024 and changed both touchback rate and mean
# return materially, so kickoffs are fit on that era alone.
DYNAMIC_KICKOFF_FROM = 2024

# The most recent complete season. Kickoff field position is fit on this alone,
# because the touchback spot moved between 2024 and 2025.
RECENT_ERA = 2025


# ---------------------------------------------------------------------------
# PMF helpers
# ---------------------------------------------------------------------------

def pmf(values: pd.Series, clip: tuple[int, int] | None = None, *, round_to: int = 6) -> dict:
    """Empirical PMF as parallel support/cumulative arrays.

    Stored cumulatively so the TypeScript side can sample with one binary
    search over `c` instead of a linear scan, which matters when the engine is
    drawing a few million times per search.
    """
    v = pd.to_numeric(values, errors="coerce").dropna()
    if clip is not None:
        v = v.clip(clip[0], clip[1])
    v = v.round().astype(int)
    counts = v.value_counts().sort_index()
    support = counts.index.tolist()
    probs = (counts / counts.sum()).to_numpy()
    cum = np.cumsum(probs)
    cum[-1] = 1.0  # guard against float drift leaving the last bucket at 0.99999
    return {"v": support, "c": [round(float(x), round_to) for x in cum], "n": int(counts.sum())}


def rate(series: pd.Series) -> float:
    """A mean over 0/1 with NA dropped, rounded to something JSON-sane."""
    s = pd.to_numeric(series, errors="coerce").dropna()
    return round(float(s.mean()), 6) if len(s) else 0.0


def is_oob(desc: pd.Series) -> pd.Series:
    return desc.fillna("").str.contains(OOB_RE)


# ---------------------------------------------------------------------------
# Play outcome fits
# ---------------------------------------------------------------------------

def fit_run(w: pd.DataFrame) -> dict:
    r = w[(w.play_type == "run") & (w.qb_kneel != 1)].copy()
    r["band"] = r.ydstogo.map(ytg_band)
    r["oob"] = is_oob(r.desc)
    return {
        "yards": {b: pmf(g.yards_gained, RUN_CLIP) for b, g in r.groupby("band")},
        "yards_all": pmf(r.yards_gained, RUN_CLIP),
        "fumble_lost": rate(r.fumble_lost),
        "out_of_bounds": rate(r.oob),
        "touchdown_note": "scoring is decided by field position, not sampled separately",
        "n": int(len(r)),
    }


def fit_pass(w: pd.DataFrame) -> dict:
    p = w[(w.play_type == "pass") & (w.qb_spike != 1)].copy()
    p["band"] = p.ydstogo.map(ytg_band)
    comp = p[p.complete_pass == 1].copy()
    comp["oob"] = is_oob(comp.desc)
    sacks = p[p.sack == 1]
    # The engine branches out sacks and interceptions first, so the completion
    # rate it needs is conditional on the ball actually being thrown and not
    # picked — not the marginal rate over every dropback. The two differ by
    # about six points (0.571 marginal against 0.628 conditional), and feeding
    # it the marginal rate quietly makes every offence worse than the league.
    live = p[(p.sack != 1) & (p.interception != 1)]
    return {
        "complete": {b: rate(g.complete_pass) for b, g in live.groupby("band")},
        "complete_all": rate(live.complete_pass),
        "complete_marginal": rate(p.complete_pass),
        "yards_complete": {
            b: pmf(g.yards_gained, PASS_CLIP) for b, g in comp.groupby("band")
        },
        "yards_complete_all": pmf(comp.yards_gained, PASS_CLIP),
        "sack": rate(p.sack),
        "sack_yards": pmf(sacks.yards_gained, SACK_CLIP),
        "interception": rate(p.interception),
        "fumble_lost": rate(p.fumble_lost),
        # Whether a completion ends out of bounds, which is the difference
        # between the clock stopping and forty seconds evaporating.
        "out_of_bounds_given_complete": {
            b: rate(g.oob) for b, g in comp.groupby("band")
        },
        "out_of_bounds_given_complete_all": rate(comp.oob),
        "n": int(len(p)),
    }


# ---------------------------------------------------------------------------
# Field goals — a season-by-distance surface
# ---------------------------------------------------------------------------

# Field goals are fit on a much longer window than anything else, because the
# thing being estimated is a slow trend and 2016 is already the modern game.
FG_SEASONS = range(1999, 2026)

# Distances are centred and scaled so the quadratic term is well conditioned;
# seasons are centred on 2012, roughly the middle of the window.
FG_DIST_CENTRE = 45.0
FG_DIST_SCALE = 10.0
FG_SEASON_CENTRE = 2012.0

FG_GRID_LO, FG_GRID_HI = 18, 75

# Buckets used for the observed matrix that the methodology page prints. These
# are for reporting only; the engine reads the fitted surface.
FG_REPORT_BINS = [17, 29, 39, 49, 59, 75]
FG_REPORT_LABELS = ["18-29", "30-39", "40-49", "50-59", "60+"]


def _fg_design(distance: np.ndarray, season: np.ndarray) -> np.ndarray:
    d = (distance - FG_DIST_CENTRE) / FG_DIST_SCALE
    return np.column_stack([d, d ** 2, season - FG_SEASON_CENTRE])


def fit_field_goal(seasons: range = FG_SEASONS) -> dict:
    """Make probability as a function of distance *and* season.

    Kicking has improved steadily and substantially. Measured across 1999-2025,
    make rate at 30-39 yards went from .795 to .933, at 40-49 from .676 to .841,
    at 50-59 from .506 to .702. The 18-29 bucket looks flat at .953 to .982, but
    that is a ceiling effect: the miss rate more than halved.

    The specification is deliberately restrained, and the restraint is
    measured rather than assumed. Cross-validated log loss over 27,772 attempts:

        distance only                       0.40106
        distance + linear season            0.39492   <- used
        distance + season + interaction     0.39492
        distance + free per-season effects  0.39524
        distance + per-season interactions  0.39554

    Two things fall out of that. A season term earns its place. A
    season-by-distance interaction does not — the fitted interaction is -0.005
    log-odds per season per ten yards, indistinguishable from zero, which says
    the yearly gain is a uniform shift in log-odds that lifts every distance by
    the same factor on the odds scale. And free per-season effects are *worse*
    out of sample than a straight line through them, so the year-to-year wiggle
    in the raw matrix is noise and the trend is the signal.

    A quadratic season term and a knot at 2012 were both tried and neither
    improved on the straight line, so there is no evidence of a plateau.

    The fitted year coefficient is +0.041 log-odds per season, or +1.06 across
    the window — the odds of making any given kick are roughly 2.9 times what
    they were in 1999.
    """
    df = load_seasons(seasons, columns=[
        "season", "field_goal_attempt", "field_goal_result", "kick_distance",
    ])
    fg = df[(df.field_goal_attempt == 1)
            & df.field_goal_result.isin(["made", "missed", "blocked"])].copy()
    fg = fg[fg.kick_distance.between(FG_GRID_LO, FG_GRID_HI)]
    fg["made"] = (fg.field_goal_result == "made").astype(int)

    d = fg.kick_distance.to_numpy(dtype=float)
    s = fg.season.to_numpy(dtype=float)
    y = fg.made.to_numpy(dtype=int)
    model = LogisticRegression(C=1e6, max_iter=4000).fit(_fg_design(d, s), y)

    grid = np.arange(FG_GRID_LO, FG_GRID_HI + 1, dtype=float)
    by_season = {}
    for season in seasons:
        probs = model.predict_proba(_fg_design(grid, np.full_like(grid, season)))[:, 1]
        by_season[str(season)] = [round(float(v), 5) for v in probs]

    # The raw matrix, carried alongside so the methodology page can show what
    # the fit is standing on rather than asking anyone to take it on faith.
    fg["bucket"] = pd.cut(fg.kick_distance, FG_REPORT_BINS, labels=FG_REPORT_LABELS)
    observed = {}
    for (season, bucket), g in fg.groupby(["season", "bucket"], observed=True):
        observed.setdefault(str(int(season)), {})[str(bucket)] = {
            "p": round(float(g.made.mean()), 4),
            "n": int(len(g)),
        }

    coefs = model.coef_[0]
    return {
        "grid_lo": FG_GRID_LO,
        "grid_hi": FG_GRID_HI,
        "seasons": [int(seasons[0]), int(seasons[-1])],
        "make_by_season": by_season,
        "observed": observed,
        "report_labels": FG_REPORT_LABELS,
        "season_log_odds_per_year": round(float(coefs[2]), 5),
        "block_rate": rate((fg.field_goal_result == "blocked").astype(int)),
        "n": int(len(fg)),
    }


# ---------------------------------------------------------------------------
# Punts and kickoffs
# ---------------------------------------------------------------------------

def fit_punt(df: pd.DataFrame) -> dict:
    pu = df[df.punt_attempt == 1].copy()
    pu["band"] = pu.yardline_100.map(yardline_band)
    # Net = gross kick minus return. Touchbacks and downed punts have no return.
    pu["net"] = pu.kick_distance.fillna(0) - pu.return_yards.fillna(0)
    return {
        "net": {b: pmf(g.net, (0, 80)) for b, g in pu.groupby("band")},
        # Pooled fallback. Nobody punts from inside the opponent's 25, so the
        # short bands are legitimately absent and the engine needs somewhere to
        # land that is not a hardcoded band name waiting to go stale.
        "net_all": pmf(pu.net, (0, 80)),
        "touchback": {b: rate(g.touchback) for b, g in pu.groupby("band")},
        "blocked": rate(pu.punt_blocked),
        "n": int(len(pu)),
    }


def fit_kickoff(df: pd.DataFrame) -> dict:
    """Kickoff outcomes under the 2024+ dynamic kickoff only.

    Pre-2024 kickoffs describe a rule set that no longer exists, so deep-kick
    field position is fit on 2024+ alone.

    Onside attempts are identified from the play description rather than by
    kick distance. A distance threshold looks tempting but conflates declared
    onside kicks with squibs, and squibs are what a *leading* team does — using
    it produced the nonsense result that teams up nine or more onside-kick a
    third of the time. The description is unambiguous.

    The honest caveat is sample size: 107 onside attempts across 2024-2025.
    The point estimate is 7.5% against 10.2% under the old rules, but a
    Wilson interval on 8 recoveries in 107 runs from roughly 3.9% to 14.0%,
    so this supports "onside kicks got worse" and does not support a precise
    claim about how much.
    """
    d = df.sort_values(["game_id", "qtr", "play_id"]).copy()
    # `yardline_100` on a kickoff row is the kicking spot — it reads 35 on
    # essentially every play — so the drive start has to come from the next
    # snap. That next row's `yardline_100` is already in the receiving team's
    # frame, which is the frame the engine wants, so no conversion is needed.
    d["next_yl"] = d.groupby("game_id").yardline_100.shift(-1)

    ko = d[d.kickoff_attempt == 1].copy()
    ko["is_onside"] = ko.desc.fillna("").str.contains("onside", case=False)

    onside_modern = ko[(ko.season >= DYNAMIC_KICKOFF_FROM) & ko.is_onside]
    onside_legacy = ko[(ko.season < DYNAMIC_KICKOFF_FROM) & ko.is_onside]
    # Deep kicks are fit on the most recent season only. The touchback spot
    # moved from the 30 to the 35 between 2024 and 2025, so pooling the two
    # dynamic-kickoff seasons would put a bimodal touchback distribution into
    # the engine and describe a rule set nobody plays under.
    deep = ko[(ko.season >= RECENT_ERA) & ~ko.is_onside]
    return {
        "deep": {
            "touchback": rate(deep.touchback),
            "start": pmf(deep.next_yl.dropna(), (1, 99)),
            "n": int(len(deep)),
            "season": RECENT_ERA,
        },
        "onside": {
            "recover": rate(onside_modern.own_kickoff_recovery),
            "recover_legacy": rate(onside_legacy.own_kickoff_recovery),
            # Where the receiving team starts when the onside kick is not
            # recovered — a short field, which is the cost of trying one.
            "fail_start": pmf(
                onside_modern[onside_modern.own_kickoff_recovery != 1].next_yl.dropna(), (1, 99)
            ),
            "n": int(len(onside_modern)),
            "n_legacy": int(len(onside_legacy)),
            "detection": "play description contains 'onside'",
        },
        "seasons": f"{DYNAMIC_KICKOFF_FROM}+",
    }


def fit_conversions(df: pd.DataFrame) -> dict:
    return {
        "two_point": rate((df[df.two_point_attempt == 1].two_point_conv_result == "success")),
        "extra_point": rate((df[df.extra_point_attempt == 1].extra_point_result == "good")),
        "n": {
            "two_point": int((df.two_point_attempt == 1).sum()),
            "extra_point": int((df.extra_point_attempt == 1).sum()),
        },
    }


# ---------------------------------------------------------------------------
# Clock runoff
# ---------------------------------------------------------------------------

def _runoff_class(row) -> str | None:
    """Label an interval by what the play that opened it was."""
    pt = row.play_type
    if row.qb_spike == 1:
        return "spike"
    if row.qb_kneel == 1:
        return "kneel"
    if pt == "field_goal":
        return "field_goal"
    if pt == "punt":
        return "punt"
    if pt == "kickoff":
        return "kickoff"
    if pt == "pass":
        if row.sack == 1:
            return "sack"
        if row.complete_pass == 1:
            return "pass_complete_oob" if row._oob else "pass_complete_inbounds"
        return "pass_incomplete"
    if pt == "run":
        return "run_oob" if row._oob else "run_inbounds"
    return None


def fit_runoff(df: pd.DataFrame) -> dict:
    """Elapsed seconds from one snap to the next, per outcome class.

    Intervals containing a charged timeout are fit separately, because a timeout
    collapses the runoff to roughly the play's own duration. Penalty and other
    `no_play` rows are dropped from the sequence before differencing, so their
    time is absorbed into the surrounding interval rather than becoming a
    phantom class of its own.
    """
    d = df.query(RUNOFF_WINDOW).copy()
    d["_timeout"] = (d.timeout == 1).astype(int)

    # Carry any timeout charged between two snaps forward onto the interval it
    # belongs to, then drop the non-snap rows.
    d = d.sort_values(["game_id", "qtr", "play_id"])
    d["_to_next"] = d.groupby(["game_id", "qtr"])["_timeout"].shift(-1).fillna(0)
    snaps = d[d.play_type.notna() & (d.play_type != "no_play")].copy()

    snaps["_oob"] = is_oob(snaps.desc)
    snaps["_next_qsr"] = snaps.groupby(["game_id", "qtr"]).quarter_seconds_remaining.shift(-1)
    snaps["elapsed"] = snaps.quarter_seconds_remaining - snaps._next_qsr
    snaps = snaps[(snaps.elapsed >= 0) & (snaps.elapsed <= 60)]

    # Drop intervals that straddle the two-minute warning. The warning is a
    # free clock stop and it is central to how these games are played, so the
    # engine models it as an explicit event rather than letting it hide inside
    # an averaged runoff. Leaving these intervals in would then count the stop
    # twice — once in the fitted distribution and once in the engine.
    snaps = snaps[~((snaps.quarter_seconds_remaining > 120) & (snaps._next_qsr <= 120))]
    snaps["klass"] = snaps.apply(_runoff_class, axis=1)
    snaps = snaps[snaps.klass.notna()]

    # Split by what the offence is trying to do with the clock, and by how much
    # clock is left to do it in. Both matter, and pooling either one is a large
    # distortion.
    #
    # Urgency: the same completed pass takes a trailing offence in no-huddle
    # about half as long to follow up as a leading offence milking the play
    # clock.
    #
    # Time: a trailing offence is not equally hurried throughout. Measured
    # medians after a completed pass that stays inbounds — 27s with three to
    # five minutes left, 21s inside two minutes, 14s inside one. A single
    # "hurrying" distribution fit across the whole window runs at the two-minute
    # pace all the way to 0:00 and kills roughly a third of comeback drives on
    # a stopwatch that does not exist.
    snaps["urgency"] = np.where(
        snaps.score_differential < 0, "hurry",
        np.where(snaps.score_differential > 0, "bleed", "neutral"),
    )
    snaps["tband"] = np.where(snaps.quarter_seconds_remaining <= 60, "late", "mid")

    out: dict[str, dict] = {}
    for klass, g in snaps.groupby("klass"):
        plain = g[g._to_next == 0]
        entry: dict[str, dict] = {"normal": pmf(plain.elapsed, (0, 60))}
        after_to = g[g._to_next == 1]
        # Only keep a timeout-specific PMF where there is enough of one to mean
        # anything; otherwise the engine falls back to the normal cost.
        if len(after_to) >= 50:
            entry["after_timeout"] = pmf(after_to.elapsed, (0, 60))
        for urg, gu in plain.groupby("urgency"):
            if len(gu) >= 200:
                entry[urg] = pmf(gu.elapsed, (0, 60))
            for tb, gt in gu.groupby("tband"):
                if len(gt) >= 150:
                    entry[f"{urg}_{tb}"] = pmf(gt.elapsed, (0, 60))
        out[klass] = entry
    return out


# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seasons", nargs=2, type=int, metavar=("FIRST", "LAST"),
                    default=[DEFAULT_SEASONS.start, DEFAULT_SEASONS.stop - 1])
    ap.add_argument("--out", type=Path, default=Path(__file__).parent / "distributions.json")
    args = ap.parse_args()

    seasons = list(range(args.seasons[0], args.seasons[1] + 1))
    print(f"loading {seasons[0]}–{seasons[-1]} …")
    df = load_seasons(seasons)
    w = df.query(HURRY)
    print(f"  {len(df):,} plays; hurry-up window has {len(w):,}")

    out = {
        "_note": "Generated by projects/two-minute-drill/fit_distributions.py — do not hand-edit.",
        "meta": {
            "seasons": [seasons[0], seasons[-1]],
            "hurry_up_window": HURRY,
            "runoff_window": RUNOFF_WINDOW,
            "ydstogo_labels": YTG_LABELS,
            "yardline_labels": YARDLINE_LABELS,
        },
        "run": fit_run(w),
        "pass": fit_pass(w),
        "field_goal": fit_field_goal(),
        "punt": fit_punt(df),
        "kickoff": fit_kickoff(df),
        "conversion": fit_conversions(df),
        "runoff": fit_runoff(df),
    }

    blob = json.dumps(out, separators=(",", ":"), allow_nan=False)
    args.out.write_text(blob)
    publish("distributions.json", blob)
    print(f"wrote {args.out} ({len(blob) / 1024:.0f} KB)")

    # Diagnostics: the numbers most likely to be wrong, printed for eyeballing.
    fg = out["field_goal"]
    print(f"\nfield goal surface: {fg['n']:,} attempts "
          f"{fg['seasons'][0]}-{fg['seasons'][1]}, "
          f"{fg['season_log_odds_per_year']:+.4f} log-odds per season")
    print(f"  {'yds':>4}" + "".join(f"{y:>8}" for y in (1999, 2010, 2020, 2025)))
    for dist in (25, 35, 45, 50, 55, 60, 65):
        i = dist - fg["grid_lo"]
        row = "".join(f"{fg['make_by_season'][str(y)][i]:>8.3f}" for y in (1999, 2010, 2020, 2025))
        print(f"  {dist:>4}{row}")
    ko = out["kickoff"]
    print(f"\nonside recovery: {ko['onside']['recover']:.3f}  (n={ko['onside']['n']})")
    print(f"deep touchback:  {ko['deep']['touchback']:.3f}  (n={ko['deep']['n']})")
    print(f"two-point:       {out['conversion']['two_point']:.3f}")
    print("\nmedian runoff by class:")
    for klass, entry in sorted(out["runoff"].items()):
        v, c = entry["normal"]["v"], entry["normal"]["c"]
        med = v[int(np.searchsorted(c, 0.5))]
        print(f"  {klass:24s} {med:>3d}s  (n={entry['normal']['n']:,})")


if __name__ == "__main__":
    main()
