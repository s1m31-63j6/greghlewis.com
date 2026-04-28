"""Feature runner: load profiles → compute features → write back.

Loads PlayerProfile JSONLs from curated, builds a shared CohortContext
across all profiles in the run (so percentile features are computed against
a stable, populous reference), computes universal features per profile,
and writes the updated profiles back to JSONL.
"""

from __future__ import annotations

import io
import json
import os

import polars as pl

from engine.io import s3 as s3io
from engine.features import qb as qb_features
from engine.features import rb as rb_features
from engine.features import universal
from engine.schema import PlayerProfile, Position


def load_cohort(curated_bucket: str, name: str) -> list[PlayerProfile]:
    body = s3io._client().get_object(
        Bucket=curated_bucket, Key=f"profiles/{name}/data.jsonl"
    )["Body"].read().decode("utf-8")
    return [PlayerProfile.model_validate_json(line) for line in body.splitlines() if line]


def write_cohort(profiles: list[PlayerProfile], curated_bucket: str, name: str) -> str:
    key = f"profiles/{name}/data.jsonl"
    body = "\n".join(p.model_dump_json() for p in profiles).encode("utf-8")
    s3io._client().put_object(Bucket=curated_bucket, Key=key, Body=body)
    return f"s3://{curated_bucket}/{key}"


def run(
    cohort_names: list[str],
    *,
    raw_bucket: str,
    curated_bucket: str,
    include_qb: bool = True,
) -> dict:
    # Load all cohorts together so the reference distributions are populous.
    all_profiles: dict[str, list[PlayerProfile]] = {}
    for name in cohort_names:
        all_profiles[name] = load_cohort(curated_bucket, name)
    pooled: list[PlayerProfile] = [p for ps in all_profiles.values() for p in ps]
    print(f"  pooled cohort context size: {len(pooled)} profiles")

    print("  building universal cohort context (recruits, pss, sp_ratings, crosswalk)...")
    ctx = universal.build_context(pooled, raw_bucket)
    print(f"    pss_wide rows: {ctx.pss_wide.height:,}")
    print(f"    recruits rows: {ctx.recruits.height:,}")
    print(f"    sp_ratings rows: {ctx.sp_ratings.height:,}")

    qb_ctx = None
    rb_ctx = None
    pfr_to_espn = {}
    # Reuse the universal crosswalk for the pfr_id→espn_id map
    for row in ctx.crosswalk.iter_rows(named=True):
        if row["espn_id"] is not None and row["pfr_id"]:
            pfr_to_espn[row["pfr_id"]] = int(row["espn_id"])

    if include_qb and any(p.position == Position.QB for p in pooled):
        print("  building QB context (parsing CFBD plays)...")
        qb_ctx = qb_features.build_qb_context(pooled, raw_bucket)
        if qb_ctx.seasons.height > 0:
            print(f"    qb attributed plays: {qb_ctx.plays.height:,}")
            print(f"    qb (espn_id, season) pairs: {qb_ctx.seasons.height}")

    if any(p.position == Position.RB for p in pooled):
        print("  building RB context (parsing CFBD plays for rushers + receivers)...")
        rb_ctx = rb_features.build_rb_context(pooled, raw_bucket)
        if rb_ctx.seasons.height > 0:
            print(f"    rb attributed plays: {rb_ctx.plays.height:,}")
            print(f"    rb (rb_id, season) pairs: {rb_ctx.seasons.height}")

    summary = {}
    for name, profiles in all_profiles.items():
        print(f"\n  computing features for {name} ({len(profiles)} profiles)...")
        feature_counts: dict[str, int] = {}
        for prof in profiles:
            feats = universal.compute(prof, ctx)
            if qb_ctx is not None and prof.position == Position.QB:
                feats.update(qb_features.compute(prof, qb_ctx, pfr_to_espn=pfr_to_espn))
            if rb_ctx is not None and prof.position == Position.RB:
                feats.update(rb_features.compute(
                    prof, rb_ctx, pfr_to_espn=pfr_to_espn, pss_wide=ctx.pss_wide
                ))
            prof.features = feats
            for fname in feats:
                feature_counts[fname] = feature_counts.get(fname, 0) + 1
        uri = write_cohort(profiles, curated_bucket, name)
        print(f"    wrote {uri}")
        summary[name] = {
            "n_profiles": len(profiles),
            "feature_coverage": {
                fname: round(100.0 * count / len(profiles), 1)
                for fname, count in sorted(feature_counts.items())
            },
        }
    return summary
