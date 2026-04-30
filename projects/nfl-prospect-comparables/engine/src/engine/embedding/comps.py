"""kNN comp search over hybrid vectors — in-memory implementation.

Phase 2.6 will move this onto pgvector for production query latency, but
for cohort sizes under 10K vectors the in-memory NumPy version is fast
enough for development + spot-checking. Same cosine-similarity math as
the pgvector ivfflat / hnsw indexes will do.
"""

from __future__ import annotations

import io
import json as _json
import os
from dataclasses import dataclass

import boto3
import numpy as np
import polars as pl

from engine.features.catalog import (
    LAYER_BODY,
    LAYER_EFFICIENCY,
    LAYER_TRAITS,
    LAYER_VOLUME,
    V2_LAYER_WEIGHTS,
    V2_SIMILARITY_LAYERS,
    v2_layer_weights,
)
from engine.schema import Position


COHORTS_DEFAULT = ("training_2014_2020", "validation_2021_2025")

# Production arms — the headline embedding views.
#   hybrid       = production hybrid (feature ‖ text-clean) — alias of hybrid_clean
#   feature      = full structured feature vector
#   text         = production text (Brugler + Walter Football) — alias of text_clean
#   text_clean   = same as text (explicit naming for ablation tables)
#   text_legacy  = legacy text (Brugler + Wikipedia) — kept for the methodology comparison
#   hybrid_clean / hybrid_legacy = explicit-name siblings of hybrid
# Per-source arms (each is a single Titan v2 embedding over one corpus):
#   text_brugler / text_walter_football / text_wikipedia
VEC_COLS = {
    "hybrid": "hybrid_clean_vec",
    "hybrid_clean": "hybrid_clean_vec",
    "hybrid_legacy": "hybrid_legacy_vec",
    "feature": "feature_vec",
    "text": "text_clean_vec",
    "text_clean": "text_clean_vec",
    "text_legacy": "text_legacy_vec",
    "text_brugler": "text_brugler_vec",
    "text_walter_football": "text_walter_vec",
    "text_wikipedia": "text_wikipedia_vec",
}

# Fallback column names for parquets that predate the schema rename. When the
# primary column is missing, load_pool falls back to these.
VEC_COL_FALLBACKS = {
    "hybrid_clean_vec": "hybrid_vec",      # legacy combined hybrid (Brugler+Wiki) was named hybrid_vec
    "hybrid_legacy_vec": "hybrid_vec",
    "text_clean_vec": "text_vec",          # legacy combined text was named text_vec
    "text_legacy_vec": "text_vec",
    "text_walter_vec": None,               # no fallback — column simply absent
}

# "measurables" and "engineered" are sub-arms of the feature vector — they
# slice the per-position feature_vec by feature-name category. Built on demand
# in load_pool from feature_vectors.parquet + feature_stats.json (the raw
# z-scored vectors, not the L2-normalized ones in hybrid_vectors.parquet).
SLICE_ARMS = {"measurables", "engineered"}

# v2 layered arms — per-archetype-layer slices of the feature vector.
#   feature_v2:        BODY + VOLUME (+ EFFICIENCY for QB) — engineered features only
#   feature_v2_traits: same + Sonnet-extracted TRAITS layer from scouting prose
# Each layer is L2-normed independently and combined via equal-weighted (masked)
# cosine averaging in find_comps, preventing dimension-richer layers (BODY: 21-24
# dims) from drowning out smaller-but-more-informative layers (VOLUME for QB: 4
# dims; TRAITS: 8-12 dims).
LAYERED_ARMS = {"feature_v2", "feature_v2_traits"}

# Per-source hybrids — built at load time by concatenating the L2-normed
# feature_vec with one of the per-source text vectors. Used for the
# methodology comparison (does Brugler-only or Walter-only beat the combined?).
COMPOSITE_ARMS = {
    "hybrid_brugler": ("feature_vec", "text_brugler_vec"),
    "hybrid_walter_football": ("feature_vec", "text_walter_vec"),
    "hybrid_wikipedia": ("feature_vec", "text_wikipedia_vec"),
}

# Names of features that count as "measurables" — pre-college-production data
# (combine + size + age + recruit pedigree + draft capital). Everything else in
# the feature_vec is "engineered" (CFBD play-by-play production stats +
# trajectory + situational splits).
MEASURABLE_FEATURE_NAMES = frozenset({
    # combine drills (percentiles + composites)
    "forty_pct", "vertical_pct", "broad_jump_pct", "three_cone_pct",
    "shuttle_pct", "bench_pct",
    "athletic_composite", "ras_score", "speed_score", "burst_score",
    "agility_score", "forty_per_pound", "catch_radius",
    # size
    "height_pct", "weight_pct", "bmi",
    # age
    "age_at_draft_pct", "days_since_birthday_at_draft",
    # recruit pedigree
    "recruit_composite_pct", "recruit_star_rating",
    "recruiting_to_draft_delta", "weight_change_recruit_to_draft",
    # draft signal (post-draft but non-college-production)
    "draft_capital_pct",
    "draft_round_normalized",
    "day_one_indicator",
})


