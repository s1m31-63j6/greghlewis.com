"""S3 helpers — write parquet, list keys, etc."""

from __future__ import annotations

import io
import os

import boto3
import pyarrow as pa
import pyarrow.parquet as pq

_client_cache = None


def _client():
    """Lazy-initialize a boto3 S3 client honoring AWS_PROFILE from the environment."""
    global _client_cache
    if _client_cache is None:
        session = boto3.Session(
            profile_name=os.environ.get("AWS_PROFILE"),
            region_name=os.environ.get("AWS_REGION"),
        )
        _client_cache = session.client("s3")
    return _client_cache


def write_parquet(table: pa.Table, bucket: str, key: str) -> None:
    """Serialize a PyArrow table to parquet and upload to s3://bucket/key."""
    buf = io.BytesIO()
    pq.write_table(table, buf, compression="zstd")
    buf.seek(0)
    _client().put_object(Bucket=bucket, Key=key, Body=buf.getvalue())


def head_object(bucket: str, key: str) -> dict:
    """Return S3 object metadata (raises if missing)."""
    return _client().head_object(Bucket=bucket, Key=key)
