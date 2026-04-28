"""Feature runner: load profiles → compute features → write back.

Loads PlayerProfile JSONLs from curated, builds a shared CohortContext across
all profiles in the run (so percentile features are computed against a stable,
populous reference), runs the cohort-attribution parse pass exactly once
across all positions, computes features per profile, and writes the updated
profiles back to JSONL.

Pre-refactor (2026-04-28): each position module re-parsed the entire CFBD
plays corpus separately (~1.1 min each). Now `engine.parse.attribute` does
one pass and emits an all-roles-attributed frame; position modules just
filter and aggregate.
"""

from __future__ import annotations

import polars as pl

from engine.io import s3 as s3io
from engine.features import qb as qb_features
from engine.features import rb as rb_features
from engine.features import universal
from engine.features import wr as wr_features
from engine.features import te as te_features
from engine.parse import attribute
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


def _canon_ids_for_position(
    profiles: list[PlayerProfile],
    pfr_to_canon_id: dict[str, int],
    position: Position,
) -> set[int]:
    return {
        canon for p in profiles
        if p.position == position
        and (canon := pfr_to_canon_id.get(p.player_id)) is not None
    }


def run(
    cohort_names: list[str],
    *,
    raw_bucket: str,
    curated_bucket: str,
    include_qb: bool = True,
) -> dict:
    # Pool all cohorts so reference distributions are populous.
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

    # Single all-positions parse + resolve pass (was ~1.1 min per position before).
    print("  building cohort id set (ESPN + CFBD legacy via name+college match)...")
    cohort_ids, cfbd_to_pfr = attribute.build_cohort_id_set(pooled, raw_bucket)
    print(f"    cohort id union: {len(cohort_ids)} ids across {len(set(cfbd_to_pfr.values()))} players")
    print("  parsing CFBD plays once and attributing to cohort players...")
    cohort_attr = attribute.build_attributed_plays(
        raw_bucket, cohort_ids=cohort_ids, cfbd_to_pfr=cfbd_to_pfr
    )
    pfr_to_canon_id = cohort_attr.pfr_to_canon_id
    print(f"    attributed plays: {cohort_attr.plays.height:,}")

    # Position-specific filtered contexts.
    qb_ctx = None
    rb_ctx = None
    wr_ctx = None
    if include_qb and any(p.position == Position.QB for p in pooled):
        qb_canon = _canon_ids_for_position(pooled, pfr_to_canon_id, Position.QB)
        qb_ctx = qb_features.build_qb_context(
            cohort_attr.plays, qb_canon,
            defense_pass_epa=cohort_attr.defense_pass_epa,
        )
        if qb_ctx.seasons.height > 0:
            print(f"    qb attributed plays: {qb_ctx.plays.height:,}")
            print(f"    qb (qb_id, season) pairs: {qb_ctx.seasons.height}")

    if any(p.position == Position.RB for p in pooled):
        rb_canon = _canon_ids_for_position(pooled, pfr_to_canon_id, Position.RB)
        rb_ctx = rb_features.build_rb_context(cohort_attr.plays, rb_canon)
        if rb_ctx.seasons.height > 0:
            print(f"    rb attributed plays: {rb_ctx.plays.height:,}")
            print(f"    rb (rb_id, season) pairs: {rb_ctx.seasons.height}")

    if any(p.position == Position.WR for p in pooled):
        wr_canon = _canon_ids_for_position(pooled, pfr_to_canon_id, Position.WR)
        wr_ctx = wr_features.build_wr_context(cohort_attr.plays, wr_canon)
        if wr_ctx.seasons.height > 0:
            print(f"    wr attributed plays: {wr_ctx.plays.height:,}")
            print(f"    wr (wr_id, season) pairs: {wr_ctx.seasons.height}")

    te_ctx = None
    if any(p.position == Position.TE for p in pooled):
        te_canon = _canon_ids_for_position(pooled, pfr_to_canon_id, Position.TE)
        te_ctx = te_features.build_te_context(cohort_attr.plays, te_canon)
        if te_ctx.seasons.height > 0:
            print(f"    te attributed plays: {te_ctx.plays.height:,}")
            print(f"    te (te_id, season) pairs: {te_ctx.seasons.height}")

    summary = {}
    for name, profiles in all_profiles.items():
        print(f"\n  computing features for {name} ({len(profiles)} profiles)...")
        feature_counts: dict[str, int] = {}
        for prof in profiles:
            feats = universal.compute(prof, ctx)
            if qb_ctx is not None and prof.position == Position.QB:
                feats.update(qb_features.compute(prof, qb_ctx, pfr_to_canon_id=pfr_to_canon_id))
            if rb_ctx is not None and prof.position == Position.RB:
                feats.update(rb_features.compute(
                    prof, rb_ctx, pfr_to_canon_id=pfr_to_canon_id, pss_wide=ctx.pss_wide
                ))
            if wr_ctx is not None and prof.position == Position.WR:
                feats.update(wr_features.compute(
                    prof, wr_ctx,
                    pfr_to_canon_id=pfr_to_canon_id,
                    pss_wide=ctx.pss_wide,
                    team_pass_dist=cohort_attr.team_pass_dist,
                ))
            if te_ctx is not None and prof.position == Position.TE:
                feats.update(te_features.compute(
                    prof, te_ctx,
                    pfr_to_canon_id=pfr_to_canon_id,
                    pss_wide=ctx.pss_wide,
                    team_pass_dist=cohort_attr.team_pass_dist,
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
