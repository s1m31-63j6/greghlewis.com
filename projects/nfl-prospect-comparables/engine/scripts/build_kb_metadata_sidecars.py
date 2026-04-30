"""Emit Bedrock KB `.metadata.json` sidecars for every corpus file.

Bedrock KB picks up `<source>.txt.metadata.json` siblings during ingestion
and attaches the metadata to every chunk derived from `<source>.txt`. This
unlocks:
  - retrieval-time filters (`Retrieve(filter={"playerIdEquals": "..."})`)
  - including player_name in the embedding context (so "Tell me about
    Carnell Tate" can match a chunk tagged with player_name='Carnell Tate'
    even when the OCR text doesn't include the name verbatim).

After running this, re-trigger ingestion for both data sources so Bedrock
re-reads the corpus and picks up the sidecars.

Run from engine/:
    AWS_PROFILE=portfolio uv run python scripts/build_kb_metadata_sidecars.py
    AWS_PROFILE=portfolio uv run python scripts/build_kb_metadata_sidecars.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from typing import Any

import boto3
from dotenv import load_dotenv

load_dotenv()


CURATED_BUCKET = "nflcomparablesdata-curatedbucket6a59c97e-7doifyurcsxx"

# Attributes whose values are concatenated into the embedded chunk text.
# Lets queries like "Tell me about Carnell Tate" match a chunk tagged
# with player_name='Carnell Tate' even when the OCR text omits the name
# verbatim. Other attributes are storage-only (still usable in
# `Retrieve(filter=...)` but not seen by the embedding model).
INCLUDE_FOR_EMBEDDING = {"player_name", "position", "source"}


def _load_player_index() -> dict[str, dict[str, Any]]:
    """player_id -> {name, position, draft_year, cohort} from profile JSONL."""
    s3 = boto3.client("s3", region_name="us-east-1")
    out: dict[str, dict[str, Any]] = {}
    for cohort in ("training_2014_2020", "validation_2021_2025", "prediction_2026"):
        try:
            body = s3.get_object(
                Bucket=CURATED_BUCKET,
                Key=f"profiles/{cohort}/data.jsonl",
            )["Body"].read().decode("utf-8")
        except s3.exceptions.NoSuchKey:
            continue
        for line in body.splitlines():
            if not line.strip():
                continue
            p = json.loads(line)
            pid = p.get("player_id")
            if not pid:
                continue
            bio = p.get("bio") or {}
            draft = p.get("draft") or {}
            out[pid] = {
                "name": bio.get("full_name") or p.get("name", ""),
                "position": bio.get("position") or p.get("position", ""),
                "draft_year": draft.get("year"),
                "cohort": cohort,
            }
    return out


def _list_corpus_files() -> list[tuple[str, str, str | None, str]]:
    """Return [(s3_key, source, year, player_id)] for KB-eligible files."""
    s3 = boto3.client("s3", region_name="us-east-1")
    paginator = s3.get_paginator("list_objects_v2")
    rows: list[tuple[str, str, str | None, str]] = []
    for page in paginator.paginate(Bucket=CURATED_BUCKET, Prefix="corpus/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".txt"):
                continue
            parts = key.split("/")
            source = parts[1]
            if source == "wikipedia":
                continue  # excluded from KB
            if source == "brugler":
                year = parts[2]
                player_id = parts[3].replace(".txt", "")
            elif source == "walter_football":
                year = None
                player_id = parts[2].replace(".txt", "")
            else:
                continue
            rows.append((key, source, year, player_id))
    return rows


def _attr(value: Any, *, include: bool) -> dict[str, Any]:
    """Bedrock metadata-attribute long form: typed value + embedding flag."""
    if isinstance(value, bool):
        typed = {"type": "BOOLEAN", "booleanValue": value}
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        typed = {"type": "NUMBER", "numberValue": value}
    elif isinstance(value, list):
        typed = {"type": "STRING_LIST", "stringListValue": [str(v) for v in value]}
    else:
        typed = {"type": "STRING", "stringValue": str(value)}
    return {"value": typed, "includeForEmbedding": include}


def _build_sidecar(
    source: str,
    year: str | None,
    player_id: str,
    info: dict[str, Any],
) -> dict[str, Any]:
    """Bedrock KB metadata.json schema (long form).

    Keys in INCLUDE_FOR_EMBEDDING get concatenated into the embedded chunk
    text — making "Tell me about Carnell Tate" match chunks tagged with
    player_name='Carnell Tate'. Other keys are filter-only.
    """
    raw: dict[str, Any] = {
        "source": source,
        "player_id": player_id,
        "player_name": info.get("name") or "",
        "position": info.get("position") or "",
        "cohort": info.get("cohort") or "",
    }
    if year:
        raw["brugler_year"] = int(year)
    draft_year = info.get("draft_year")
    if draft_year is not None:
        raw["draft_year"] = int(draft_year)

    attrs = {
        k: _attr(v, include=(k in INCLUDE_FOR_EMBEDDING))
        for k, v in raw.items()
        if v != ""
    }
    return {"metadataAttributes": attrs}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Generate Bedrock KB metadata sidecars.")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute sidecars but don't upload",
    )
    args = p.parse_args(argv)

    print("[1/3] loading player index from profiles JSONL...")
    index = _load_player_index()
    print(f"      indexed {len(index)} players across 3 cohorts")

    print("[2/3] walking corpus...")
    files = _list_corpus_files()
    print(f"      found {len(files)} KB-eligible corpus files")

    s3 = boto3.client("s3", region_name="us-east-1")
    counts: dict[str, int] = defaultdict(int)
    missing: list[str] = []
    written = 0
    for key, source, year, pid in files:
        info = index.get(pid)
        if not info:
            missing.append(key)
            continue
        sidecar = _build_sidecar(source, year, pid, info)
        sidecar_key = f"{key}.metadata.json"
        body = json.dumps(sidecar, separators=(",", ":")).encode("utf-8")
        if not args.dry_run:
            s3.put_object(
                Bucket=CURATED_BUCKET,
                Key=sidecar_key,
                Body=body,
                ContentType="application/json",
            )
            written += 1
        counts[source] += 1

    print(f"[3/3] {'(dry run) ' if args.dry_run else ''}sidecars by source:")
    for s, n in sorted(counts.items()):
        print(f"      {s}: {n}")
    if missing:
        print(f"\n  WARNING: {len(missing)} corpus files had no profile match:")
        for k in missing[:10]:
            print(f"    - {k}")
    if not args.dry_run:
        print(f"\n  wrote {written} sidecars to s3://{CURATED_BUCKET}/")
        print("\nNext: re-trigger ingestion via")
        print("      uv run python scripts/run_kb_ingestion.py --all")
    return 0


if __name__ == "__main__":
    sys.exit(main())