@dataclass
class Comp:
    name: str
    position: str
    cohort: str
    similarity: float
    player_id: str
    # Per-layer cosine breakdown (BODY/VOLUME/EFFICIENCY/TRAITS) — populated
    # when the layered path is taken, used by the UI for the "axes of
    # similarity" display in the slide-out panel.
    per_layer: dict[str, float] | None = None


@dataclass
class CompPool:
    """Pre-loaded comp pool — all cohorts' hybrid vectors stitched into one
    polars frame plus per-position numpy matrices for fast kNN."""
    df: pl.DataFrame
    by_position: dict[str, np.ndarray]  # position → (N, D)
    pos_index: dict[str, list[int]]     # position → list of df row indexes
    vec_col: str = "hybrid_vec"         # df column holding the vector for kNN
    # Completeness-weighting support: per-position observation mask aligned
    # with by_position. Set when the loaded arm carries a `mask` column on
    # the underlying parquet (currently `feature` and the slice arms).
    # `None` for arms that don't have a meaningful per-feature observation
    # signal (text vectors, hybrid concats).
    mask_by_position: dict[str, np.ndarray] | None = None
    # Hybrid arms (hybrid / hybrid_clean / hybrid_legacy) populate these so
    # find_comps can compute (feature_cos_masked + text_cos)/2 explicitly
    # — averaging the masked-feature similarity with the full text
    # similarity. Without this split, the masked-cosine over the
    # concatenated vector lets the dense text half dominate when the
    # feature mask is sparse (Mendoza/Lance both got matched on text
    # despite ~zero shared observed feature dimensions).
    feature_by_position: dict[str, np.ndarray] | None = None  # raw feature_vec
    text_by_position: dict[str, np.ndarray] | None = None     # L2-normed text vec
    # v2 layered arm — per-archetype-layer per-position matrices and masks.
    # When set, find_comps computes masked cosine independently per layer and
    # equal-weight averages them, mirroring the (feat_cos + text_cos)/2
    # pattern but generalized to N layers. See LAYERED_ARMS docstring above.
    layer_matrices: dict[str, dict[str, np.ndarray]] | None = None
    layer_masks: dict[str, dict[str, np.ndarray]] | None = None
    # Per-position list of layer names that participate in the layered cosine
    # (varies by position: QB includes EFFICIENCY, others don't).
    layer_set_by_position: dict[str, tuple[str, ...]] | None = None


def filter_pool(pool: CompPool, player_ids: set[str]) -> CompPool:
    """Return a new pool restricted to `player_ids`. Per-position matrices
    and indices are rebuilt from the filtered df. Used by Phase 3 v1.1 to
    run apples-to-apples eval on the "has both sources" subset.
    """
    df = pool.df.filter(pl.col("player_id").is_in(list(player_ids)))
    return _build_pool(df, pool.vec_col)


def load_pool(
    curated_bucket: str,
    cohorts: tuple[str, ...] = COHORTS_DEFAULT,
    *,
    arm: str = "hybrid",
) -> CompPool:
    """Load vectors for given cohorts and pre-build per-position numpy
    matrices for kNN. `arm` selects which vector to use:
      - "hybrid"      (default) — L2-normalized feature + L2-normalized
                                   text concat (1080+-dim)
      - "feature"     — full structured-feature vector, L2-normalized
      - "text"        — Titan v2 text only, L2-normalized
      - "measurables" — sub-slice of feature_vec: combine + size + age +
                        recruit pedigree + draft signal (pre-college-
                        production), L2-normalized
      - "engineered"  — sub-slice of feature_vec: CFBD-production +
                        trajectory + situational, L2-normalized
    """
    if arm == "feature":
        # Load from feature_vectors.parquet (which carries the per-feature
        # observation mask) instead of hybrid_vectors.parquet.
        return _load_pool_feature(curated_bucket, cohorts)
    if arm in VEC_COLS:
        return _load_pool_named(curated_bucket, cohorts, arm)
    if arm in SLICE_ARMS:
        return _load_pool_sliced(curated_bucket, cohorts, arm)
    if arm in COMPOSITE_ARMS:
        return _load_pool_composite(curated_bucket, cohorts, arm)
    if arm in LAYERED_ARMS:
        return _load_pool_layered(curated_bucket, cohorts, arm)
    valid = ["feature"] + list(VEC_COLS) + list(SLICE_ARMS) + list(COMPOSITE_ARMS) + list(LAYERED_ARMS)
    raise ValueError(f"arm must be one of {valid}, got {arm!r}")


