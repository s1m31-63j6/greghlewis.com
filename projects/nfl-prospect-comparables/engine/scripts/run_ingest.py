"""Production ingest orchestrator.

Pulls every registered (source, table) loader to S3 raw zone, idempotent on
rerun (skips partitions whose S3 key already exists). Writes a per-run JSONL
manifest at manifests/ingest_runs/run=<ts>/manifest.jsonl.

Usage (from engine/):
    uv run python scripts/run_ingest.py                  # everything
    uv run python scripts/run_ingest.py --source nflverse # one source
    uv run python scripts/run_ingest.py --source cfbd --table plays
    uv run python scripts/run_ingest.py --force          # overwrite
    uv run python scripts/run_ingest.py --last-year 2025 # cap year window

Designed for laptop runs. Keep the terminal open; manifests flush at the end.
"""

from __future__ import annotations

import argparse
import functools
import os
import sys
import time
import traceback
from collections.abc import Iterator
from typing import Any

# Flush every print so progress is visible when stdout is piped to tee or a
# log file. The default block-buffering hid hours of progress in the first
# CFBD run.
print = functools.partial(print, flush=True)  # noqa: A001

from dotenv import load_dotenv

from engine.ingest import cfbd as cfbd_ingest
from engine.ingest import nflverse as nfl_ingest
from engine.io import raw
from engine.io.manifest import ManifestEntry, ManifestLog

load_dotenv()

DEFAULT_LAST_YEAR = 2025  # bump when next season's data is fully posted

# Source registry: source_name -> {table_name: (loader, takes_last_year)}
SOURCES: dict[str, dict[str, tuple[Any, bool]]] = {
    "nflverse": {
        **{name: (fn, True) for name, fn in nfl_ingest.SEASON_LOADERS.items()},
        **{name: (fn, True) for name, fn in nfl_ingest.WINDOW_LOADERS.items()},
        **{name: (fn, False) for name, fn in nfl_ingest.SNAPSHOT_LOADERS.items()},
    },
    "cfbd": {
        **{name: (fn, True) for name, fn in cfbd_ingest.SEASON_LOADERS.items()},
        **{name: (fn, False) for name, fn in cfbd_ingest.SNAPSHOT_LOADERS.items()},
    },
}


def run_table(
    source: str,
    table: str,
    loader,
    takes_last_year: bool,
    *,
    bucket: str,
    last_year: int,
    force: bool,
    manifest: ManifestLog,
) -> None:
    print(f"\n→ {source}/{table}")
    iterator: Iterator[tuple[dict[str, Any], Any]] = (
        loader(last_year) if takes_last_year else loader()
    )
    n_partitions = 0
    while True:
        try:
            partitions, arrow_table = next(iterator)
        except StopIteration:
            break
        except Exception as e:
            # A single partition's loader threw (e.g. transient 502 from
            # nflverse's GitHub releases). Log + skip; continue with the rest.
            print(f"  ! partition fetch failed: {type(e).__name__}: {e}")
            manifest.record(
                ManifestEntry(
                    source=source,
                    table=table,
                    partitions={},
                    s3_key="",
                    status="failed",
                    error=f"{type(e).__name__}: {e}",
                )
            )
            continue
        n_partitions += 1
        key = raw.partition_path(source, table, partitions)
        if not force and raw.partition_exists(bucket, key):
            print(f"  ↷ skip (exists): {key}")
            manifest.record(
                ManifestEntry(
                    source=source,
                    table=table,
                    partitions=partitions,
                    s3_key=key,
                    status="skipped",
                    rows=arrow_table.num_rows if arrow_table is not None else None,
                )
            )
            continue
        if arrow_table is None or arrow_table.num_rows == 0:
            print(f"  · empty partition, skip: {partitions}")
            continue
        try:
            written_key, nbytes = raw.write_partition(
                arrow_table,
                bucket=bucket,
                source=source,
                table_name=table,
                partitions=partitions,
            )
            print(f"  ✓ {arrow_table.num_rows:>7,} rows · {nbytes/1024:>8,.1f} KB · {written_key}")
            manifest.record(
                ManifestEntry(
                    source=source,
                    table=table,
                    partitions=partitions,
                    s3_key=written_key,
                    status="wrote",
                    rows=arrow_table.num_rows,
                    bytes=nbytes,
                )
            )
        except Exception as e:
            print(f"  ! write failed: {e}")
            manifest.record(
                ManifestEntry(
                    source=source,
                    table=table,
                    partitions=partitions,
                    s3_key=key,
                    status="failed",
                    error=str(e),
                )
            )
    if n_partitions == 0:
        print(f"  (no partitions yielded for {source}/{table})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=list(SOURCES) + ["all"], default="all")
    ap.add_argument("--table", default=None, help="If set, only run this table within --source")
    ap.add_argument("--last-year", type=int, default=DEFAULT_LAST_YEAR)
    ap.add_argument("--force", action="store_true", help="Overwrite existing partitions")
    args = ap.parse_args()

    bucket = os.environ["S3_RAW_BUCKET"]
    manifest = ManifestLog(bucket=bucket)
    print(f"Run id: {manifest.run_id}")
    print(f"Raw bucket: {bucket}")
    print(f"Last year: {args.last_year}")
    print(f"Force: {args.force}")

    sources = list(SOURCES) if args.source == "all" else [args.source]
    started = time.monotonic()

    for src in sources:
        tables = SOURCES[src]
        if args.table:
            if args.table not in tables:
                print(f"  ! unknown table {src}/{args.table}; available: {list(tables)}")
                continue
            tables = {args.table: tables[args.table]}
        for table_name, (loader, takes_last_year) in tables.items():
            try:
                run_table(
                    src,
                    table_name,
                    loader,
                    takes_last_year,
                    bucket=bucket,
                    last_year=args.last_year,
                    force=args.force,
                    manifest=manifest,
                )
            except Exception:
                print(f"  ! table-level failure in {src}/{table_name}:")
                traceback.print_exc()

    manifest.flush()
    elapsed = time.monotonic() - started
    print(f"\n=== run complete in {elapsed/60:.1f} min ===")
    print(f"Manifest: s3://{bucket}/{manifest.key}")
    print(f"Summary: {manifest.summary()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
