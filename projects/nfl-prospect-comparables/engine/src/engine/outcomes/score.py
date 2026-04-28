"""Outcome scoring.

Joins nflverse `draft_picks` (already has career probowls / allpro / seasons_started)
with aggregated `snap_counts` (career snap totals) to produce a labeled outcome
per drafted skill-position player.

Usage (programmatic):
    from engine.outcomes import score
    df = score.label_cohort(first_year=2014, last_year=2020, settled_through=2025)
"""

from __future__ import annotations

import io
import os

import boto3
import polars as pl
import pyarrow as pa
import pyarrow.parquet as pq

from engine.io import s3 as s3io
from engine.schema import (
    HOF_TRACK_PRO_BOWLS,
    HOF_TRACK_REQUIRES_ALL_PRO,
    PRO_BOWL_MIN,
    ROLE_MIN_SNAPS,
    STARTER_MIN_SNAPS,
    STARTER_MIN_STARTING_SEASONS,
    OutcomeClass,
)

SKILL_CATEGORIES = ("QB", "RB", "WR", "TE")
SNAPS_FIRST_YEAR = 2012  # nflverse snap_counts coverage


def _read_parquet_from_s3(key: str) -> pl.DataFrame:
    bucket = os.environ["S3_RAW_BUCKET"]
    body = s3io._client().get_object(Bucket=bucket, Key=key)["Body"].read()
    return pl.read_parquet(io.BytesIO(body))


def _list_keys(prefix: str) -> list[str]:
    bucket = os.environ["S3_RAW_BUCKET"]
    paginator = s3io._client().get_paginator("list_objects_v2")
    keys: list[str] = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])
    return keys


def load_career_snaps(through_season: int) -> pl.DataFrame:
    """Aggregate per-game snap_counts into career totals per pfr_player_id."""
    keys = sorted(
        k for k in _list_keys("raw/nflverse/snap_counts/")
        if k.endswith("data.parquet")
    )
    frames: list[pl.DataFrame] = []
    for k in keys:
        season = int(k.split("season=")[1].split("/")[0])
        if season > through_season:
            continue
        frames.append(_read_parquet_from_s3(k))
    if not frames:
        return pl.DataFrame(schema={"pfr_player_id": pl.Utf8, "career_snaps": pl.Int64})
    snaps = pl.concat(frames, how="vertical_relaxed")
    return (
        snaps
        .with_columns(
            (
                pl.col("offense_snaps").fill_null(0)
                + pl.col("defense_snaps").fill_null(0)
                + pl.col("st_snaps").fill_null(0)
            ).alias("total_snaps")
        )
        .group_by("pfr_player_id")
        .agg(pl.col("total_snaps").sum().alias("career_snaps"))
    )


def _classify_row(
    pro_bowls: int, all_pros: int, snaps: int, starting_seasons: int
) -> str:
    """Mirrors engine.schema.classify_outcome() but operates on raw ints so we
    can apply it as a polars expression without instantiating a Pydantic model
    per row (~600 of which is fine, but this generalizes to the full cohort)."""
    if pro_bowls >= HOF_TRACK_PRO_BOWLS and all_pros >= HOF_TRACK_REQUIRES_ALL_PRO:
        return OutcomeClass.HOF_TRACK.value
    if pro_bowls >= PRO_BOWL_MIN:
        return OutcomeClass.PRO_BOWL.value
    if snaps >= STARTER_MIN_SNAPS and starting_seasons >= STARTER_MIN_STARTING_SEASONS:
        return OutcomeClass.STARTER.value
    if snaps >= ROLE_MIN_SNAPS:
        return OutcomeClass.ROLE.value
    return OutcomeClass.BUST.value


def label_cohort(
    *,
    first_year: int,
    last_year: int,
    settled_through: int,
) -> pl.DataFrame:
    """Returns one labeled row per drafted skill-position player in the window.

    Columns:
        season, round, pick, team, gsis_id, pfr_player_id, cfb_player_id,
        pfr_player_name, college, position, category,
        pro_bowls, all_pros, seasons_started, games, w_av,
        career_snaps, settled_through_season, outcome_class
    """
    draft = _read_parquet_from_s3("raw/nflverse/draft_picks/data.parquet")
    cohort = draft.filter(
        pl.col("season").is_between(first_year, last_year)
        & pl.col("category").is_in(SKILL_CATEGORIES)
    )

    snaps = load_career_snaps(through_season=settled_through)
    joined = cohort.join(snaps, on="pfr_player_id", how="left").with_columns(
        pl.col("career_snaps").fill_null(0)
    )

    labeled = joined.with_columns(
        pl.struct(["probowls", "allpro", "career_snaps", "seasons_started"])
        .map_elements(
            lambda r: _classify_row(
                r["probowls"] or 0,
                r["allpro"] or 0,
                r["career_snaps"] or 0,
                r["seasons_started"] or 0,
            ),
            return_dtype=pl.Utf8,
        )
        .alias("outcome_class"),
        pl.lit(settled_through).alias("settled_through_season"),
    )

    return labeled.select(
        [
            "season", "round", "pick", "team",
            "gsis_id", "pfr_player_id", "cfb_player_id", "pfr_player_name",
            "college", "position", "category",
            pl.col("probowls").alias("pro_bowls"),
            pl.col("allpro").alias("all_pros"),
            "seasons_started", "games", "w_av",
            "career_snaps", "settled_through_season", "outcome_class",
        ]
    )


def write_to_curated(df: pl.DataFrame, *, name: str) -> str:
    """Write labeled cohort to the curated bucket. Returns the s3 key."""
    bucket = os.environ["S3_CURATED_BUCKET"]
    key = f"outcomes/{name}/data.parquet"
    buf = io.BytesIO()
    pq.write_table(df.to_arrow(), buf, compression="zstd")
    buf.seek(0)
    s3io._client().put_object(Bucket=bucket, Key=key, Body=buf.getvalue())
    return f"s3://{bucket}/{key}"