def _load_pool_feature(
    curated_bucket: str, cohorts: tuple[str, ...]
) -> CompPool:
    """Load the feature_vec arm directly from feature_vectors.parquet so
    the per-feature observation mask is available for completeness-
    weighted similarity. Other arms can also call into this when they
    need mask-aware kNN."""
    s3 = boto3.client("s3")
    parts: list[pl.DataFrame] = []
    for c in cohorts:
        body = s3.get_object(
            Bucket=curated_bucket,
            Key=f"embeddings/feature_vectors/cohort={c}/data.parquet",
        )["Body"].read()
        df = pl.read_parquet(io.BytesIO(body))
        df = df.with_columns(pl.lit(c).alias("cohort"))
        parts.append(df)
    df = pl.concat(parts, how="diagonal_relaxed")
    return _build_pool(df, "vector")


def _load_pool_named(
    curated_bucket: str, cohorts: tuple[str, ...], arm: str
) -> CompPool:
    vec_col = VEC_COLS[arm]
    s3 = boto3.client("s3")
    parts: list[pl.DataFrame] = []
    resolved_col = vec_col
    for c in cohorts:
        body = s3.get_object(
            Bucket=curated_bucket,
            Key=f"embeddings/hybrid_vectors/cohort={c}/data.parquet",
        )["Body"].read()
        df = pl.read_parquet(io.BytesIO(body))
        if vec_col not in df.columns:
            fallback = VEC_COL_FALLBACKS.get(vec_col)
            if fallback and fallback in df.columns:
                df = df.rename({fallback: vec_col})
                resolved_col = vec_col
            else:
                raise ValueError(
                    f"cohort {c}: parquet missing column {vec_col!r} (and no fallback). "
                    f"Re-run scripts/run_text_embeddings.py to add it."
                )
        df = df.with_columns(pl.lit(c).alias("cohort"))
        parts.append(df)
    df = pl.concat(parts)

    # For hybrid arms, surface (feature_vec, mask, text_clean_vec) so
    # find_comps can compute balanced (feature_cos_masked + text_cos)/2.
    # Without this, masked-cosine on the concat vec lets the dense text
    # half dominate when the feature mask is sparse.
    if arm in ("hybrid", "hybrid_clean", "hybrid_legacy"):
        text_col = (
            "text_legacy_vec" if arm == "hybrid_legacy" else "text_clean_vec"
        )
        mask_parts: list[pl.DataFrame] = []
        for c in cohorts:
            try:
                body = s3.get_object(
                    Bucket=curated_bucket,
                    Key=f"embeddings/feature_vectors/cohort={c}/data.parquet",
                )["Body"].read()
                fv_df = pl.read_parquet(io.BytesIO(body))
                if "mask" in fv_df.columns:
                    mask_parts.append(fv_df.select(["player_id", "mask"]))
            except Exception:
                continue
        if mask_parts:
            mask_df = pl.concat(mask_parts).unique(subset=["player_id"])
            df = df.join(mask_df, on="player_id", how="left")
        return _build_pool(
            df,
            resolved_col,
            hybrid_split=("feature_vec", text_col, "mask" if mask_parts else None),
        )

    return _build_pool(df, resolved_col)


def _load_pool_sliced(
    curated_bucket: str, cohorts: tuple[str, ...], arm: str
) -> CompPool:
    """Build a pool from feature_vectors.parquet + feature_stats.json by
    slicing the raw z-scored feature vector into measurables / engineered
    sub-vectors per position."""
    import json as _json
    s3 = boto3.client("s3")
    # Load feature stats to get per-position feature_order
    stats_body = s3.get_object(
        Bucket=curated_bucket, Key="embeddings/feature_stats.json"
    )["Body"].read()
    stats = _json.loads(stats_body)
    # Per-position mask: indices in feature_order that are measurables
    pos_mask: dict[str, list[int]] = {}
    for pos, info in stats.items():
        order = info["feature_order"]
        if arm == "measurables":
            pos_mask[pos] = [i for i, n in enumerate(order) if n in MEASURABLE_FEATURE_NAMES]
        else:  # engineered
            pos_mask[pos] = [i for i, n in enumerate(order) if n not in MEASURABLE_FEATURE_NAMES]

    parts: list[pl.DataFrame] = []
    for c in cohorts:
        body = s3.get_object(
            Bucket=curated_bucket,
            Key=f"embeddings/feature_vectors/cohort={c}/data.parquet",
        )["Body"].read()
        df = pl.read_parquet(io.BytesIO(body))
        df = df.with_columns(pl.lit(c).alias("cohort"))
        parts.append(df)
    df = pl.concat(parts)

    # Slice each row's vector AND mask by position-specific indices
    has_mask_col = "mask" in df.columns
    sliced_vecs = []
    sliced_masks = []
    for row in df.iter_rows(named=True):
        full = np.asarray(row["vector"], dtype=np.float64)
        idxs = pos_mask[row["position"]]
        sliced_vecs.append(full[idxs].tolist())
        if has_mask_col:
            full_mask = np.asarray(row["mask"], dtype=np.float64)
            sliced_masks.append(full_mask[idxs].tolist())
    df = df.with_columns(pl.Series(name="sliced_vec", values=sliced_vecs))
    if has_mask_col:
        df = df.with_columns(pl.Series(name="mask", values=sliced_masks))
    return _build_pool(df, "sliced_vec")


