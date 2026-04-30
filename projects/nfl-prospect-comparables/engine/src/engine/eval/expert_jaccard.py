"""Phase 3.3 — engine vs expert comp agreement.

For each cohort prospect with expert-named comps in `corpus/expert_comps/
<player_id>.json` (Brugler / Walter Football), run the engine kNN top-K
and compute set-overlap with the expert names. Reports:
  - hit-rate-any-K: did the engine top-K include AT LEAST ONE expert comp?
  - hit-rate-top-1: was the engine #1 comp an expert comp?
  - Jaccard: |engine ∩ expert| / |engine ∪ expert|
  - by-source breakdown (Brugler vs Walter)

This is the credibility surface for non-ML readers: "the engine and the
analyst pool agree on at least one comp X% of the time."
"""

from __future__ import annotations

import io
import json
from dataclasses import dataclass
from typing import Iterable

import boto3
import polars as pl

from engine.corpus.expert_comps import normalize_name_for_match
from engine.embedding import comps as comps_mod


def load_expert_comps(curated_bucket: str) -> dict[str, dict]:
    """Load all per-player expert_comps JSON. Returns {player_id → comps_dict}."""
    s3 = boto3.client("s3")
    out: dict[str, dict] = {}
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=curated_bucket, Prefix="corpus/expert_comps/"):
        for o in page.get("Contents", []):
            key = o["Key"]
            if not key.endswith(".json"):
                continue
            pid = key.rsplit("/", 1)[-1].replace(".json", "")
            body = s3.get_object(Bucket=curated_bucket, Key=key)["Body"].read()
            out[pid] = json.loads(body)
    return out


def build_name_index(pool: comps_mod.CompPool) -> dict[str, str]:
    """Normalized-name → player_id map for the engine's full pool."""
    out: dict[str, str] = {}
    for i in range(pool.df.height):
        nm = normalize_name_for_match(pool.df["name"][i])
        if nm:
            out[nm] = pool.df["player_id"][i]
    return out


def resolve_expert_names_to_pool(
    expert_names: Iterable[str], name_idx: dict[str, str]
) -> tuple[set[str], list[str]]:
    """For each named comp, look up the cohort+pool player_id. Returns
    (resolved_player_id_set, list_of_names_not_in_pool)."""
    resolved: set[str] = set()
    misses: list[str] = []
    for name in expert_names:
        nm = normalize_name_for_match(name)
        pid = name_idx.get(nm)
        if pid is None:
            misses.append(name)
        else:
            resolved.add(pid)
    return resolved, misses


@dataclass
class JaccardRow:
    player_id: str
    name: str
    position: str
    cohort: str
    expert_comps: list[str]
    engine_top_k: list[str]   # player_ids
    engine_top_k_names: list[str]
    expert_in_pool: set[str]  # player_ids that resolved
    overlap: int              # |engine_top_k ∩ expert_in_pool|
    hit_any: bool             # at least one engine comp ∈ expert_in_pool
    jaccard: float            # |engine ∩ expert| / |engine ∪ expert|


def evaluate_player(
    pool: comps_mod.CompPool,
    name_idx: dict[str, str],
    player_id: str,
    expert_record: dict,
    *,
    sources: tuple[str, ...] = ("brugler", "walter_football"),
    top_k: int = 5,
) -> JaccardRow | None:
    """Run engine top-K for one player, compute overlap with expert comps.
    Returns None if the player isn't in the pool or has no expert comps that
    resolve to in-pool players."""
    expert_names = []
    for src in sources:
        for name in expert_record.get(src, []):
            if name not in expert_names:
                expert_names.append(name)
    if not expert_names:
        return None

    expert_pids, _misses = resolve_expert_names_to_pool(expert_names, name_idx)
    if not expert_pids:
        return None

    # Run engine kNN
    res = comps_mod.find_comps(
        pool, query_player_id=player_id, top_k=top_k, same_position_only=True
    )
    if not res:
        return None
    engine_pids = [c.player_id for c in res]
    engine_names = [c.name for c in res]
    engine_set = set(engine_pids)

    overlap = engine_set & expert_pids
    union = engine_set | expert_pids
    jaccard = len(overlap) / len(union) if union else 0.0

    # Pull metadata from the pool's df
    df = pool.df
    rows = df.filter(pl.col("player_id") == player_id)
    if rows.height == 0:
        return None
    row = rows.row(0, named=True)

    return JaccardRow(
        player_id=player_id,
        name=row["name"],
        position=row["position"],
        cohort=row["cohort"],
        expert_comps=expert_names,
        engine_top_k=engine_pids,
        engine_top_k_names=engine_names,
        expert_in_pool=expert_pids,
        overlap=len(overlap),
        hit_any=bool(overlap),
        jaccard=jaccard,
    )


def run_jaccard_eval(
    curated_bucket: str,
    *,
    arm: str = "hybrid",
    top_k: int = 5,
    sources: tuple[str, ...] = ("brugler", "walter_football"),
    cohorts: tuple[str, ...] = comps_mod.COHORTS_DEFAULT,
) -> list[JaccardRow]:
    pool = comps_mod.load_pool(curated_bucket, cohorts=cohorts, arm=arm)
    name_idx = build_name_index(pool)
    expert_data = load_expert_comps(curated_bucket)

    out: list[JaccardRow] = []
    for pid, rec in expert_data.items():
        r = evaluate_player(
            pool, name_idx, pid, rec, sources=sources, top_k=top_k
        )
        if r is not None:
            out.append(r)
    return out
