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
import re
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    """Return [(s3_key, source, year, player_id)] for KB-eligible files.

    Wikipedia is included for ALL cohorts (training + validation + 2026)
    per the 2026-05-02 policy: RAG retrieval and similarity embeddings are
    separate pipes. The "no Wikipedia for clustering" rule still holds —
    that pipeline lives in run_text_embeddings.py and is unchanged. This
    script only governs KB ingestion (chat-time retrieval).

    Layout conventions:
      corpus/brugler/<year>/<player_id>.txt          (year-stratified)
      corpus/walter_football/<player_id>.txt         (flat, legacy)
      corpus/wikipedia/<player_id>.txt               (flat, legacy)
      corpus/recency/<source>/<player_id>.txt        (umbrella for new sources)
    """
    s3 = boto3.client("s3", region_name="us-east-1")
    paginator = s3.get_paginator("list_objects_v2")
    rows: list[tuple[str, str, str | None, str]] = []
    for page in paginator.paginate(Bucket=CURATED_BUCKET, Prefix="corpus/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".txt"):
                continue
            parts = key.split("/")
            if len(parts) < 3:
                continue
            top = parts[1]
            if top == "brugler":
                if len(parts) < 4:
                    continue
                source = "brugler"
                year = parts[2]
                player_id = parts[3].replace(".txt", "")
            elif top == "recency":
                # corpus/recency/<source>/<player_id>[.<n>].txt
                # or         /<source>/<player_id>__<article_slug>[.<n>].txt
                # The `__<slug>` suffix lets a single prospect have
                # multiple chunks per source (e.g., LZ 4.0 + 3.0 mocks).
                if len(parts) < 4:
                    continue
                source = parts[2]
                year = None
                stem = parts[3].replace(".txt", "")
                # Strip optional `.<n>` dedup counter and `__<slug>`.
                stem = re.sub(r"\.\d+$", "", stem)
                player_id = stem.split("__", 1)[0]
            else:
                # Legacy flat: corpus/<source>/<player_id>.txt
                source = top
                year = None
                player_id = parts[2].replace(".txt", "")
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


def _put_one(s3, key: str, body: bytes) -> None:
    s3.put_object(
        Bucket=CURATED_BUCKET,
        Key=key,
        Body=body,
        ContentType="application/json",
    )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Generate Bedrock KB metadata sidecars.")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute sidecars but don't upload",
    )
    p.add_argument(
        "--source",
        action="append",
        help="Only emit sidecars for this source (repeatable). "
             "Useful when adding a new corpus without rewriting all sidecars.",
    )
    p.add_argument(
        "--workers",
        type=int,
        default=32,
        help="Parallel S3 upload workers (default 32)",
    )
    args = p.parse_args(argv)

    print("[1/3] loading player index from profiles JSONL...", flush=True)
    index = _load_player_index()
    print(f"      indexed {len(index)} players across 3 cohorts", flush=True)

    print("[2/3] walking corpus...", flush=True)
    files = _list_corpus_files()
    if args.source:
        wanted = set(args.source)
        files = [r for r in files if r[1] in wanted]
        print(f"      filtered to sources {sorted(wanted)}", flush=True)
    print(f"      found {len(files)} KB-eligible corpus files", flush=True)

    s3 = boto3.client("s3", region_name="us-east-1")
    counts: dict[str, int] = defaultdict(int)
    missing: list[str] = []

    # Pre-compute all sidecar uploads up-front, then fan out via threads.
    uploads: list[tuple[str, bytes, str]] = []
    for key, source, year, pid in files:
        info = index.get(pid)
        if not info:
            missing.append(key)
            continue
        sidecar = _build_sidecar(source, year, pid, info)
        sidecar_key = f"{key}.metadata.json"
        body = json.dumps(sidecar, separators=(",", ":")).encode("utf-8")
        uploads.append((sidecar_key, body, source))
        counts[source] += 1

    print(f"      {len(uploads)} sidecars to upload", flush=True)

    written = 0
    if not args.dry_run and uploads:
        # boto3 clients are thread-safe; share one across workers.
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(_put_one, s3, key, body): key
                for key, body, _src in uploads
            }
            for i, fut in enumerate(as_completed(futures), 1):
                fut.result()  # propagate exceptions
                written += 1
                if i % 200 == 0 or i == len(uploads):
                    print(f"      uploaded {i}/{len(uploads)}", flush=True)

    print(f"[3/3] {'(dry run) ' if args.dry_run else ''}sidecars by source:", flush=True)
    for s, n in sorted(counts.items()):
        print(f"      {s}: {n}", flush=True)
    if missing:
        print(f"\n  WARNING: {len(missing)} corpus files had no profile match:", flush=True)
        for k in missing[:10]:
            print(f"    - {k}", flush=True)
    if not args.dry_run:
        print(f"\n  wrote {written} sidecars to s3://{CURATED_BUCKET}/", flush=True)
        print("\nNext: re-trigger ingestion via", flush=True)
        print("      uv run python scripts/run_kb_ingestion.py --all", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
