"""Per-run ingest manifest.

Each run produces a JSONL log at:
    s3://{raw_bucket}/manifests/ingest_runs/run={iso_timestamp}/manifest.jsonl

Each line records one partition write (or a skip / failure). The manifest is the
source of truth for resumability and audit.
"""

from __future__ import annotations

import datetime as dt
import io
import json
from dataclasses import asdict, dataclass, field

from engine.io import s3


@dataclass
class ManifestEntry:
    source: str
    table: str
    partitions: dict[str, object]
    s3_key: str
    status: str  # "wrote" | "skipped" | "failed"
    rows: int | None = None
    bytes: int | None = None
    error: str | None = None
    timestamp: str = field(default_factory=lambda: dt.datetime.now(dt.UTC).isoformat())


class ManifestLog:
    """Buffers manifest entries in memory; flush() uploads JSONL to S3."""

    def __init__(self, bucket: str, run_id: str | None = None):
        self.bucket = bucket
        self.run_id = run_id or dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H-%M-%SZ")
        self.entries: list[ManifestEntry] = []

    @property
    def key(self) -> str:
        return f"manifests/ingest_runs/run={self.run_id}/manifest.jsonl"

    def record(self, entry: ManifestEntry) -> None:
        self.entries.append(entry)

    def flush(self) -> None:
        if not self.entries:
            return
        buf = io.StringIO()
        for e in self.entries:
            buf.write(json.dumps(asdict(e), default=str) + "\n")
        s3._client().put_object(
            Bucket=self.bucket,
            Key=self.key,
            Body=buf.getvalue().encode("utf-8"),
            ContentType="application/x-ndjson",
        )

    def summary(self) -> dict[str, int]:
        out = {"wrote": 0, "skipped": 0, "failed": 0}
        for e in self.entries:
            out[e.status] = out.get(e.status, 0) + 1
        return out
