"""Raw-zone S3 layout — hive-partitioned parquet writes, idempotent reruns.

Layout:
    s3://{raw_bucket}/raw/{source}/{table}/[partition_key=value/...]data.parquet

Each ingest call passes a dict of partitions (e.g. {"season": 2014, "week": 1});
we serialize them in insertion order into a hive path. Empty dict = unpartitioned
(snapshot tables like player_id crosswalks).
"""

from __future__ import annotations

import io
import os

import pyarrow as pa
import pyarrow.parquet as pq

from engine.io import s3


def partition_path(source: str, table: str, partitions: dict[str, object]) -> str:
    """Build the s3 key for a (source, table, partitions) tuple."""
    parts = [f"{k}={v}" for k, v in partitions.items()]
    if parts:
        return f"raw/{source}/{table}/{'/'.join(parts)}/data.parquet"
    return f"raw/{source}/{table}/data.parquet"


def partition_exists(bucket: str, key: str) -> bool:
    """Return True if the s3 key already exists."""
    try:
        s3.head_object(bucket, key)
        return True
    except Exception:
        return False


def write_partition(
    table: pa.Table,
    *,
    bucket: str,
    source: str,
    table_name: str,
    partitions: dict[str, object],
) -> tuple[str, int]:
    """Write a parquet partition. Returns (s3_key, byte_size)."""
    key = partition_path(source, table_name, partitions)
    buf = io.BytesIO()
    pq.write_table(table, buf, compression="zstd")
    body = buf.getvalue()
    s3._client().put_object(Bucket=bucket, Key=key, Body=body)
    return key, len(body)
