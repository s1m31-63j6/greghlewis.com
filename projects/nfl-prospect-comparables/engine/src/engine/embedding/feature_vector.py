"""Feature vectorization — convert per-profile `features: dict[str, float]`
to a fixed-size numeric vector ready for the structured side of the hybrid
embedding (Phase 2.5 adds Titan v2 over scouting text).

Per-position vector spaces (each position has different applicable features
per catalog). Alphabetical feature ordering for reproducibility. Position-
cohort median imputation for nulls. Z-score normalization within position
cohort. Stats pooled from train+val so the 2026 prediction cohort uses the
same baseline.
"""

from __future__ import annotations

import io
import json
import statistics
from dataclasses import dataclass, field

import numpy as np
import polars as pl

from engine.features.catalog import (
    CATALOG,
    LAYER_OTHER,
    feature_names_for,
)
from engine.io import s3 as s3io
from engine.schema import PlayerProfile, Position


# Catalog lookup: feature name -> layer. Built once at import time. Source of truth
# for slicing feature vectors by archetype layer downstream (e.g., per-layer cosine
# in find_comps). The catalog is authoritative — persisted feature_order is kept
# stable across runs, but layer membership is recomputed from the catalog.
_FEATURE_LAYER: dict[str, str] = {f.name: f.layer for f in CATALOG}


def _layers_for_order(feature_order: list[str]) -> dict[str, list[int]]:
    """Map layer name -> indices into `feature_order` for that layer.

    Vectors are alphabetically ordered per position; this function partitions
    the indices by archetype layer so callers can slice the vector cheaply.
    """
    layers: dict[str, list[int]] = {}
    for idx, name in enumerate(feature_order):
        layer = _FEATURE_LAYER.get(name, LAYER_OTHER)
        layers.setdefault(layer, []).append(idx)
    return layers


# ---------- per-position normalization stats ----------


@dataclass
class PositionStats:
    """Per-feature normalization stats for one position cohort.

    `feature_order` is the canonical alphabetical ordering of features that
    apply to this position. `means`, `stds`, `medians` are keyed by feature
    name; values for features with zero or one observed sample default to
    (mean=0.0, std=1.0, median=0.0) which is a no-op transform.

    `layers` partitions `feature_order` indices by archetype layer (BODY,
    VOLUME, EFFICIENCY, TRAJECTORY, CONTEXT, EXCLUDED, OTHER) per the v2
    similarity design. Recomputed from the catalog at load time, not persisted.
    """
    feature_order: list[str]
    means: dict[str, float] = field(default_factory=dict)
    stds: dict[str, float] = field(default_factory=dict)
    medians: dict[str, float] = field(default_factory=dict)
    layers: dict[str, list[int]] = field(default_factory=dict)

    def indices_for_layers(self, layer_names: tuple[str, ...]) -> list[int]:
        """Concatenated, sorted indices of the given layers in feature_order."""
        out: list[int] = []
        for layer in layer_names:
            out.extend(self.layers.get(layer, []))
        out.sort()
        return out


def compute_position_stats(
    profiles: list[PlayerProfile], position: Position
) -> PositionStats:
    """Pool all profiles of `position` and compute per-feature stats."""
    feature_order = sorted(feature_names_for(position))
    pos_profiles = [p for p in profiles if p.position == position]

    means: dict[str, float] = {}
    stds: dict[str, float] = {}
    medians: dict[str, float] = {}
    for name in feature_order:
        values = [
            float(p.features[name])
            for p in pos_profiles
            if (p.features or {}).get(name) is not None
        ]
        if len(values) == 0:
            means[name] = 0.0
            stds[name] = 1.0
            medians[name] = 0.0
            continue
        means[name] = float(statistics.mean(values))
        medians[name] = float(statistics.median(values))
        if len(values) > 1:
            std = float(statistics.pstdev(values))
            stds[name] = std if std > 0 else 1.0
        else:
            stds[name] = 1.0
    return PositionStats(
        feature_order=feature_order,
        means=means,
        stds=stds,
        medians=medians,
        layers=_layers_for_order(feature_order),
    )


