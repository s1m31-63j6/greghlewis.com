"""Phase 0 smoke test — proves the ingestion → S3 pipeline works end to end.

Pulls a small slice of nflverse data and (optionally) a CFBD query, writes
both to the raw S3 bucket as parquet, and verifies the writes.

Run from engine/:
    uv run python scripts/smoke_test_ingest.py
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

from engine.ingest import cfbd, nflverse
from engine.io import s3

load_dotenv()

RAW_BUCKET = os.environ["S3_RAW_BUCKET"]


def smoke_nflverse() -> None:
    print("→ nflverse: pulling 2024 season player stats...")
    table = nflverse.fetch_player_stats(seasons=[2024])
    key = "smoke/nflverse/player_stats_2024.parquet"
    s3.write_parquet(table, RAW_BUCKET, key)
    head = s3.head_object(RAW_BUCKET, key)
    print(f"  ✓ wrote {table.num_rows:,} rows to s3://{RAW_BUCKET}/{key}")
    print(f"  ✓ size: {head['ContentLength']:,} bytes")


def smoke_cfbd() -> None:
    if not os.environ.get("CFBD_API_KEY"):
        print("→ cfbd: SKIPPED (CFBD_API_KEY not set)")
        return
    print("→ cfbd: pulling 2024 week 1 games...")
    table = cfbd.fetch_games(year=2024, week=1)
    key = "smoke/cfbd/games_2024_w1.parquet"
    s3.write_parquet(table, RAW_BUCKET, key)
    head = s3.head_object(RAW_BUCKET, key)
    print(f"  ✓ wrote {table.num_rows:,} rows to s3://{RAW_BUCKET}/{key}")
    print(f"  ✓ size: {head['ContentLength']:,} bytes")


if __name__ == "__main__":
    smoke_nflverse()
    smoke_cfbd()
    print("\nSmoke test complete.")
