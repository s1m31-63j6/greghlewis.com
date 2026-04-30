"""Embed scouting text via Bedrock Titan v2 and write hybrid (feature + text)
vectors per cohort.

Reads:
  s3://<curated>/embeddings/feature_vectors/cohort=<name>/data.parquet
  s3://<curated>/corpus/brugler/<year>/<player_id>.txt          (primary, paid)
  s3://<curated>/corpus/walter_football/<player_id>.txt         (supplementary, free)
  s3://<curated>/corpus/wikipedia/<player_id>.txt               (LEGACY ONLY — not used in
                                                                 the production text vec; kept
                                                                 cached for an ablation that
                                                                 demonstrates Wikipedia bias)

Writes:
  s3://<curated>/embeddings/hybrid_vectors/cohort=<name>/data.parquet

Persisted columns:
  text_brugler_vec    — Brugler-only Titan v2 (1024-dim, L2-normed)
  text_walter_vec     — Walter Football-only Titan v2
  text_clean_vec      — Brugler + Walter Football (the production text vec)
  text_legacy_vec     — Brugler + Wikipedia (kept for ablation; CLEAN replaces this)
  hybrid_clean_vec    — feature_unit ‖ text_clean_unit  (the production hybrid vec)
  hybrid_legacy_vec   — feature_unit ‖ text_legacy_unit (kept for ablation)
  has_brugler / has_walter_football / has_wikipedia — source presence flags

Run from engine/:
    uv run python scripts/run_text_embeddings.py
    uv run python scripts/run_text_embeddings.py --cohort training_2014_2020
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time

import boto3
import numpy as np
import polars as pl
from dotenv import load_dotenv

from engine.embedding import text_embed
from engine.features import runner as feat_runner

load_dotenv()


DEFAULT_COHORTS = ["training_2014_2020", "validation_2021_2025"]


# Sources we embed individually (each gets its own persisted vector). Wikipedia
# is included so we can populate text_legacy_vec for the ablation comparison
# but is NOT used in the production text_clean_vec.
PER_SOURCE = ("brugler", "walter_football", "wikipedia")


def _load_feature_vectors(s3, bucket: str, cohort: str) -> pl.DataFrame:
    body = s3.get_object(
        Bucket=bucket, Key=f"embeddings/feature_vectors/cohort={cohort}/data.parquet"
    )["Body"].read()
    return pl.read_parquet(io.BytesIO(body))


# Map from cache key (short name) → parquet column name. A stale parquet with
# only the legacy schema (text_vec / text_brugler_vec / text_wikipedia_vec)
# still partially populates these caches.
CACHE_COLS = {
    "brugler": ["text_brugler_vec"],
    "walter_football": ["text_walter_vec"],
    "wikipedia": ["text_wikipedia_vec"],
    "clean": ["text_clean_vec"],
    "legacy": ["text_legacy_vec", "text_vec"],  # text_vec is the legacy column name from before the rename
}


def _load_cached_text_vecs(
    s3, bucket: str, cohort: str
) -> dict[str, dict[str, list[float]]]:
    """Per-source vector cache keyed by player_id, loaded from a prior parquet
    if present. Falls back to legacy column names when present."""
    out: dict[str, dict[str, list[float]]] = {k: {} for k in CACHE_COLS}
    try:
        body = s3.get_object(
            Bucket=bucket, Key=f"embeddings/hybrid_vectors/cohort={cohort}/data.parquet"
        )["Body"].read()
    except Exception:
        return out
    df = pl.read_parquet(io.BytesIO(body))
    cols = set(df.columns)
    for cache_key, candidate_cols in CACHE_COLS.items():
        for col in candidate_cols:
            if col in cols:
                out[cache_key] = {
                    row["player_id"]: row[col] for row in df.iter_rows(named=True)
                }
                break
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", help="cohort name (repeatable)")
    ap.add_argument("--region", default="us-east-1", help="Bedrock region")
    ap.add_argument(
        "--no-cache",
        action="store_true",
        help="ignore existing text-vec caches; re-embed everything",
    )
    args = ap.parse_args()

    cohorts = args.cohort if args.cohort else DEFAULT_COHORTS
    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    bedrock = text_embed.make_bedrock_client(region_name=args.region)

    for cohort in cohorts:
        print(f"\n=== {cohort} ===")
        profiles = feat_runner.load_cohort(cur, cohort)
        feature_df = _load_feature_vectors(s3, cur, cohort)
        feature_lookup = {
            row["player_id"]: np.asarray(row["vector"], dtype=np.float64)
            for row in feature_df.iter_rows(named=True)
        }
        cached = (
            {k: {} for k in CACHE_COLS}
            if args.no_cache
            else _load_cached_text_vecs(s3, cur, cohort)
        )
        print(f"  loaded: {len(profiles)} profiles, {len(feature_lookup)} feature vectors")
        cache_summary = ", ".join(f"{k}={len(v)}" for k, v in cached.items() if v)
        if cache_summary:
            print(f"  cache: {cache_summary}")

        rows: list[dict] = []
        n_text_clean = 0
        n_text_legacy = 0
        n_brugler = 0
        n_walter = 0
        n_wiki = 0
        n_calls = 0
        n_cache_hits = 0
        started = time.monotonic()

        zero = np.zeros(text_embed.TITAN_DIM, dtype=np.float64)

        def _embed(text: str, pid: str, cache: dict[str, list[float]]) -> np.ndarray:
            nonlocal n_calls, n_cache_hits
            if not text:
                return zero
            if pid in cache:
                n_cache_hits += 1
                return np.asarray(cache[pid], dtype=np.float64)
            n_calls += 1
            return text_embed.bedrock_embed(text, bedrock_client=bedrock)

        for i, p in enumerate(profiles, 1):
            feat = feature_lookup.get(p.player_id)
            if feat is None:
                continue

            # Per-source formatted text
            per_source = text_embed.consolidate_text_per_source(
                p, s3=s3, bucket=cur, sources=PER_SOURCE
            )
            has_brugler = bool(per_source["brugler"])
            has_walter = bool(per_source["walter_football"])
            has_wiki = bool(per_source["wikipedia"])

            n_brugler += int(has_brugler)
            n_walter += int(has_walter)
            n_wiki += int(has_wiki)

            # Per-source vectors (cached per-source where available)
            brugler_vec = _embed(per_source["brugler"], p.player_id, cached["brugler"])
            walter_vec = _embed(per_source["walter_football"], p.player_id, cached["walter_football"])
            wiki_vec = _embed(per_source["wikipedia"], p.player_id, cached["wikipedia"])

            # Combined CLEAN text vec — Brugler + Walter Football (production)
            clean_text_obj = text_embed.consolidate_text(
                p, s3=s3, bucket=cur, sources=("brugler", "walter_football")
            )
            clean_text = clean_text_obj[0]
            has_clean = bool(clean_text)
            n_text_clean += int(has_clean)
            clean_vec = _embed(clean_text, p.player_id, cached["clean"])

            # Combined LEGACY text vec — Brugler + Wikipedia (ablation only)
            legacy_text_obj = text_embed.consolidate_text(
                p, s3=s3, bucket=cur, sources=("brugler", "wikipedia")
            )
            legacy_text = legacy_text_obj[0]
            has_legacy = bool(legacy_text)
            n_text_legacy += int(has_legacy)
            legacy_vec = _embed(legacy_text, p.player_id, cached["legacy"])

            # L2-normalize each persisted vector
            n = text_embed._l2_normalize
            feat_unit = n(feat)
            clean_unit = n(clean_vec)
            legacy_unit = n(legacy_vec)
            rows.append({
                "player_id": p.player_id,
                "name": p.name,
                "position": p.position.name,
                "has_brugler": has_brugler,
                "has_walter_football": has_walter,
                "has_wikipedia": has_wiki,
                "has_text_clean": has_clean,
                "has_text_legacy": has_legacy,
                "feature_vec": feat_unit.tolist(),
                # production
                "text_clean_vec": clean_unit.tolist(),
                "hybrid_clean_vec": np.concatenate([feat_unit, clean_unit]).tolist(),
                # legacy / ablation
                "text_legacy_vec": legacy_unit.tolist(),
                "hybrid_legacy_vec": np.concatenate([feat_unit, legacy_unit]).tolist(),
                # per-source
                "text_brugler_vec": n(brugler_vec).tolist(),
                "text_walter_vec": n(walter_vec).tolist(),
                "text_wikipedia_vec": n(wiki_vec).tolist(),
            })
            if i % 25 == 0 or i == len(profiles):
                elapsed = time.monotonic() - started
                rate = i / elapsed if elapsed > 0 else 0
                print(
                    f"  [{i}/{len(profiles)}] B={n_brugler} W={n_walter} Wiki={n_wiki} "
                    f"clean={n_text_clean} legacy={n_text_legacy} | "
                    f"calls={n_calls} cache_hits={n_cache_hits}  "
                    f"elapsed {elapsed/60:.1f} min  rate {rate:.1f}/s",
                    flush=True,
                )

        df = pl.DataFrame(rows)
        uri = text_embed.persist_cohort_hybrid(df, cur, cohort)
        print(f"  → {uri}")
        print(
            f"  summary: brugler={n_brugler} walter={n_walter} wiki={n_wiki}  |  "
            f"clean={n_text_clean} legacy={n_text_legacy}  |  "
            f"bedrock calls: {n_calls}, cache hits: {n_cache_hits}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
