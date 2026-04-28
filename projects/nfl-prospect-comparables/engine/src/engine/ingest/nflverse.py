"""nflverse ingestion — production loaders for the full historical window.

Each function returns a list of (partitions, arrow_table) tuples ready for
write_partition(). The orchestrator script handles skip-if-exists, manifest
logging, and S3 layout. Loaders here just pull and shape.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import nflreadpy as nfl
import polars as pl
import pyarrow as pa

# Pro-era windows. nflverse coverage varies by table; load() with a season
# range it doesn't have just returns empty for those years, which we handle
# by checking row counts before writing.
PBP_FIRST_YEAR = 1999
NEXTGEN_FIRST_YEAR = 2016
SNAPS_FIRST_YEAR = 2012
INJURIES_FIRST_YEAR = 2009
PARTICIPATION_FIRST_YEAR = 2016
FTN_FIRST_YEAR = 2022
PFR_ADV_FIRST_YEAR = 2018
DEPTH_FIRST_YEAR = 2002
ROSTERS_FIRST_YEAR = 1999
COMBINE_FIRST_YEAR = 2000
DRAFT_FIRST_YEAR = 1980
OFFICIALS_FIRST_YEAR = 2015
FF_OPP_FIRST_YEAR = 2006


def _arrow(df: pl.DataFrame) -> pa.Table:
    return df.to_arrow() if df.height > 0 else pa.table({})


def _per_season(
    loader, *, first_year: int, last_year: int, **kwargs
) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    """Pull a season at a time so each partition lands at season=YYYY/.

    Catches per-season exceptions so a transient 502 on one year doesn't kill
    the entire table. Failures are reported via stderr and logged by the
    orchestrator's manifest layer.
    """
    for year in range(first_year, last_year + 1):
        try:
            df = loader(seasons=[year], **kwargs)
        except Exception as e:
            print(f"    ! season={year} fetch failed: {type(e).__name__}: {e}")
            continue
        if df.height == 0:
            continue
        yield {"season": year}, _arrow(df)


def pbp(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield from _per_season(nfl.load_pbp, first_year=PBP_FIRST_YEAR, last_year=last_year)


def player_stats(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield from _per_season(
        nfl.load_player_stats, first_year=PBP_FIRST_YEAR, last_year=last_year
    )


def team_stats(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield from _per_season(
        nfl.load_team_stats, first_year=PBP_FIRST_YEAR, last_year=last_year
    )


def rosters(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield from _per_season(
        nfl.load_rosters, first_year=ROSTERS_FIRST_YEAR, last_year=last_year
    )


def rosters_weekly(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield from _per_season(
        nfl.load_rosters_weekly, first_year=2002, last_year=last_year
    )


def snap_counts(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield from _per_season(
        nfl.load_snap_counts, first_year=SNAPS_FIRST_YEAR, last_year=last_year
    )


def injuries(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield from _per_season(
        nfl.load_injuries, first_year=INJURIES_FIRST_YEAR, last_year=last_year
    )


def depth_charts(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield from _per_season(
        nfl.load_depth_charts, first_year=DEPTH_FIRST_YEAR, last_year=last_year
    )


def participation(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    # NFL pulled the official participation feed in 2024; nflverse keeps the
    # historical file. We pull what's there and move on — empty seasons skip.
    yield from _per_season(
        nfl.load_participation, first_year=PARTICIPATION_FIRST_YEAR, last_year=last_year
    )


def ftn_charting(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield from _per_season(
        nfl.load_ftn_charting, first_year=FTN_FIRST_YEAR, last_year=last_year
    )


def nextgen_stats(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    for stat_type in ("passing", "rushing", "receiving"):
        for year in range(NEXTGEN_FIRST_YEAR, last_year + 1):
            try:
                df = nfl.load_nextgen_stats(seasons=[year], stat_type=stat_type)
            except Exception as e:
                print(f"    ! nextgen({stat_type},{year}) failed: {e}")
                continue
            if df.height == 0:
                continue
            yield {"stat_type": stat_type, "season": year}, _arrow(df)


def pfr_advstats(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    # Two dimensions: stat_type (pass/rush/rec/def) × summary_level (week/season).
    for stat_type in ("pass", "rush", "rec", "def"):
        for level in ("season", "week"):
            for year in range(PFR_ADV_FIRST_YEAR, last_year + 1):
                try:
                    df = nfl.load_pfr_advstats(
                        seasons=[year], stat_type=stat_type, summary_level=level
                    )
                except Exception as e:
                    print(f"    ! pfr_advstats({stat_type},{level},{year}) failed: {e}")
                    continue
                if df.height == 0:
                    continue
                yield (
                    {"stat_type": stat_type, "summary_level": level, "season": year},
                    _arrow(df),
                )


def schedules(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    df = nfl.load_schedules(seasons=list(range(PBP_FIRST_YEAR, last_year + 1)))
    if df.height > 0:
        yield {}, _arrow(df)


def officials(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    df = nfl.load_officials(seasons=list(range(OFFICIALS_FIRST_YEAR, last_year + 1)))
    if df.height > 0:
        yield {}, _arrow(df)


def combine(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    df = nfl.load_combine(seasons=list(range(COMBINE_FIRST_YEAR, last_year + 1)))
    if df.height > 0:
        yield {}, _arrow(df)


def draft_picks(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    df = nfl.load_draft_picks(seasons=list(range(DRAFT_FIRST_YEAR, last_year + 1)))
    if df.height > 0:
        yield {}, _arrow(df)


def ff_opportunity(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    # Fantasy opportunity model — useful as an outcome/usage signal proxy.
    yield from _per_season(
        nfl.load_ff_opportunity, first_year=2006, last_year=last_year, stat_type="weekly"
    )


# Snapshot tables (no season partition).
def players() -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield {}, _arrow(nfl.load_players())


def teams() -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield {}, _arrow(nfl.load_teams())


def contracts() -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield {}, _arrow(nfl.load_contracts())


def trades() -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield {}, _arrow(nfl.load_trades())


def ff_playerids() -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield {}, _arrow(nfl.load_ff_playerids())


# Registry: maps table name -> loader function, used by the orchestrator.
SEASON_LOADERS = {
    "pbp": pbp,
    "player_stats": player_stats,
    "team_stats": team_stats,
    "rosters": rosters,
    "rosters_weekly": rosters_weekly,
    "snap_counts": snap_counts,
    "injuries": injuries,
    "depth_charts": depth_charts,
    "participation": participation,
    "ftn_charting": ftn_charting,
    "nextgen_stats": nextgen_stats,
    "pfr_advstats": pfr_advstats,
    "ff_opportunity": ff_opportunity,
}

WINDOW_LOADERS = {
    "schedules": schedules,
    "officials": officials,
    "combine": combine,
    "draft_picks": draft_picks,
}

SNAPSHOT_LOADERS = {
    "players": players,
    "teams": teams,
    "contracts": contracts,
    "trades": trades,
    "ff_playerids": ff_playerids,
}