def _load_pool_composite(
    curated_bucket: str, cohorts: tuple[str, ...], arm: str
) -> CompPool:
    """Build a per-source hybrid pool by concatenating the persisted
    L2-normalized feature_vec with one of the persisted text vectors at
    load time. Both halves are already L2-normed, so concat → L2-norm of
    the concatenation is equivalent to averaged cosine across halves.
    """
    feat_col, text_col = COMPOSITE_ARMS[arm]
    s3 = boto3.client("s3")
    parts: list[pl.DataFrame] = []
    for c in cohorts:
        body = s3.get_object(
            Bucket=curated_bucket,
            Key=f"embeddings/hybrid_vectors/cohort={c}/data.parquet",
        )["Body"].read()
        df = pl.read_parquet(io.BytesIO(body))
        if text_col not in df.columns:
            raise ValueError(
                f"cohort {c} hybrid_vectors.parquet missing column {text_col!r} — "
                f"re-run scripts/run_text_embeddings.py to add per-source vectors"
            )
        df = df.with_columns(pl.lit(c).alias("cohort"))
        parts.append(df)
    df = pl.concat(parts)
    composite = []
    for row in df.iter_rows(named=True):
        feat = np.asarray(row[feat_col], dtype=np.float64)
        text = np.asarray(row[text_col], dtype=np.float64)
        composite.append(np.concatenate([feat, text]).tolist())
    df = df.with_columns(pl.Series(name="composite_vec", values=composite))
    return _build_pool(df, "composite_vec")