def build_all_stats(profiles: list[PlayerProfile]) -> dict[str, PositionStats]:
    """Compute stats for each position present in the pooled cohort."""
    out: dict[str, PositionStats] = {}
    for pos in Position:
        if any(p.position == pos for p in profiles):
            out[pos.name] = compute_position_stats(profiles, pos)
    return out


# ---------- vectorization ----------


def vectorize_profile(
    profile: PlayerProfile, stats: PositionStats
) -> tuple[np.ndarray, np.ndarray]:
    """Build a fixed-size z-scored vector + observation mask.

    Returns (vec, mask). `mask[i]` is 1.0 if the feature was observed for
    this profile (raw value not None) and 0.0 if the value was imputed
    (missing → cohort median). Downstream comp similarity uses the mask
    to compute completeness-weighted cosine, which prevents the 2026
    cohort from clustering on its shared missing-data signature.
    """
    features = profile.features or {}
    n = len(stats.feature_order)
    vec = np.zeros(n, dtype=np.float64)
    mask = np.zeros(n, dtype=np.float64)
    for i, name in enumerate(stats.feature_order):
        raw = features.get(name)
        if raw is None:
            raw = stats.medians[name]
        else:
            mask[i] = 1.0
        vec[i] = (float(raw) - stats.means[name]) / stats.stds[name]
    return vec, mask


def vectorize_cohort(
    profiles: list[PlayerProfile],
    stats_by_position: dict[str, PositionStats],
) -> pl.DataFrame:
    """One row per profile with the full vector + mask. Profiles whose
    position has no stats are skipped."""
    rows: list[dict] = []
    for p in profiles:
        pos_name = p.position.name
        stats = stats_by_position.get(pos_name)
        if stats is None:
            continue
        vec, mask = vectorize_profile(p, stats)
        rows.append({
            "player_id": p.player_id,
            "name": p.name,
            "position": pos_name,
            "vector": vec.tolist(),
            "mask": mask.tolist(),
        })
    return pl.DataFrame(rows)


# ---------- persistence ----------


def persist_stats(
    stats_by_position: dict[str, PositionStats], curated_bucket: str
) -> str:
    """Single JSON keyed by position. Used to vectorize the 2026 prediction
    cohort against the same baseline."""
    payload = {
        pos: {
            "feature_order": s.feature_order,
            "means": s.means,
            "stds": s.stds,
            "medians": s.medians,
        }
        for pos, s in stats_by_position.items()
    }
    body = json.dumps(payload, indent=2).encode("utf-8")
    key = "embeddings/feature_stats.json"
    s3io._client().put_object(Bucket=curated_bucket, Key=key, Body=body)
    return f"s3://{curated_bucket}/{key}"


def load_stats(curated_bucket: str) -> dict[str, PositionStats]:
    body = s3io._client().get_object(
        Bucket=curated_bucket, Key="embeddings/feature_stats.json"
    )["Body"].read().decode("utf-8")
    payload = json.loads(body)
    return {
        pos: PositionStats(
            feature_order=v["feature_order"],
            means=v["means"],
            stds=v["stds"],
            medians=v["medians"],
            layers=_layers_for_order(v["feature_order"]),
        )
        for pos, v in payload.items()
    }


def persist_cohort_vectors(
    df: pl.DataFrame, curated_bucket: str, cohort: str
) -> str:
    key = f"embeddings/feature_vectors/cohort={cohort}/data.parquet"
    buf = io.BytesIO()
    df.write_parquet(buf)
    s3io._client().put_object(
        Bucket=curated_bucket, Key=key, Body=buf.getvalue()
    )
    return f"s3://{curated_bucket}/{key}"
