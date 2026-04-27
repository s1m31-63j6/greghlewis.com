"""nflverse ingestion via nflreadpy."""

from __future__ import annotations

import nflreadpy as nfl
import polars as pl
import pyarrow as pa


def fetch_pbp(seasons: list[int]) -> pa.Table:
    """Pull NFL play-by-play for the given seasons. Returns Arrow table."""
    df: pl.DataFrame = nfl.load_pbp(seasons=seasons)
    return df.to_arrow()


def fetch_player_stats(seasons: list[int]) -> pa.Table:
    """Pull weekly player stats for the given seasons."""
    df: pl.DataFrame = nfl.load_player_stats(seasons=seasons)
    return df.to_arrow()
