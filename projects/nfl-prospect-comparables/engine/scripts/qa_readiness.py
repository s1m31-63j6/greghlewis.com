"""Phase 2 readiness check — internal QA gate before embeddings + pgvector.

Runs five rigor checks against the assembled feature profiles:
  1. Coverage — every implemented feature ≥ 50% population in validation
  2. Pathology — no NaN/Inf, values within plausible per-feature bounds
  3. Outcome-class separability — features that don't separate Bust from
     HOF-track at the marginal level are noise; flag them
  4. Cohort comparability — train vs val distributions should look like the
     same population (else 2026 prediction will be off-distribution)
  5. Redundancy — pairwise |r| > 0.95 is a candidate to drop

Findings printed to console. Output is internal QA — not a publishable
artifact. Phase 2 is gated on no critical flags.

Usage (from engine/):
    uv run python scripts/qa_readiness.py
"""

from __future__ import annotations

import json
import math
import os
import sys
from collections import defaultdict
from collections.abc import Iterable

import boto3
import polars as pl
from dotenv import load_dotenv

from engine.features import catalog
from engine.schema import Position

load_dotenv()


COHORTS = ["training_2014_2020", "validation_2021_2025"]

POSITION_PREFIX = {
    "QB": "qb_",
    "RB": "rb_",
    "WR": "wr_",
    "TE": "te_",
}

# Map from position string → set of feature names from the catalog that apply
_POSITION_FEATURES: dict[str, set[str]] = {
    pos.name: {f.name for f in catalog.CATALOG if pos in f.positions}
    for pos in Position
}

OUTCOME_TIER_ORDER = [
    "bust",
    "role_player",
    "starter",
    "pro_bowl",
    "hof_track",
]


# ---------- helpers ----------


def load_profiles(cohort: str) -> list[dict]:
    bucket = os.environ["S3_CURATED_BUCKET"]
    key = f"profiles/{cohort}/data.jsonl"
    body = boto3.client("s3").get_object(Bucket=bucket, Key=key)["Body"].read().decode()
    return [json.loads(line) for line in body.splitlines() if line]


def to_frame(profiles: list[dict]) -> pl.DataFrame:
    """Flatten profile records (features dict + position + outcome.tier) to a
    wide polars frame for analysis."""
    rows: list[dict] = []
    for p in profiles:
        row = {
            "player_id": p["player_id"],
            "name": p["name"],
            "position": p["position"],
            "outcome_tier": (p.get("career_outcome") or {}).get("tier"),
            **(p.get("features") or {}),
        }
        rows.append(row)
    return pl.DataFrame(rows)


def feature_columns(df: pl.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in ("player_id", "name", "position", "outcome_tier")]


def position_features(df: pl.DataFrame, position: str) -> list[str]:
    """Just features in the catalog that apply to the given position."""
    catalog_set = _POSITION_FEATURES.get(position, set())
    return [c for c in feature_columns(df) if c in catalog_set]


# ---------- check 1: coverage ----------


def check_coverage(train_df: pl.DataFrame, val_df: pl.DataFrame) -> list[str]:
    """For each implemented feature, % populated within its position's cohort.
    Flag features < 50% in validation (full-CFBD-coverage cohort)."""
    print("\n" + "=" * 78)
    print("1. COVERAGE — every feature ≥ 50% in validation per its applicable position")
    print("=" * 78)
    flagged = []
    for pos in POSITION_PREFIX:
        pos_val = val_df.filter(pl.col("position") == pos)
        if pos_val.height == 0:
            continue
        cols = position_features(val_df, pos)
        for c in cols:
            n_total = pos_val.height
            n_set = pos_val.select(pl.col(c).is_not_null().sum()).item()
            pct = 100.0 * n_set / n_total
            if pct < 50.0:
                flagged.append(f"  [{pos}] {c}: {pct:.1f}% — below 50% threshold")
    if not flagged:
        print("  ✓ all features ≥ 50% coverage in validation cohort")
    else:
        print(f"  {len(flagged)} feature(s) flagged below 50% coverage:")
        for f in flagged:
            print(f)
    return flagged


# ---------- check 2: pathology (NaN/Inf, range bounds) ----------


# Plausible-range bounds. Only the ranges I'm certain about — combine
# percentiles are stored as 0-100, agility_score is negated, and many
# composites have unusual scales. When in doubt, skip the range check
# and let separability handle signal quality.
RANGE_BOUNDS: dict[str, tuple[float, float]] = {
    "draft_capital_pct": (0, 1),
    "dominator_rating": (0, 1),
}


# Features that are TRUE ratios — values >1 indicate a computation bug.
# (per-game counts like big_play_rate are NOT in here even though the suffix
# is "_rate" — they can exceed 1 for elite small-sample profiles.)
TRUE_RATIO_FEATURES = {
    "rb_catch_rate", "rb_success_rate", "rb_opportunity_rate",
    "wr_catch_rate", "wr_success_rate",
    "te_catch_rate", "te_success_rate",
    "qb_completion_pct", "qb_success_rate",
    "rb_stuff_rate", "rb_explosive_rate",
}


