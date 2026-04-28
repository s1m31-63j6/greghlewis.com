"""kNN comp search over hybrid vectors — in-memory implementation.

Phase 2.6 will move this onto pgvector for production query latency, but
for cohort sizes under 10K vectors the in-memory NumPy version is fast
enough for development + spot-checking. Same cosine-similarity math as
the pgvector ivfflat / hnsw indexes will do.
"""

from __future__ import annotations

import io
import os
from dataclasses import dataclass

import boto3
import numpy as np
import polars as pl


COHORTS_DEFAULT = ("training_2014_2020", "validation_2021_2025")
VEC_COLS = {"hybrid": "hybrid_vec", "feature": "feature_vec", "text": "text_vec"}


@dataclass
class Comp:
    name: str
    position: str
    cohort: str
    similarity: float
    player_id: str


@dataclass
class CompPool:
    """Pre-loaded comp pool — all cohorts' hybrid vectors stitched into one
    polars frame plus per-position numpy matrices for fast kNN."""
    df: pl.DataFrame
    by_position: dict[str, np.ndarray]  # position → (N, D)
    pos_index: dict[str, list[int]]     # position → list of df row indexes


def load_pool(
    curated_bucket: str,
    cohorts: tuple[str, ...] = COHORTS_DEFAULT,
    *,
    arm: str = "hybrid",
) -> CompPool:
    """Load hybrid vectors for given cohorts and pre-build per-position
    numpy matrices for kNN. `arm` selects which vector to use:
      - "hybrid"  (default) — feature + text concat
      - "feature" — structured features only
      - "text"    — Titan v2 text only
    """
    if arm not in VEC_COLS:
        raise ValueError(f"arm must be one of {list(VEC_COLS)}, got {arm!r}")
    vec_col = VEC_COLS[arm]
    s3 = boto3.client("s3")
    parts: list[pl.DataFrame] = []
    for c in cohorts:
        body = s3.get_object(
            Bucket=curated_bucket,
            Key=f"embeddings/hybrid_vectors/cohort={c}/data.parquet",
        )["Body"].read()
        df = pl.read_parquet(io.BytesIO(body))
        df = df.with_columns(pl.lit(c).alias("cohort"))
        parts.append(df)
    df = pl.concat(parts)

    by_position: dict[str, np.ndarray] = {}
    pos_index: dict[str, list[int]] = {}
    for pos in df["position"].unique().to_list():
        idxs = [i for i, p in enumerate(df["position"].to_list()) if p == pos]
        M = np.stack([np.asarray(df[vec_col][i], dtype=np.float64) for i in idxs])
        # Pre-normalize for cosine
        M = M / np.linalg.norm(M, axis=1, keepdims=True).clip(min=1e-12)
        by_position[pos] = M
        pos_index[pos] = idxs
    return CompPool(df=df, by_position=by_position, pos_index=pos_index)


def find_comps(
    pool: CompPool,
    query_name: str | None = None,
    *,
    query_player_id: str | None = None,
    top_k: int = 10,
    same_position_only: bool = True,
) -> list[Comp]:
    """Find top-K cosine-similarity comps for a player.

    Provide either `query_name` (resolved on the pool's df) or
    `query_player_id`. Uses pre-normalized per-position matrices for
    fast lookup.
    """
    if query_name is not None:
        q_row = pool.df.filter(pl.col("name") == query_name)
    elif query_player_id is not None:
        q_row = pool.df.filter(pl.col("player_id") == query_player_id)
    else:
        raise ValueError("query_name or query_player_id required")
    if q_row.height == 0:
        return []
    q_pos = q_row["position"][0]
    q_pid = q_row["player_id"][0]
    if not same_position_only:
        # Concat all positions
        raise NotImplementedError("cross-position comps not implemented yet")
    M = pool.by_position[q_pos]
    idxs = pool.pos_index[q_pos]
    # Locate query in M
    self_local_idx = idxs.index(
        next(i for i, pid in enumerate(pool.df["player_id"].to_list()) if pid == q_pid)
    )
    q_unit = M[self_local_idx]
    sims = M @ q_unit  # (N,)
    # Mask self
    sims[self_local_idx] = -np.inf
    top_local = np.argsort(-sims)[:top_k]
    return [
        Comp(
            name=pool.df["name"][idxs[int(i)]],
            position=pool.df["position"][idxs[int(i)]],
            cohort=pool.df["cohort"][idxs[int(i)]],
            similarity=float(sims[int(i)]),
            player_id=pool.df["player_id"][idxs[int(i)]],
        )
        for i in top_local
    ]
