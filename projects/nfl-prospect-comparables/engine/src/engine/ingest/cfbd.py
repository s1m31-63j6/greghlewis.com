"""CFBD (CollegeFootballData) ingestion — direct REST API.

We bypass the cfbd-python wrapper because it leaks memory/CPU across calls
(linear slowdown observed in production runs). Direct requests + JSON is
simpler, faster, and gives us a stable urllib3 connection pool via
requests.Session.
"""

from __future__ import annotations

import os
import time
from collections.abc import Iterator
from typing import Any

import pyarrow as pa
import requests

CFBD_BASE = "https://api.collegefootballdata.com"
CFBD_FIRST_YEAR = 2014
SEASON_TYPES = ("regular", "postseason")
THROTTLE_SEC = 0.2

_session: requests.Session | None = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        api_key = os.environ.get("CFBD_API_KEY")
        if not api_key:
            raise RuntimeError(
                "CFBD_API_KEY not set. Sign up at https://collegefootballdata.com/."
            )
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "greghlewis-comparables/0.1",
            "Accept": "application/json",
        })
        _session = s
    return _session


def _get(path: str, params: dict[str, Any] | None = None) -> list[dict]:
    """GET an endpoint, return list-of-dicts. Retries on transient failures."""
    s = _get_session()
    url = f"{CFBD_BASE}{path}"
    for attempt in range(3):
        try:
            time.sleep(THROTTLE_SEC)
            resp = s.get(url, params=params, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []
        except Exception as e:
            if attempt == 2:
                print(f"    ! cfbd {path} {params} failed after 3 tries: {e}", flush=True)
                return []
            time.sleep(1 + attempt * 2)
    return []


def _to_arrow(rows: list[dict]) -> pa.Table:
    """Convert list-of-dicts to Arrow. Empty in → empty out."""
    if not rows:
        return pa.table({})
    # pa.Table.from_pylist handles heterogeneous nullable fields correctly
    # without pandas type inference (the source of the prior leak).
    return pa.Table.from_pylist(rows)


# ---------- per-(season, week, season_type) — heavy ----------


def plays(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    for year in range(CFBD_FIRST_YEAR, last_year + 1):
        for stype in SEASON_TYPES:
            max_week = 17 if stype == "regular" else 5
            for week in range(1, max_week + 1):
                rows = _get("/plays", {"year": year, "week": week, "seasonType": stype})
                if not rows:
                    continue
                yield (
                    {"season": year, "season_type": stype, "week": week},
                    _to_arrow(rows),
                )


def games_player_stats(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    for year in range(CFBD_FIRST_YEAR, last_year + 1):
        for stype in SEASON_TYPES:
            max_week = 17 if stype == "regular" else 5
            for week in range(1, max_week + 1):
                rows = _get(
                    "/games/players",
                    {"year": year, "week": week, "seasonType": stype},
                )
                if not rows:
                    continue
                yield (
                    {"season": year, "season_type": stype, "week": week},
                    _to_arrow(rows),
                )


# ---------- per-(season, season_type) ----------


def games(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    for year in range(CFBD_FIRST_YEAR, last_year + 1):
        for stype in SEASON_TYPES:
            rows = _get("/games", {"year": year, "seasonType": stype})
            if not rows:
                continue
            yield {"season": year, "season_type": stype}, _to_arrow(rows)


def drives(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    for year in range(CFBD_FIRST_YEAR, last_year + 1):
        for stype in SEASON_TYPES:
            rows = _get("/drives", {"year": year, "seasonType": stype})
            if not rows:
                continue
            yield {"season": year, "season_type": stype}, _to_arrow(rows)


def player_game_ppa(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
    # /ppa/players/games requires week or team; we iterate weeks.
    for year in range(CFBD_FIRST_YEAR, last_year + 1):
        for stype in SEASON_TYPES:
            max_week = 17 if stype == "regular" else 5
            for week in range(1, max_week + 1):
                rows = _get(
                    "/ppa/players/games",
                    {"year": year, "week": week, "seasonType": stype},
                )
                if not rows:
                    continue
                yield (
                    {"season": year, "season_type": stype, "week": week},
                    _to_arrow(rows),
                )


# ---------- per-season ----------


def _per_season(path: str, *, first_year: int = CFBD_FIRST_YEAR, **extra):
    def loader(last_year: int) -> Iterator[tuple[dict[str, Any], pa.Table]]:
        for year in range(first_year, last_year + 1):
            rows = _get(path, {"year": year, **extra})
            if not rows:
                continue
            yield {"season": year}, _to_arrow(rows)

    return loader


rosters = _per_season("/roster")
player_season_stats = _per_season("/stats/player/season")
player_usage = _per_season("/player/usage")
player_season_ppa = _per_season("/ppa/players/season")
team_ppa = _per_season("/ppa/teams")
recruits = _per_season("/recruiting/players", first_year=2000)
recruiting_teams = _per_season("/recruiting/teams", first_year=2000)
recruiting_groups = _per_season("/recruiting/groups", first_year=2000)
returning_production = _per_season("/player/returning")
transfer_portal = _per_season("/player/portal", first_year=2017)
sp_ratings = _per_season("/ratings/sp")
fpi_ratings = _per_season("/ratings/fpi")
srs_ratings = _per_season("/ratings/srs")
elo_ratings = _per_season("/ratings/elo")
coaches = _per_season("/coaches")
rankings = _per_season("/rankings")
betting_lines = _per_season("/lines")
draft_picks = _per_season("/draft/picks", first_year=2002)
advanced_team_season_stats = _per_season("/stats/season/advanced")
team_season_stats = _per_season("/stats/season")


# ---------- snapshot ----------


def fbs_teams() -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield {}, _to_arrow(_get("/teams/fbs"))


def conferences() -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield {}, _to_arrow(_get("/conferences"))


def venues() -> Iterator[tuple[dict[str, Any], pa.Table]]:
    yield {}, _to_arrow(_get("/venues"))


SEASON_LOADERS = {
    "plays": plays,
    "games_player_stats": games_player_stats,
    "games": games,
    "drives": drives,
    "rosters": rosters,
    "player_season_stats": player_season_stats,
    "player_usage": player_usage,
    "player_season_ppa": player_season_ppa,
    "player_game_ppa": player_game_ppa,
    "team_ppa": team_ppa,
    "recruits": recruits,
    "recruiting_teams": recruiting_teams,
    "recruiting_groups": recruiting_groups,
    "returning_production": returning_production,
    "transfer_portal": transfer_portal,
    "sp_ratings": sp_ratings,
    "fpi_ratings": fpi_ratings,
    "srs_ratings": srs_ratings,
    "elo_ratings": elo_ratings,
    "coaches": coaches,
    "rankings": rankings,
    "betting_lines": betting_lines,
    "draft_picks": draft_picks,
    "advanced_team_season_stats": advanced_team_season_stats,
    "team_season_stats": team_season_stats,
}

SNAPSHOT_LOADERS = {
    "fbs_teams": fbs_teams,
    "conferences": conferences,
    "venues": venues,
}
