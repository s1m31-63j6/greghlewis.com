"""Bulk load hybrid vectors from S3 → Postgres."""

from __future__ import annotations

import io
import os

import boto3
import polars as pl

from engine.db.client import connect
from engine.db.schema import FEATURE_DIM, TEXT_DIM


COHORTS = ["training_2014_2020", "validation_2021_2025", "prediction_2026"]


def _pad(vec: list[float], dim: int) -> list[float]:
    """Right-pad an L2-normalized vector with zeros to `dim`. Padded zeros
    don't change cosine similarity for L2-normalized inputs."""
    if len(vec) > dim:
        raise ValueError(f"vector length {len(vec)} exceeds target dim {dim}")
    if len(vec) == dim:
        return vec
    return vec + [0.0] * (dim - len(vec))


def _hybrid_pad(vec: list[float]) -> list[float]:
    """Hybrid is feature(varies) + text(1024). Pad the feature half so the
    feature region is fixed-width, leaving the text half intact."""
    # The hybrid stored in parquet was concat([feat_unit, text_unit]).
    # feat_unit dim varies. Split, pad feat, concat back.
    text_start = len(vec) - TEXT_DIM
    feat_part = vec[:text_start]
    text_part = vec[text_start:]
    return _pad(feat_part, FEATURE_DIM) + text_part


def _load_outcomes(curated_bucket: str) -> dict[str, str]:
    """player_id (pfr) → outcome_class. Pulls from outcomes/ on curated."""
    s3 = boto3.client("s3")
    out: dict[str, str] = {}
    for cohort in ("training_2014_2020", "validation_2021_2025"):
        body = s3.get_object(
            Bucket=curated_bucket, Key=f"outcomes/{cohort}/data.parquet"
        )["Body"].read()
        df = pl.read_parquet(io.BytesIO(body))
        for r in df.iter_rows(named=True):
            if r["pfr_player_id"] and r["outcome_class"]:
                out[r["pfr_player_id"]] = r["outcome_class"]
    return out


def load_all() -> dict[str, int]:
    """Truncate + bulk-load all cohorts. Returns per-cohort row counts."""
    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    outcomes = _load_outcomes(cur)
    counts: dict[str, int] = {}

    with connect() as conn:
        with conn.cursor() as c:
            c.execute("TRUNCATE embeddings, players RESTART IDENTITY CASCADE;")

        for cohort in COHORTS:
            body = s3.get_object(
                Bucket=cur, Key=f"embeddings/hybrid_vectors/cohort={cohort}/data.parquet"
            )["Body"].read()
            df = pl.read_parquet(io.BytesIO(body))

            with conn.cursor() as c:
                # players
                player_rows = [
                    (
                        r["player_id"],
                        r["name"],
                        r["position"],
                        cohort,
                        bool(r["has_brugler"]),
                        bool(r["has_wikipedia"]),
                        outcomes.get(r["player_id"]),
                    )
                    for r in df.iter_rows(named=True)
                ]
                c.executemany(
                    "INSERT INTO players (player_id, name, position, cohort, "
                    "has_brugler, has_wikipedia, outcome_class) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                    "ON CONFLICT (player_id) DO NOTHING;",
                    player_rows,
                )

                # embeddings — pgvector accepts list[float] via psycopg adapter
                # or the str format "[v1,v2,...]". Use string for simplicity.
                emb_rows = []
                for r in df.iter_rows(named=True):
                    feat = _pad(list(r["feature_vec"]), FEATURE_DIM)
                    text = list(r["text_vec"])  # already 1024-dim
                    hybrid = _hybrid_pad(list(r["hybrid_vec"]))
                    emb_rows.append((
                        r["player_id"],
                        _vec_str(feat),
                        _vec_str(text),
                        _vec_str(hybrid),
                    ))
                c.executemany(
                    "INSERT INTO embeddings (player_id, feature_vec, text_vec, hybrid_vec) "
                    "VALUES (%s, %s, %s, %s) ON CONFLICT (player_id) DO NOTHING;",
                    emb_rows,
                )
            counts[cohort] = df.height
        conn.commit()
    return counts


def _vec_str(v: list[float]) -> str:
    """pgvector text input: '[v1,v2,v3,...]' (no spaces required)."""
    return "[" + ",".join(repr(float(x)) for x in v) + "]"
