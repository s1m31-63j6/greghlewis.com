"""Phase 2.5 — embed scouting text via Bedrock Titan v2 and write hybrid
(feature + text) vectors per cohort.

Reads:
  s3://<curated>/embeddings/feature_vectors/cohort=<name>/data.parquet
  s3://<curated>/corpus/brugler/<year>/<player_id>.txt
  s3://<curated>/corpus/wikipedia/<player_id>.txt

Writes:
  s3://<curated>/embeddings/hybrid_vectors/cohort=<name>/data.parquet

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


def _load_feature_vectors(s3, bucket: str, cohort: str) -> pl.DataFrame:
    body = s3.get_object(
        Bucket=bucket, Key=f"embeddings/feature_vectors/cohort={cohort}/data.parquet"
    )["Body"].read()
    return pl.read_parquet(io.BytesIO(body))


def _load_cached_text_vecs(s3, bucket: str, cohort: str) -> dict[str, list[float]]:
    """Load existing text_vec column (per player_id) from a previous run if
    present. Used to skip Bedrock re-embedding when only the feature vector
    changed (e.g., stats were recomputed across an enlarged pool)."""
    try:
        body = s3.get_object(
            Bucket=bucket, Key=f"embeddings/hybrid_vectors/cohort={cohort}/data.parquet"
        )["Body"].read()
    except Exception:
        return {}
    df = pl.read_parquet(io.BytesIO(body))
    return {row["player_id"]: row["text_vec"] for row in df.iter_rows(named=True)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", help="cohort name (repeatable)")
    ap.add_argument("--region", default="us-east-1", help="Bedrock region")
    ap.add_argument(
        "--no-cache",
        action="store_true",
        help="ignore existing hybrid_vectors text_vec cache; re-embed everything",
    )
    args = ap.parse_args()

    cohorts = args.cohort if args.cohort else DEFAULT_COHORTS
    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    bedrock = boto3.client("bedrock-runtime", region_name=args.region)

    for cohort in cohorts:
        print(f"\n=== {cohort} ===")
        profiles = feat_runner.load_cohort(cur, cohort)
        feature_df = _load_feature_vectors(s3, cur, cohort)
        feature_lookup = {
            row["player_id"]: np.asarray(row["vector"], dtype=np.float64)
            for row in feature_df.iter_rows(named=True)
        }
        cached_text = {} if args.no_cache else _load_cached_text_vecs(s3, cur, cohort)
        if cached_text:
            print(
                f"  loaded: {len(profiles)} profiles, {len(feature_lookup)} feature vectors, "
                f"{len(cached_text)} cached text vectors"
            )
        else:
            print(f"  loaded: {len(profiles)} profiles, {len(feature_lookup)} feature vectors")

        rows: list[dict] = []
        n_with_text = 0
        n_with_brugler = 0
        n_with_wiki = 0
        n_no_text = 0
        n_cached = 0
        started = time.monotonic()

        for i, p in enumerate(profiles, 1):
            feat = feature_lookup.get(p.player_id)
            if feat is None:
                continue
            text, sources = text_embed.consolidate_text(p, s3=s3, bucket=cur)
            has_text = bool(text)
            if has_text:
                n_with_text += 1
                if sources["brugler"]:
                    n_with_brugler += 1
                if sources["wikipedia"]:
                    n_with_wiki += 1
                # Reuse cached text_vec if present (text didn't change; only
                # the feature half of the hybrid does after stats recompute).
                if p.player_id in cached_text:
                    tvec = np.asarray(cached_text[p.player_id], dtype=np.float64)
                    n_cached += 1
                else:
                    tvec = text_embed.bedrock_embed(text, bedrock_client=bedrock)
            else:
                n_no_text += 1
                tvec = np.zeros(text_embed.TITAN_DIM, dtype=np.float64)
            hybrid = text_embed.build_hybrid(feat, tvec, has_text=has_text)
            rows.append({
                "player_id": p.player_id,
                "name": p.name,
                "position": p.position.name,
                "has_text": has_text,
                "has_brugler": sources["brugler"],
                "has_wikipedia": sources["wikipedia"],
                "feature_vec": hybrid.feature_unit.tolist(),
                "text_vec": hybrid.text_unit.tolist(),
                "hybrid_vec": hybrid.hybrid.tolist(),
            })
            if i % 25 == 0 or i == len(profiles):
                elapsed = time.monotonic() - started
                rate = i / elapsed if elapsed > 0 else 0
                print(
                    f"  [{i}/{len(profiles)}] text={n_with_text} (B={n_with_brugler}, W={n_with_wiki}, "
                    f"cached={n_cached}) none={n_no_text}  elapsed {elapsed/60:.1f} min  rate {rate:.1f}/s",
                    flush=True,
                )

        df = pl.DataFrame(rows)
        uri = text_embed.persist_cohort_hybrid(df, cur, cohort)
        print(f"  → {uri}")
        print(
            f"  summary: {n_with_text} with text "
            f"({n_with_brugler} Brugler, {n_with_wiki} Wikipedia), "
            f"{n_no_text} no-text"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