def _load_pool_layered(
    curated_bucket: str, cohorts: tuple[str, ...], arm: str
) -> CompPool:
    """Load feature_vectors.parquet and slice each row's vector by archetype
    layer (BODY / VOLUME / EFFICIENCY). Per-layer cosines are computed in
    find_comps and equal-weight averaged. When arm == feature_v2_traits, also
    pulls the Sonnet trait vectors from trait_vectors.parquet and adds the
    TRAITS layer to the cosine combiner.
    """
    from engine.embedding.feature_vector import _layers_for_order  # local import

    include_traits = arm == "feature_v2_traits"

    s3 = boto3.client("s3")
    # feature_stats.json gives us feature_order per position — authoritative for
    # how each persisted vector is laid out.
    stats_body = s3.get_object(
        Bucket=curated_bucket, Key="embeddings/feature_stats.json"
    )["Body"].read()
    stats = _json.loads(stats_body)
    # Per-position layer-name → list-of-indices into feature_order
    pos_layers: dict[str, dict[str, list[int]]] = {}
    for pos, info in stats.items():
        pos_layers[pos] = _layers_for_order(info["feature_order"])

    parts: list[pl.DataFrame] = []
    for c in cohorts:
        body = s3.get_object(
            Bucket=curated_bucket,
            Key=f"embeddings/feature_vectors/cohort={c}/data.parquet",
        )["Body"].read()
        df = pl.read_parquet(io.BytesIO(body))
        df = df.with_columns(pl.lit(c).alias("cohort"))
        parts.append(df)
    df = pl.concat(parts, how="diagonal_relaxed")

    # Optional: load Sonnet trait vectors and join on player_id. Missing
    # entries (no Brugler/Walter text or extraction failed) get a zero vec +
    # zero mask, contributing nothing to the trait-layer cosine.
    trait_lookup: dict[str, dict] = {}
    if include_traits:
        for c in cohorts:
            try:
                tbody = s3.get_object(
                    Bucket=curated_bucket,
                    Key=f"embeddings/trait_vectors/cohort={c}/data.parquet",
                )["Body"].read()
            except Exception:
                continue
            tdf = pl.read_parquet(io.BytesIO(tbody))
            for row in tdf.iter_rows(named=True):
                trait_lookup[row["player_id"]] = {
                    "trait_vec": row.get("trait_vec"),
                    "trait_mask": row.get("trait_mask"),
                }

    has_mask_col = "mask" in df.columns
    by_position: dict[str, np.ndarray] = {}
    pos_index: dict[str, list[int]] = {}
    layer_matrices: dict[str, dict[str, np.ndarray]] = {}
    layer_masks: dict[str, dict[str, np.ndarray]] = {}
    layer_set_by_position: dict[str, tuple[str, ...]] = {}

    for pos in df["position"].unique().to_list():
        idxs = [i for i, p in enumerate(df["position"].to_list()) if p == pos]
        pos_index[pos] = idxs

        # Position-specific layer set (QB includes EFFICIENCY; all positions get
        # TRAITS when feature_v2_traits is loaded — otherwise drop TRAITS).
        position_enum = Position[pos]
        cfg_layers = V2_SIMILARITY_LAYERS.get(
            position_enum, (LAYER_BODY, LAYER_VOLUME, LAYER_TRAITS)
        )
        if not include_traits:
            cfg_layers = tuple(L for L in cfg_layers if L != LAYER_TRAITS)
        sim_layers = cfg_layers
        layer_set_by_position[pos] = sim_layers

        layer_idx_map = pos_layers[pos]
        # Build engineered-feature layers (BODY / VOLUME / EFFICIENCY)
        for layer in sim_layers:
            if layer == LAYER_TRAITS:
                continue  # handled separately below
            layer_idxs = layer_idx_map.get(layer, [])
            if not layer_idxs:
                continue
            d = len(layer_idxs)
            M = np.zeros((len(idxs), d), dtype=np.float64)
            mask_M = np.ones((len(idxs), d), dtype=np.float64)
            for row_i, df_i in enumerate(idxs):
                full_vec = np.asarray(df["vector"][df_i], dtype=np.float64)
                M[row_i] = full_vec[layer_idxs]
                if has_mask_col:
                    full_mask = df["mask"][df_i]
                    if full_mask is not None:
                        full_mask = np.asarray(full_mask, dtype=np.float64)
                        if full_mask.shape[0] == full_vec.shape[0]:
                            mask_M[row_i] = full_mask[layer_idxs]
            layer_matrices.setdefault(layer, {})[pos] = M
            layer_masks.setdefault(layer, {})[pos] = mask_M

        # TRAITS layer — Sonnet-extracted scouting archetypes joined by
        # player_id. Trait dim is position-specific (QB=12, RB/WR=10, TE=10);
        # determined by the first non-empty trait vector encountered.
        if include_traits:
            trait_d: int | None = None
            # Discover per-position trait dim from the first prospect with traits
            for df_i in idxs:
                pid = df["player_id"][df_i]
                tr = trait_lookup.get(pid)
                if tr and tr.get("trait_vec"):
                    trait_d = len(tr["trait_vec"])
                    break
            if trait_d is not None:
                M = np.zeros((len(idxs), trait_d), dtype=np.float64)
                mask_M = np.zeros((len(idxs), trait_d), dtype=np.float64)
                for row_i, df_i in enumerate(idxs):
                    pid = df["player_id"][df_i]
                    tr = trait_lookup.get(pid)
                    if tr and tr.get("trait_vec") and len(tr["trait_vec"]) == trait_d:
                        M[row_i] = np.asarray(tr["trait_vec"], dtype=np.float64)
                        if tr.get("trait_mask") and len(tr["trait_mask"]) == trait_d:
                            mask_M[row_i] = np.asarray(
                                tr["trait_mask"], dtype=np.float64
                            )
                layer_matrices.setdefault(LAYER_TRAITS, {})[pos] = M
                layer_masks.setdefault(LAYER_TRAITS, {})[pos] = mask_M

        # by_position is a placeholder for the simple-cosine code path; for the
        # layered arm find_comps uses layer_matrices/layer_masks instead. We
        # still populate by_position with the union slice (concat of all sim
        # layers, L2-normed) so that callers that don't take the layered path
        # still get something sensible — e.g., the classifier eval which fits
        # sklearn models per-arm. For feature_v2_traits this concatenates the
        # engineered union slice with the trait vector so the classifier sees
        # the same feature space the layered cosine ranks over.
        union_idxs: list[int] = []
        for layer in sim_layers:
            if layer == LAYER_TRAITS:
                continue
            union_idxs.extend(layer_idx_map.get(layer, []))
        union_idxs = sorted(set(union_idxs))
        d_union = len(union_idxs)
        # Optional trait extension
        trait_M_for_pos = (
            layer_matrices.get(LAYER_TRAITS, {}).get(pos)
            if include_traits and LAYER_TRAITS in layer_matrices
            else None
        )
        d_traits = trait_M_for_pos.shape[1] if trait_M_for_pos is not None else 0
        d_total = d_union + d_traits
        if d_total == 0:
            by_position[pos] = np.zeros((len(idxs), 1), dtype=np.float64)
        else:
            U = np.zeros((len(idxs), d_total), dtype=np.float64)
            for row_i, df_i in enumerate(idxs):
                full_vec = np.asarray(df["vector"][df_i], dtype=np.float64)
                if d_union > 0:
                    U[row_i, :d_union] = full_vec[union_idxs]
                if d_traits > 0 and trait_M_for_pos is not None:
                    U[row_i, d_union:] = trait_M_for_pos[row_i]
            U = U / np.linalg.norm(U, axis=1, keepdims=True).clip(min=1e-12)
            by_position[pos] = U
        # Write the sliced vector back to df so vec_col-based callers
        # (classifier eval) read the v2 feature space, not the full 168-dim
        # original engineered vector.
        # (This requires us to assemble a per-row list aligned with df's row
        # order, which is `idxs` order — same as by_position rows.)

    # Assemble per-row v2 sliced vector aligned with df row order, so vec_col
    # consumers (classifier eval, which iterates df.iter_rows) read the v2
    # feature space rather than the full 168-dim engineered vector.
    n_rows = df.height
    sliced_vecs: list[list[float]] = [None] * n_rows  # type: ignore[list-item]
    for pos, idxs in pos_index.items():
        M = by_position[pos]
        for local_i, df_i in enumerate(idxs):
            sliced_vecs[df_i] = M[local_i].tolist()
    # Fill any positions not covered (shouldn't happen, but defensive)
    for i in range(n_rows):
        if sliced_vecs[i] is None:
            sliced_vecs[i] = [0.0]
    df = df.with_columns(pl.Series(name="v2_sliced_vec", values=sliced_vecs))

    return CompPool(
        df=df,
        by_position=by_position,
        pos_index=pos_index,
        vec_col="v2_sliced_vec",
        mask_by_position=None,
        feature_by_position=None,
        text_by_position=None,
        layer_matrices=layer_matrices,
        layer_masks=layer_masks,
        layer_set_by_position=layer_set_by_position,
    )


