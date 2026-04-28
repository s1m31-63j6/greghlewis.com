"""Build the prediction_2026 cohort by scraping Wikipedia (since nflverse
draft_picks lags). Joins with nflverse combine + ff_playerids, then runs
the existing engine.profiles.assemble pipeline.

Run from engine/:
    uv run python scripts/build_prediction_2026.py
"""

from __future__ import annotations

import io
import os
import sys

import boto3
import polars as pl
from dotenv import load_dotenv

from engine.corpus import wikipedia_draft
from engine.io import s3 as s3io
from engine.profiles import assemble

load_dotenv()


def main() -> int:
    raw = os.environ["S3_RAW_BUCKET"]
    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")

    print("=== Wikipedia 2026 draft scrape ===")
    spine = wikipedia_draft.scrape_draft(2026)
    print(f"  scraped: {spine.height} picks")
    print(f"  by category: {dict(spine.group_by('category').len().iter_rows())}")

    # Load nflverse combine (2026) — local fetch (small)
    print("\n=== Enrichment ===")
    import nflreadpy as nfl
    combine = nfl.load_combine([2026])
    print(f"  nflverse combine 2026: {combine.height} rows")
    spine = wikipedia_draft.enrich_with_combine(spine, combine)
    n_with_pfr = spine.filter(pl.col("pfr_player_id").is_not_null()).height
    print(f"  matched to combine: {n_with_pfr}/{spine.height}")

    # Load ff_playerids from raw bucket (may not have 2026 prospects yet)
    body = s3.get_object(
        Bucket=raw, Key="raw/nflverse/ff_playerids/data.parquet"
    )["Body"].read()
    ff = pl.read_parquet(io.BytesIO(body))
    print(f"  ff_playerids: {ff.height} rows")
    spine = wikipedia_draft.enrich_with_crosswalk(spine, ff)
    n_with_gsis = spine.filter(pl.col("gsis_id").is_not_null()).height
    n_with_cfbid = spine.filter(pl.col("cfb_player_id").is_not_null()).height
    print(f"  via ff_playerids: gsis_id {n_with_gsis}, cfb_player_id {n_with_cfbid}")

    # Fall back to CFBD recruits for cfb_player_id when ff_playerids missed
    # (typical for fresh draft years before nflverse propagates the new IDs).
    paginator = s3.get_paginator("list_objects_v2")
    recruit_keys = sorted([
        obj["Key"]
        for page in paginator.paginate(Bucket=raw, Prefix="raw/cfbd/recruits/")
        for obj in page.get("Contents", [])
        if obj["Key"].endswith("data.parquet")
    ])
    # 2026 NFL prospects were HS recruits in 2018-2023 (4-6 yrs back)
    relevant_keys = [k for k in recruit_keys if any(f"season={y}" in k for y in range(2018, 2024))]
    recruits = pl.concat(
        [pl.read_parquet(io.BytesIO(s3.get_object(Bucket=raw, Key=k)["Body"].read())) for k in relevant_keys],
        how="vertical_relaxed",
    )
    print(f"  CFBD recruits {min(range(2018,2024))}-{max(range(2018,2024))}: {recruits.height} rows")
    spine = wikipedia_draft.enrich_with_cfbd_recruits(spine, recruits)
    n_with_cfbid = spine.filter(pl.col("cfb_player_id").is_not_null()).height
    print(f"  total with cfb_player_id: {n_with_cfbid}/{spine.height}")

    # Filter to skill positions + project to assemble.load_prediction_spine schema
    skill_spine = spine.filter(
        pl.col("category").is_in(["QB", "RB", "WR", "TE"])
    ).select(
        "season", "round", "pick", "team",
        "gsis_id", "pfr_player_id", "cfb_player_id", "pfr_player_name",
        "college", "position", "category",
        pl.col("age").cast(pl.Float64, strict=False).alias("age_at_draft"),
    )
    print(f"\n=== Skill cohort spine: {skill_spine.height} prospects ===")
    print(skill_spine.group_by("category").len().sort("category"))

    # Persist scraped spine to raw bucket for traceability
    buf = io.BytesIO()
    spine.write_parquet(buf)
    s3.put_object(
        Bucket=raw,
        Key=f"raw/wikipedia/draft_picks/season=2026/data.parquet",
        Body=buf.getvalue(),
    )
    print(f"  → s3://{raw}/raw/wikipedia/draft_picks/season=2026/data.parquet")

    # Build profiles via existing assemble pipeline
    print("\n=== Assembling PlayerProfile records ===")
    profiles, coverage = assemble.assemble_cohort(
        skill_spine, raw_bucket=raw, has_outcome=False, allow_synthetic_id=True
    )
    print(f"  built: {len(profiles)} profiles")
    for k, v in coverage.items():
        print(f"    {k}: {v}")

    uri = assemble.write_jsonl(profiles, name="prediction_2026")
    print(f"  → {uri}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