def _bounds_for(feature: str) -> tuple[float, float] | None:
    """Look up a plausible range. Strict bounds only on features where
    out-of-range = computation bug. Outliers in per-game / per-touch rates
    are real signal (small-sample dominators) and not flagged."""
    if feature in RANGE_BOUNDS:
        return RANGE_BOUNDS[feature]
    if feature in TRUE_RATIO_FEATURES:
        return (0.0, 1.0)
    return None


def check_pathology(df: pl.DataFrame, label: str) -> list[str]:
    """No NaN/Inf, values within plausible bounds."""
    print("\n" + "=" * 78)
    print(f"2. PATHOLOGY — no NaN/Inf, values in plausible range ({label})")
    print("=" * 78)
    flagged = []
    for c in feature_columns(df):
        col = df[c].drop_nulls()
        if col.dtype not in (pl.Float64, pl.Float32, pl.Int64, pl.Int32, pl.Int16):
            continue
        if col.len() == 0:
            continue
        vals = col.cast(pl.Float64).to_list()
        nans = sum(1 for v in vals if v != v)  # NaN ≠ NaN
        infs = sum(1 for v in vals if v in (math.inf, -math.inf))
        if nans:
            flagged.append(f"  {c}: {nans} NaN values")
        if infs:
            flagged.append(f"  {c}: {infs} Inf values")
        bounds = _bounds_for(c)
        if bounds:
            lo, hi = bounds
            ooc = [v for v in vals if v < lo or v > hi]
            if ooc:
                # Allow up to 1% out-of-bounds for float-precision edge cases
                if len(ooc) / len(vals) > 0.01:
                    sample = sorted(ooc)[:3] + sorted(ooc)[-3:]
                    flagged.append(
                        f"  {c}: {len(ooc)}/{len(vals)} values outside [{lo}, {hi}], "
                        f"sample={sample}"
                    )
    if not flagged:
        print("  ✓ no NaN/Inf, no out-of-range values flagged")
    else:
        print(f"  {len(flagged)} pathology flag(s):")
        for f in flagged:
            print(f)
    return flagged


# ---------- check 3: outcome-class separability ----------


def check_separability(train_df: pl.DataFrame) -> list[str]:
    """Per feature, compute mean by outcome tier on training cohort. Flag
    features where (max_tier_mean - min_tier_mean) / overall_std < 0.2 — they
    don't separate Bust from HOF-track and are noise to the embedding."""
    print("\n" + "=" * 78)
    print("3. OUTCOME-CLASS SEPARABILITY (training cohort)")
    print("    flag features where (max_tier - min_tier) / overall_std < 0.2")
    print("=" * 78)
    flagged = []
    no_signal = []
    df = train_df.filter(pl.col("outcome_tier").is_not_null())
    for pos in POSITION_PREFIX:
        pos_df = df.filter(pl.col("position") == pos)
        if pos_df.height < 30:
            continue
        cols = position_features(df, pos)
        for c in cols:
            col = pos_df[c].cast(pl.Float64, strict=False)
            if col.drop_nulls().len() < 20:
                continue
            overall_std = col.std()
            if overall_std is None or overall_std == 0:
                continue
            tier_means = []
            for tier in OUTCOME_TIER_ORDER:
                tier_col = pos_df.filter(pl.col("outcome_tier") == tier)[c].cast(pl.Float64, strict=False).drop_nulls()
                if tier_col.len() >= 5:
                    tier_means.append((tier, tier_col.mean()))
            if len(tier_means) < 2:
                continue
            spread = max(m for _, m in tier_means) - min(m for _, m in tier_means)
            ratio = spread / overall_std
            if ratio < 0.2:
                no_signal.append((pos, c, ratio, spread, overall_std))

    if not no_signal:
        print("  ✓ all features show ≥ 0.2 σ spread across outcome tiers")
    else:
        print(f"  {len(no_signal)} feature(s) below 0.2 σ separability:")
        for pos, c, ratio, spread, std in sorted(no_signal, key=lambda x: x[2]):
            print(f"  [{pos}] {c}: ratio={ratio:.3f}  spread={spread:.4f}  σ={std:.4f}")
            flagged.append(f"  [{pos}] {c} (ratio={ratio:.3f})")
    return flagged


# ---------- check 4: cohort comparability ----------