def _build_pool(
    df: pl.DataFrame,
    vec_col: str,
    *,
    hybrid_split: tuple[str, str, str | None] | None = None,
) -> CompPool:
    """Build a CompPool. `hybrid_split=(feature_col, text_col, mask_col)`
    splits the parquet into separate feature/text matrices for the
    balanced (feature_cos + text_cos)/2 hybrid composition.
    """
    by_position: dict[str, np.ndarray] = {}
    pos_index: dict[str, list[int]] = {}
    for pos in df["position"].unique().to_list():
        idxs = [i for i, p in enumerate(df["position"].to_list()) if p == pos]
        M = np.stack([np.asarray(df[vec_col][i], dtype=np.float64) for i in idxs])
        # Pre-normalize for cosine
        M = M / np.linalg.norm(M, axis=1, keepdims=True).clip(min=1e-12)
        by_position[pos] = M
        pos_index[pos] = idxs

    # Surface per-position observation masks if the parquet carries them.
    # Used by find_comps for completeness-weighted similarity (defends
    # against shared missing-data patterns inflating same-cohort similarity).
    # Rows with a NULL mask are treated as fully observed (all 1s), which
    # falls back to standard cosine for that prospect.
    mask_by_position: dict[str, np.ndarray] | None = None
    if "mask" in df.columns:
        mask_by_position = {}
        for pos, idxs in pos_index.items():
            d = by_position[pos].shape[1]
            rows = []
            for i in idxs:
                m = df["mask"][i]
                if m is None:
                    rows.append(np.ones(d, dtype=np.float64))
                else:
                    arr = np.asarray(m, dtype=np.float64)
                    if arr.shape[0] != d:
                        arr = np.ones(d, dtype=np.float64)
                    rows.append(arr)
            mask_by_position[pos] = np.stack(rows)

    feature_by_position: dict[str, np.ndarray] | None = None
    text_by_position: dict[str, np.ndarray] | None = None
    if hybrid_split is not None:
        feat_col, text_col, mask_col = hybrid_split
        feature_by_position = {}
        text_by_position = {}
        # Override mask_by_position to use only the feature half (not the
        # padded version). The hybrid arm computes feat_cos and text_cos
        # separately, so the mask only needs to align with feature_vec.
        mask_by_position = {}
        for pos, idxs in pos_index.items():
            feature_by_position[pos] = np.stack([
                np.asarray(df[feat_col][i], dtype=np.float64) for i in idxs
            ])
            text_by_position[pos] = np.stack([
                np.asarray(df[text_col][i], dtype=np.float64) for i in idxs
            ])
            d_feat = feature_by_position[pos].shape[1]
            if mask_col and mask_col in df.columns:
                mask_rows = []
                for i in idxs:
                    m = df[mask_col][i]
                    if m is None:
                        mask_rows.append(np.ones(d_feat, dtype=np.float64))
                    else:
                        arr = np.asarray(m, dtype=np.float64)
                        if arr.shape[0] != d_feat:
                            arr = np.ones(d_feat, dtype=np.float64)
                        mask_rows.append(arr)
                mask_by_position[pos] = np.stack(mask_rows)
            else:
                mask_by_position[pos] = np.ones((len(idxs), d_feat), dtype=np.float64)

    return CompPool(
        df=df,
        by_position=by_position,
        pos_index=pos_index,
        vec_col=vec_col,
        mask_by_position=mask_by_position,
        feature_by_position=feature_by_position,
        text_by_position=text_by_position,
    )


