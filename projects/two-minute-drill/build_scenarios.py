"""build_scenarios.py — real endgame situations you can take over and play.

Writes `scenarios.json` (and a copy into `public/two-minute-drill/`).

A scenario is a real NFL game, picked up at a real snap inside the final two
minutes of a one-score fourth quarter, together with every play that actually
followed. The app replays history for as long as your calls match what the
coach did and hands off to the simulator the moment they do not, so each
scenario has to carry the true sequence, not just the starting position.

Selection favours games where points were scored inside the window, because a
situation that resolved into something is more interesting to inherit than one
that ran out the clock. Both sidelines are playable from the same record: the
leading team's decisions are stored in the same frame as the trailing team's,
and the app flips perspective.

Usage:
    uv run python build_scenarios.py
    uv run python build_scenarios.py --limit 400
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import nflreadpy as nfl
import numpy as np
import pandas as pd

from pbp import DEFAULT_SEASONS, load_seasons

HERE = Path(__file__).parent
PUBLIC = HERE.parent.parent / "public" / "two-minute-drill"

# A scenario must leave enough clock to be a decision rather than a formality.
MIN_SECONDS = 12
MAX_SECONDS = 120
ONE_SCORE = 8

# Playoff games reserved per season, where that many qualify. Roughly six
# postseason games a year end up one-score inside two minutes, so this takes
# most of what is available without displacing the whole regular season.
POSTSEASON_QUOTA = 6

# nflverse round codes, in the order they are played.
ROUND_NAMES = {
    "REG": "Regular season",
    "WC": "Wild Card",
    "DIV": "Divisional",
    "CON": "Conference Championship",
    "SB": "Super Bowl",
}


def load_rounds() -> dict[str, str]:
    """game_id -> WC / DIV / CON / SB / REG, from the schedule."""
    s = nfl.load_schedules().to_pandas()
    return dict(zip(s.game_id, s.game_type))


def to_action(r) -> str:
    """Map a real play to the action vocabulary the engine understands."""
    pt = r.play_type
    # Conversion attempts come first: nflverse types a two-point try as a pass
    # or a run, so checking play_type ahead of the flag labels every one of them
    # as an ordinary snap.
    if r.two_point_attempt == 1:
        return "two"
    if pt == "extra_point" or r.extra_point_attempt == 1:
        return "kick"
    if r.qb_spike == 1 or pt == "qb_spike":
        return "spike"
    if r.qb_kneel == 1 or pt == "qb_kneel":
        return "kneel"
    if pt == "field_goal":
        return "field_goal"
    if pt == "punt":
        return "punt"
    if pt == "kickoff":
        return "onside" if "onside" in str(r.desc).lower() else "deep"
    if pt == "run":
        return "run"
    if pt == "pass":
        oob = bool(pd.notna(r.desc) and ("ob at" in str(r.desc).lower()
                                         or "out of bounds" in str(r.desc).lower()))
        return "pass_sideline" if oob else "pass"
    return "pass"


def outcome_label(r) -> str:
    """A short, honest label for what the play produced."""
    if r.touchdown == 1:
        return "touchdown"
    if r.field_goal_result == "made":
        return "fg_good"
    if r.field_goal_result in ("missed", "blocked"):
        return "fg_miss"
    if r.interception == 1:
        return "interception"
    if r.fumble_lost == 1:
        return "fumble"
    if r.safety == 1:
        return "safety"
    if r.play_type == "punt":
        return "punt"
    if r.sack == 1:
        return "sack"
    if r.fourth_down_failed == 1:
        return "downs"
    if r.first_down == 1:
        return "first_down"
    if r.incomplete_pass == 1:
        return "incomplete"
    return "gain"


def clean_desc(d: str | float) -> str:
    """Trim the play description to something a scoreboard can show."""
    if not isinstance(d, str):
        return ""
    # Strip the leading "(4:58) (Shotgun)" clock/formation prefix — the app
    # already renders the clock and formation is noise here.
    out = d
    while out.startswith("("):
        close = out.find(")")
        if close == -1:
            break
        out = out[close + 1:].lstrip()
    return out[:150]


def build(df: pd.DataFrame, limit: int) -> list[dict]:
    df = df.sort_values(["game_id", "qtr", "play_id"]).reset_index(drop=True)

    window = df[
        (df.qtr == 4)
        & df.quarter_seconds_remaining.between(MIN_SECONDS, MAX_SECONDS)
        & (df.score_differential.abs() <= ONE_SCORE)
        & df.play_type.isin(["pass", "run", "punt", "field_goal"])
        & df.down.between(1, 4)
        & df.yardline_100.between(1, 99)
    ].dropna(subset=["posteam", "ydstogo", "score_differential"])

    # Rank games by how eventful the window was, so the shipped set is made of
    # situations that actually turned on something.
    scored = window.groupby("game_id").apply(
        lambda g: int(((g.touchdown == 1) | (g.field_goal_result == "made")).sum()),
        include_groups=False,
    )
    # Which round each game belongs to, straight from the schedule rather than
    # inferred from the week number. Week-to-round arithmetic moves: the wild
    # card round was week 18 through 2020 and week 19 from 2021, when the
    # regular season grew. `game_type` is unambiguous.
    rounds = load_rounds()

    # Stratify by season before ranking. Sorting the whole corpus on
    # eventfulness alone concentrates the set in whichever seasons happened to
    # produce the wildest finishes and leaves the most recent one — the season
    # a visitor is most likely to remember — with a handful of entries.
    season_of = window.groupby("game_id").season.first()
    frame = pd.DataFrame({"score": scored, "season": season_of})
    frame["round"] = [rounds.get(g, "REG") for g in frame.index]
    frame["post"] = frame["round"] != "REG"
    per_season = max(1, limit // frame.season.nunique())

    # Reserve slots for the postseason. Playoff games are about 4% of what
    # qualifies, so ranking on eventfulness alone leaves barely a handful in the
    # shipped set — and a January game is the one people actually remember, so
    # it earns a floor rather than taking its chances.
    picks: list = []
    for season, g in frame.groupby("season"):
        post = g[g.post].sort_values("score", ascending=False).head(POSTSEASON_QUOTA)
        reg = g[~g.post].sort_values("score", ascending=False).head(per_season - len(post))
        picks.append(pd.concat([post, reg]))
    order = pd.concat(picks).sort_values("score", ascending=False).index

    scenarios: list[dict] = []
    for game_id in order:
        if len(scenarios) >= limit:
            break
        g = df[df.game_id == game_id]
        starts = window[window.game_id == game_id]
        if starts.empty:
            continue
        # One scenario per game: the earliest qualifying snap, which gives the
        # player the most of the situation to work with.
        first = starts.iloc[0]
        raw = g[g.play_id >= first.play_id]

        # Which team, if any, spent a timeout immediately before each snap. This
        # has to be worked out on the unfiltered sequence: a charged timeout is
        # its own row with `play_type == "no_play"`, so shifting a snaps-only
        # frame finds none of them and every play comes back with no timeout.
        # `snap_group` counts snaps strictly before each row, which lines a
        # timeout up with the snap it precedes.
        is_snap = raw.play_type.notna() & (raw.play_type != "no_play")
        snap_group = is_snap.cumsum() - is_snap.astype(int)
        tos = raw[(raw.timeout == 1) & raw.timeout_team.notna()]
        to_by_group = dict(zip(snap_group[tos.index], tos.timeout_team))

        seq = raw[is_snap]
        if len(seq) < 2:
            continue

        # Whether the clock was moving at each snap. pbp records the time on the
        # clock but not whether it was running, and the difference is worth a
        # lot of win probability, so it is derived here from the previous play
        # rather than guessed at in the browser.
        # Deliberately derived from the previous *play* only, ignoring any
        # timeout charged in between. The player decides at this snap whether to
        # spend one, so the state they are handed has to be the state before it
        # was spent. Folding the timeout in here records the clock as already
        # stopped, the engine then declines to offer a timeout, and the call the
        # real coach made becomes one you cannot follow — which it did, on 475
        # of the snaps in this corpus.
        prev_desc = seq.desc.shift(1).fillna("")
        stopped = (
            (seq.incomplete_pass.shift(1).fillna(0) == 1)
            | prev_desc.str.contains(r"\bob\b|out of bounds", case=False)
            | seq.play_type.shift(1).fillna("").isin(
                ["punt", "kickoff", "field_goal", "extra_point"])
            | (seq.touchdown.shift(1).fillna(0) == 1)
        )
        seq = seq.assign(
            clock_running=(~stopped).fillna(False),
            timeout_before=[to_by_group.get(gp) for gp in snap_group[seq.index]],
        )

        plays = []
        for r in seq.itertuples():
            if not isinstance(r.posteam, str):
                continue
            plays.append({
                "run": bool(r.clock_running),
                "to": r.timeout_before if isinstance(r.timeout_before, str) else None,
                "posteam": r.posteam,
                "sec": None if pd.isna(r.quarter_seconds_remaining)
                       else int(r.quarter_seconds_remaining),
                "down": None if pd.isna(r.down) else int(r.down),
                "ytg": None if pd.isna(r.ydstogo) else int(r.ydstogo),
                "yl": None if pd.isna(r.yardline_100) else int(r.yardline_100),
                "diff": None if pd.isna(r.score_differential) else int(r.score_differential),
                "oto": int(r.posteam_timeouts_remaining or 0),
                "dto": int(r.defteam_timeouts_remaining or 0),
                "action": to_action(r),
                "outcome": outcome_label(r),
                "gain": None if pd.isna(r.yards_gained) else int(r.yards_gained),
                "desc": clean_desc(r.desc),
            })
        if len(plays) < 2:
            continue

        final_home = int(g.total_home_score.dropna().iloc[-1]) if g.total_home_score.notna().any() else None
        final_away = int(g.total_away_score.dropna().iloc[-1]) if g.total_away_score.notna().any() else None

        scenarios.append({
            "id": str(game_id),
            "season": int(first.season),
            "week": int(first.week),
            "type": str(first.season_type),
            "round": rounds.get(str(game_id), "REG"),
            "home": str(first.home_team),
            "away": str(first.away_team),
            "final": {"home": final_home, "away": final_away},
            # The state the player inherits.
            "start": {
                "posteam": str(first.posteam),
                "defteam": str(first.defteam),
                "sec": int(first.quarter_seconds_remaining),
                "diff": int(first.score_differential),
                "yl": int(first.yardline_100),
                "down": int(first.down),
                "ytg": int(min(first.ydstogo, first.yardline_100)),
                "oto": int(first.posteam_timeouts_remaining or 0),
                "dto": int(first.defteam_timeouts_remaining or 0),
                # The first snap of the window follows the two-minute warning
                # or a stoppage often enough that this is worth carrying rather
                # than assuming.
                "run": bool(plays[0]["run"]) if plays else False,
            },
            "plays": plays,
            "points_in_window": int(scored[game_id]),
        })
    return scenarios


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seasons", nargs=2, type=int, metavar=("FIRST", "LAST"),
                    default=[DEFAULT_SEASONS.start, DEFAULT_SEASONS.stop - 1])
    ap.add_argument("--limit", type=int, default=300)
    ap.add_argument("--out", type=Path, default=HERE / "scenarios.json")
    args = ap.parse_args()

    seasons = list(range(args.seasons[0], args.seasons[1] + 1))
    print(f"loading {seasons[0]}–{seasons[-1]} …")
    df = load_seasons(seasons)
    scenarios = build(df, args.limit)

    meta = {
        "seasons": [seasons[0], seasons[-1]],
        "count": len(scenarios),
        "filter": f"Q4, {MIN_SECONDS}-{MAX_SECONDS}s remaining, score within {ONE_SCORE}",
    }
    note = "Generated by projects/two-minute-drill/build_scenarios.py — do not hand-edit."

    # Two files. The picker only needs the situation and the teams, and that
    # index is small enough to load with the page; the real play sequences are
    # most of the weight and are not needed until someone starts a scenario.
    index = {"_note": note, "meta": meta,
             "scenarios": [{k: v for k, v in s.items() if k != "plays"} | {"n_plays": len(s["plays"])}
                           for s in scenarios]}
    plays = {"_note": note, "plays": {s["id"]: s["plays"] for s in scenarios}}

    PUBLIC.mkdir(parents=True, exist_ok=True)
    for name, payload in (("scenarios.json", index), ("scenario-plays.json", plays)):
        blob = json.dumps(payload, separators=(",", ":"), allow_nan=False)
        (PUBLIC / name).write_text(blob)
        if name == "scenarios.json":
            args.out.write_text(blob)
        print(f"wrote {name}: {len(blob) / 1024:.0f} KB")
    print(f"{len(scenarios)} scenarios")

    by_season = pd.Series([s["season"] for s in scenarios]).value_counts().sort_index()
    print("\nby season:")
    print(by_season.to_string())
    rnd = pd.Series([s["round"] for s in scenarios]).value_counts()
    print("\nby round:")
    for k in ["REG", "WC", "DIV", "CON", "SB"]:
        if k in rnd:
            print(f"  {ROUND_NAMES[k]:<26} {rnd[k]}")
    lens = [len(s["plays"]) for s in scenarios]
    print(f"\nplays per scenario: mean {np.mean(lens):.1f}, median {np.median(lens):.0f}, "
          f"max {max(lens)}")
    trailing = sum(1 for s in scenarios if s["start"]["diff"] < 0)
    print(f"start with the ball trailing: {trailing}/{len(scenarios)}")
    print("\nexamples:")
    for s in scenarios[:5]:
        st = s["start"]
        print(f"  {s['season']} W{s['week']:<2} {s['away']}@{s['home']}  "
              f"{st['posteam']} ball, {st['diff']:+d}, {st['sec']}s, "
              f"{st['down']}&{st['ytg']} at {st['yl']}  ({len(s['plays'])} plays)")


if __name__ == "__main__":
    main()
