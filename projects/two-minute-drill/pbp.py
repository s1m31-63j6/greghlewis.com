"""nflverse play-by-play access with an on-disk cache.

Every other script in this project starts here. The nflverse release assets are
plain parquet files (~20 MB per season), so the cheapest thing that works is to
mirror them into `data/pbp/` once and read from disk afterwards. That directory
is gitignored; nothing here writes into the repo proper.

The engine only ever reasons about the fourth quarter, but the *fits* want more
than that — field goal rates, punt nets and yards-gained distributions are all
estimated league-wide across the full game, because restricting them to the last
two minutes would leave a few hundred samples per bucket instead of tens of
thousands. `load_seasons` therefore returns whole seasons and the callers filter.

Usage:
    from pbp import load_seasons, ENDGAME_QUERY
    df = load_seasons(range(2016, 2026))
    endgame = df.query(ENDGAME_QUERY)
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable

import pandas as pd
import pyarrow.parquet as pq
import requests

DATA_DIR = Path(__file__).parent / "data" / "pbp"
RELEASE = "https://github.com/nflverse/nflverse-data/releases/download/pbp"

# nflverse pbp goes back to 1999. We default to 2016+ because the fits that
# matter here — kickoff placement, two-point rates, fourth-down aggression —
# have all moved enough since 2015 that older seasons describe a different game.
DEFAULT_SEASONS = range(2016, 2026)

# The situation this project is about: fourth quarter, two minutes or less,
# game inside one score. `abs(score_differential) <= 8` is the standard
# one-score definition (a touchdown and a two-point conversion).
ENDGAME_QUERY = "qtr == 4 and quarter_seconds_remaining <= 120 and abs(score_differential) <= 8"

# Only the columns anything downstream actually reads. Loading all ~380 pbp
# columns for ten seasons is about 2 GB resident; this is about 120 MB.
COLUMNS = [
    # identity
    "game_id", "season", "season_type", "week", "home_team", "away_team",
    "posteam", "defteam", "posteam_type", "play_id", "desc",
    # clock and situation
    "qtr", "quarter_seconds_remaining", "half_seconds_remaining",
    "game_seconds_remaining", "down", "ydstogo", "yardline_100", "goal_to_go",
    "score_differential", "score_differential_post",
    "posteam_score", "defteam_score", "total_home_score", "total_away_score",
    "posteam_timeouts_remaining", "defteam_timeouts_remaining",
    # play classification
    "play_type", "play_type_nfl", "pass_attempt", "rush_attempt", "qb_spike",
    "qb_kneel", "qb_scramble", "shotgun", "no_huddle", "penalty", "aborted_play",
    # outcomes
    "yards_gained", "complete_pass", "incomplete_pass", "interception", "sack",
    "fumble_lost", "touchdown", "pass_touchdown", "rush_touchdown", "safety",
    "first_down", "third_down_converted", "fourth_down_converted",
    "fourth_down_failed",
    # special teams
    "field_goal_attempt", "field_goal_result", "kick_distance",
    "extra_point_attempt", "extra_point_result",
    "two_point_attempt", "two_point_conv_result",
    "punt_attempt", "punt_blocked", "touchback", "punt_out_of_bounds",
    "punt_downed", "punt_fair_catch", "punt_inside_twenty",
    "kickoff_attempt", "own_kickoff_recovery", "return_yards",
    # clock mechanics
    "timeout", "timeout_team", "play_clock", "drive", "series",
    # nflverse's own drive bookkeeping — authoritative, and far safer than
    # walking the play sequence by hand looking for a change of possession.
    "fixed_drive", "fixed_drive_result", "drive_end_transition",
    # model outputs we validate against
    "wp", "def_wp", "vegas_wp", "wpa", "ep", "epa", "result", "spread_line",
    "total_line", "location", "roof", "surface",
]


def _cache_path(season: int) -> Path:
    return DATA_DIR / f"play_by_play_{season}.parquet"


def fetch_season(season: int, *, force: bool = False) -> Path:
    """Mirror one season's parquet into the local cache. Returns the path."""
    dest = _cache_path(season)
    if dest.exists() and not force:
        return dest
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    url = f"{RELEASE}/play_by_play_{season}.parquet"
    print(f"  downloading {season} …", end="", flush=True, file=sys.stderr)
    resp = requests.get(url, timeout=300)
    if resp.status_code == 404:
        raise FileNotFoundError(
            f"nflverse has no play-by-play for {season} yet ({url}). "
            "In-season data appears nightly once the season starts."
        )
    resp.raise_for_status()
    # Write via a temp file so an interrupted download never leaves a truncated
    # parquet in the cache that later runs would happily read as complete.
    tmp = dest.with_suffix(".parquet.part")
    tmp.write_bytes(resp.content)
    tmp.rename(dest)
    print(f" {len(resp.content) / 1e6:.1f} MB", file=sys.stderr)
    return dest


def load_seasons(
    seasons: Iterable[int] = DEFAULT_SEASONS,
    *,
    columns: list[str] | None = None,
    regular_season_only: bool = False,
) -> pd.DataFrame:
    """Load one or more seasons of play-by-play into a single frame.

    Missing columns are tolerated — nflverse has added fields over time, and an
    older season legitimately lacks a few of them. Anything absent comes back
    as all-NA rather than raising, so the fits can decide what to do about it.
    """
    cols = COLUMNS if columns is None else columns
    frames = []
    for season in seasons:
        path = fetch_season(season)
        # Read the parquet schema without materialising the data, so we can
        # intersect the requested columns against what this season actually has.
        present = set(pq.read_schema(path).names)
        usable = [c for c in cols if c in present]
        df = pd.read_parquet(path, columns=usable, engine="pyarrow")
        for missing in (c for c in cols if c not in present):
            df[missing] = pd.NA
        frames.append(df[cols])
    out = pd.concat(frames, ignore_index=True)
    if regular_season_only:
        out = out[out.season_type == "REG"].reset_index(drop=True)
    return out


def endgame(df: pd.DataFrame) -> pd.DataFrame:
    """The one-score, final-two-minutes subset this project is built around."""
    return df.query(ENDGAME_QUERY).reset_index(drop=True)


if __name__ == "__main__":
    seasons = [int(a) for a in sys.argv[1:]] or list(DEFAULT_SEASONS)
    print(f"caching {len(seasons)} season(s): {seasons[0]}–{seasons[-1]}", file=sys.stderr)
    df = load_seasons(seasons)
    eg = endgame(df)
    print(f"\n{len(df):,} plays across {df.game_id.nunique():,} games")
    print(f"{len(eg):,} endgame plays across {eg.game_id.nunique():,} games")