def player_ids_with_sources(
    curated_bucket: str,
    cohort: str,
    *,
    require_brugler: bool = False,
    require_wikipedia: bool = False,
    require_walter_football: bool = False,
) -> set[str]:
    """Return the set of player_ids in `cohort` that satisfy the source
    requirements. Reads has_brugler / has_walter_football / has_wikipedia
    flags from the cohort's hybrid_vectors parquet."""
    s3 = boto3.client("s3")
    body = s3.get_object(
        Bucket=curated_bucket,
        Key=f"embeddings/hybrid_vectors/cohort={cohort}/data.parquet",
    )["Body"].read()
    df = pl.read_parquet(io.BytesIO(body))
    if require_brugler:
        df = df.filter(pl.col("has_brugler"))
    if require_wikipedia:
        df = df.filter(pl.col("has_wikipedia"))
    if require_walter_football:
        if "has_walter_football" not in df.columns:
            return set()  # parquet predates Walter Football ingest
        df = df.filter(pl.col("has_walter_football"))
    return set(df["player_id"].to_list())


def find_comps(
    pool: CompPool,
    query_name: str | None = None,
    *,
    query_player_id: str | None = None,
    top_k: int = 10,
    same_position_only: bool = True,
    exclude_cohorts: set[str] | None = None,
    completeness_weighted: bool | None = None,
    min_shared_features: int = 10,
    layer_weights: dict[str, float] | None = None,
) -> list[Comp]:
    """Find top-K cosine-similarity comps for a player.

    Provide either `query_name` (resolved on the pool's df) or
    `query_player_id`. Uses pre-normalized per-position matrices for
    fast lookup.

    `exclude_cohorts`: drop these cohorts from the candidate pool. When a
    prediction-cohort prospect (e.g. 2026 draft) is the query, callers
    should pass {prediction_cohort} so the comps come from prospects with
    settled NFL outcomes instead of from other un-drafted prospects.

    `completeness_weighted`: when True (and the pool carries observation
    masks), compute cosine over only the dimensions where BOTH the query
    and the candidate have observed (non-imputed) values. Defends against
    the bias where prospects with shared missing-data patterns (e.g.
    2026 draftees who all lack birthdates / combine drills) cluster on
    their shared zeros. Defaults to True when masks are available.
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
        raise NotImplementedError("cross-position comps not implemented yet")
    M = pool.by_position[q_pos]
    idxs = pool.pos_index[q_pos]
    # Locate query in M
    self_local_idx = idxs.index(
        next(i for i, pid in enumerate(pool.df["player_id"].to_list()) if pid == q_pid)
    )

    use_weighted = completeness_weighted
    if use_weighted is None:
        use_weighted = (
            pool.mask_by_position is not None
            or pool.layer_matrices is not None
        )

    is_hybrid = (
        pool.feature_by_position is not None
        and pool.text_by_position is not None
    )
    is_layered = pool.layer_matrices is not None
    # Per-layer cosines kept for the UI per_layer breakdown. Stays empty
    # for non-layered paths; safe to read after the if/elif chain.
    per_layer_cos_by_layer: dict[str, np.ndarray] = {}

    if is_layered:
        # v2 layered path — masked cosine per archetype layer combined via
        # per-position weights (TRAITS > VOLUME > BODY per Greg's directive,
        # 2026-04-30). Each layer is L2-renormed implicitly via per-layer
        # cosine, so the dimension-richer BODY layer doesn't drown out the
        # smaller-but-decisive VOLUME / TRAITS signals.
        position_enum = Position[q_pos]
        # Layer weights: caller override > position default. Override dict
        # applies verbatim; layers not in override are treated as 0-weight
        # (i.e., excluded from the combiner). Useful for rapid weight tuning
        # via the audit CLI without code edits.
        weights = layer_weights if layer_weights is not None else v2_layer_weights(position_enum)
        sim_layers = (pool.layer_set_by_position or {}).get(q_pos, ())
        if not sim_layers:
            raise ValueError(
                f"layered pool has no similarity layers configured for position {q_pos!r}"
            )
        weighted_sum: np.ndarray | None = None
        applied_weight_sum: np.ndarray | None = None
        per_layer_shared: list[np.ndarray] = []
        N = None
        for layer in sim_layers:
            layer_M = (pool.layer_matrices or {}).get(layer, {}).get(q_pos)
            layer_mask = (pool.layer_masks or {}).get(layer, {}).get(q_pos)
            if layer_M is None:
                continue
            N = layer_M.shape[0] if N is None else N
            q_vec = layer_M[self_local_idx]
            if layer_mask is not None:
                q_mask = layer_mask[self_local_idx]
                both = layer_mask * q_mask
            else:
                both = np.ones_like(layer_M)
            a = q_vec[None, :] * both
            b = layer_M * both
            num = (a * b).sum(axis=1)
            denom = np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-12
            layer_cos = num / denom
            shared = both.sum(axis=1)
            # Candidates with zero shared observed dims contribute 0 cosine
            # AND are excluded from this layer's effective-weight denominator
            # (so a candidate missing TRAITS isn't penalized vs a candidate
            # whose TRAITS happen to disagree).
            layer_observed = (shared > 0).astype(np.float64)
            layer_cos = np.where(shared > 0, layer_cos, 0.0)
            w = float(weights.get(layer, 0.0))
            if w == 0.0:
                continue
            contribution = w * layer_cos
            applied = w * layer_observed
            if weighted_sum is None:
                weighted_sum = contribution
                applied_weight_sum = applied
            else:
                weighted_sum = weighted_sum + contribution
                applied_weight_sum = applied_weight_sum + applied
            per_layer_shared.append(shared)
            per_layer_cos_by_layer[layer] = layer_cos
        if weighted_sum is None or applied_weight_sum is None:
            raise ValueError(f"no layer matrices materialized for position {q_pos!r}")
        # Raw weighted sum — NO renormalization by applied weights. A candidate
        # missing the TRAITS layer (no Brugler/Walter Football text — common
        # for pre-2018 historical prospects) caps at BODY_w + VOLUME_w (=0.5
        # for non-QB) and cannot displace full-data candidates in top-K. This
        # is correct behavior: archetype is the primary similarity signal,
        # and candidates without archetype evidence are fundamentally less
        # informative. Renormalizing gave them a "free pass" on TRAITS,
        # producing the Tate-collapse failure mode (sparse 2026 query
        # matching sparse-historical candidates at 0.98+ on BODY alone).
        sims = weighted_sum
        # Min-shared-features floor: total shared dims summed across layers
        # must clear `min_shared_features`; otherwise candidate is too sparse
        # to compare against query.
        total_shared = np.sum(np.stack(per_layer_shared), axis=0)
        sims = np.where(total_shared >= min_shared_features, sims, -np.inf)
    elif is_hybrid and use_weighted:
        # Balanced hybrid: average masked-feature cosine with full text
        # cosine. Defends against the "dense text dominates sparse
        # masked feature dims" failure mode.
        feat_M = pool.feature_by_position[q_pos]
        text_M = pool.text_by_position[q_pos]
        masks = pool.mask_by_position[q_pos]
        q_feat = feat_M[self_local_idx]
        q_text = text_M[self_local_idx]
        q_mask = masks[self_local_idx]
        both = masks * q_mask
        a = q_feat[None, :] * both
        b = feat_M * both
        num_f = (a * b).sum(axis=1)
        denom_f = np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-12
        feat_cos = num_f / denom_f
        shared_count = both.sum(axis=1)
        feat_cos = np.where(shared_count >= min_shared_features, feat_cos, 0.0)
        # Text cosine — text vecs are stored L2-normed.
        denom_t = np.linalg.norm(text_M, axis=1) * np.linalg.norm(q_text) + 1e-12
        text_cos = (text_M @ q_text) / denom_t
        sims = (feat_cos + text_cos) / 2.0
        # Drop candidates with no shared feature observations (the text-
        # only signal isn't enough — pure text-similarity is the failure
        # mode that motivates this whole approach).
        sims = np.where(shared_count >= min_shared_features, sims, -np.inf)
    elif use_weighted and pool.mask_by_position is not None:
        masks = pool.mask_by_position[q_pos]
        raw = np.stack([
            np.asarray(pool.df[pool.vec_col][i], dtype=np.float64) for i in idxs
        ])
        q_raw = raw[self_local_idx]
        q_mask = masks[self_local_idx]
        both = masks * q_mask
        a = q_raw[None, :] * both
        b = raw * both
        num = (a * b).sum(axis=1)
        denom = np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-12
        sims = num / denom
        shared_count = both.sum(axis=1)
        sims = np.where(shared_count >= min_shared_features, sims, -np.inf)
    else:
        q_unit = M[self_local_idx]
        sims = M @ q_unit  # (N,)

    # Mask self
    sims[self_local_idx] = -np.inf
    # Mask excluded cohorts
    if exclude_cohorts:
        cohort_col = pool.df["cohort"].to_list()
        for local_i, df_i in enumerate(idxs):
            if local_i == self_local_idx:
                continue
            if cohort_col[df_i] in exclude_cohorts:
                sims[local_i] = -np.inf
    top_local = np.argsort(-sims)[:top_k]

    def _per_layer_for(local_i: int) -> dict[str, float] | None:
        if not is_layered or not per_layer_cos_by_layer:
            return None
        return {
            layer: float(arr[local_i])
            for layer, arr in per_layer_cos_by_layer.items()
        }

    return [
        Comp(
            name=pool.df["name"][idxs[int(i)]],
            position=pool.df["position"][idxs[int(i)]],
            cohort=pool.df["cohort"][idxs[int(i)]],
            similarity=float(sims[int(i)]),
            player_id=pool.df["player_id"][idxs[int(i)]],
            per_layer=_per_layer_for(int(i)),
        )
        for i in top_local
    ]
