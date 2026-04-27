"""CFBD (CollegeFootballData) ingestion."""

from __future__ import annotations

import os

import cfbd
import pandas as pd
import pyarrow as pa


def _client() -> cfbd.ApiClient:
    api_key = os.environ.get("CFBD_API_KEY")
    if not api_key:
        raise RuntimeError(
            "CFBD_API_KEY not set. Sign up at https://collegefootballdata.com/ and add to .env"
        )
    cfg = cfbd.Configuration()
    cfg.api_key["Authorization"] = api_key
    cfg.api_key_prefix["Authorization"] = "Bearer"
    return cfbd.ApiClient(cfg)


def fetch_games(year: int, week: int | None = None) -> pa.Table:
    """Pull college football games for the given year (and optional week)."""
    api = cfbd.GamesApi(_client())
    games = api.get_games(year=year, week=week) if week else api.get_games(year=year)
    rows = [g.to_dict() for g in games]
    return pa.Table.from_pandas(pd.DataFrame(rows))