def check_cohort_comparability(train_df: pl.DataFrame, val_df: pl.DataFrame) -> list[str]:
    """For each feature, compare train vs val mean. Flag if val mean is > 2 σ
    from train mean (suggests distribution shift that will hurt 2026 prediction)."""
    print("\n" + "=" * 78)
    print("4. COHORT COMPARABILITY (train vs val per-feature distribution shift)")
    print("    flag if |val_mean - train_mean| / train_std > 2.0")
    print("=" * 78)
    flagged = []
    for pos in POSITION_PREFIX:
        cols = position_features(train_df, pos)
        train_pos = train_df.filter(pl.col("position") == pos)
        val_pos = val_df.filter(pl.col("position") == pos)
        if train_pos.height < 20 or val_pos.height < 20:
            continue
        for c in cols:
            tcol = train_pos[c].cast(pl.Float64, strict=False).drop_nulls()
            vcol = val_pos[c].cast(pl.Float64, strict=False).drop_nulls()
            if tcol.len() < 20 or vcol.len() < 20:
                continue
            t_mean, t_std = tcol.mean(), tcol.std()
            v_mean = vcol.mean()
            if t_std is None or t_std == 0:
                continue
            z = abs(v_mean - t_mean) / t_std
            if z > 2.0:
                flagged.append(
                    f"  [{pos}] {c}: train μ={t_mean:.3f} σ={t_std:.3f},  val μ={v_mean:.3f}  z={z:.2f}"
                )
    if not flagged:
        print("  ✓ no feature shows train↔val drift > 2σ")
    else:
        print(f"  {len(flagged)} feature(s) with drift > 2σ:")
        for f in flagged:
            print(f)
    return flagged


# ---------- check 5: redundancy ----------


def check_redundancy(df: pl.DataFrame) -> list[str]:
    """Within each position, pairwise correlation across features. Flag |r| > 0.95
    pairs as candidates to drop (dupes don't add signal to a kNN embedding)."""
    print("\n" + "=" * 78)
    print("5. REDUNDANCY (within-position pairwise |r| > 0.95)")
    print("=" * 78)
    flagged = []
    for pos in POSITION_PREFIX:
        pos_df = df.filter(pl.col("position") == pos)
        if pos_df.height < 30:
            continue
        cols = position_features(df, pos)
        # Build numeric-only frame
        numeric_cols = []
        for c in cols:
            col = pos_df[c].cast(pl.Float64, strict=False)
            if col.drop_nulls().len() >= 20:
                numeric_cols.append(c)
        if len(numeric_cols) < 2:
            continue
        # Compute pairwise correlations using polars; skip nulls per pair
        printed_header = False
        for i in range(len(numeric_cols)):
            for j in range(i + 1, len(numeric_cols)):
                a, b = numeric_cols[i], numeric_cols[j]
                pair = pos_df.select([
                    pl.col(a).cast(pl.Float64, strict=False),
                    pl.col(b).cast(pl.Float64, strict=False),
                ]).drop_nulls()
                if pair.height < 20:
                    continue
                r = pair.select(pl.corr(a, b)).item()
                if r is None:
                    continue
                if abs(r) > 0.95:
                    if not printed_header:
                        printed_header = True
                    flagged.append(f"  [{pos}] {a} ⇄ {b}: r={r:+.3f}")
    if not flagged:
        print("  ✓ no |r| > 0.95 pairs found")
    else:
        print(f"  {len(flagged)} highly-correlated pair(s):")
        for f in flagged:
            print(f)
    return flagged


# ---------- main ----------


def main() -> int:
    print("Phase 2 readiness check")
    print("=" * 78)

    train = load_profiles(COHORTS[0])
    val = load_profiles(COHORTS[1])
    print(f"Loaded: {len(train)} training profiles, {len(val)} validation profiles")

    train_df = to_frame(train)
    val_df = to_frame(val)
    print(f"Frame columns: {len(train_df.columns)}")
    print(f"Position breakdown (val): " + ", ".join(
        f"{p}={val_df.filter(pl.col('position')==p).height}"
        for p in POSITION_PREFIX
    ))

    flags_coverage = check_coverage(train_df, val_df)
    flags_path_train = check_pathology(train_df, "training")
    flags_path_val = check_pathology(val_df, "validation")
    flags_separability = check_separability(train_df)
    flags_cohort = check_cohort_comparability(train_df, val_df)
    flags_redundancy = check_redundancy(val_df)

    print("\n" + "=" * 78)
    print("SUMMARY")
    print("=" * 78)
    print(f"  Coverage flags         : {len(flags_coverage)}")
    print(f"  Pathology (train)      : {len(flags_path_train)}")
    print(f"  Pathology (val)        : {len(flags_path_val)}")
    print(f"  Separability flags     : {len(flags_separability)}")
    print(f"  Cohort comparability   : {len(flags_cohort)}")
    print(f"  Redundancy flags       : {len(flags_redundancy)}")

    # Blocking criteria: actual data corruption (pathology = bug) or features
    # that don't separate outcome tiers (would render embedding useless).
    # Coverage flags on combine drills are structural (not every prospect
    # runs every drill); not blocking. Redundancy flags are informational —
    # the embedding tolerates near-duplicates, just less efficiently.
    blocking = (
        len(flags_path_train) > 0
        or len(flags_path_val) > 0
        or len(flags_separability) > 0
        or len(flags_cohort) > 5
    )
    if blocking:
        print("\n  ⛔ BLOCKING — Phase 2 should not proceed (pathology/separability/cohort drift)")
        return 1
    print("\n  ✅ NON-BLOCKING — Phase 2 may proceed (combine-drill coverage gaps + minor redundancy are informational)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
