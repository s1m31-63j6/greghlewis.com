"""One-off augmentation: load the existing comp_graph.json bundle and
overlay athletic + extended bio fields from the profile JSONLs in S3.

Why a one-off rather than a full regen via build_ui_data.py:
    The full pipeline re-runs UMAP coord computation, top-K edge selection,
    and the per-position pool joins. None of those depend on combine data,
    so re-deriving them adds ~2 minutes of work and risks subtle layout
    drift (UMAP is stochastic up to random_state). This script only mutates
    the bio + athletic blocks and leaves coords / edges / traits untouched.

Run from the engine dir, with the same AWS profile as build_ui_data.py:
    AWS_PROFILE=portfolio uv run python scripts/augment_bundle_with_combine.py
"""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path

import boto3

ALL_COHORTS = ("training_2014_2020", "validation_2021_2025", "prediction_2026")
DEFAULT_BUNDLE = Path(__file__).resolve().parents[4] / "public" / "projects" / "nfl-prospect-comparables" / "comp_graph.json"


def load_profiles(curated_bucket: str) -> dict[str, dict]:
    """player_id → full profile dict, across all cohorts."""
    s3 = boto3.client("s3")
    out: dict[str, dict] = {}
    for cohort in ALL_COHORTS:
        try:
            body = s3.get_object(
                Bucket=curated_bucket, Key=f"profiles/{cohort}/data.jsonl"
            )["Body"].read().decode("utf-8")
        except s3.exceptions.NoSuchKey:
            continue
        for line in body.strip().splitlines():
            p = json.loads(line)
            out[p["player_id"]] = p
        print(f"  {cohort}: {len(out)} profiles loaded so far")
    return out


def merge_node(node: dict, profile: dict) -> dict:
    """Update node's bio + athletic blocks from profile. Leaves all other
    fields (coords, traits, draft, headshot_candidates, …) untouched."""
    bio = profile.get("bio") or {}
    draft = profile.get("draft") or {}
    athletic = profile.get("athletic") or {}
    node["bio"] = {
        "college": bio.get("college"),
        "height_in": bio.get("height_inches"),
        "weight_lb": bio.get("weight_lbs"),
        "age_at_draft": draft.get("age_at_draft"),
        "hand_size_in": bio.get("hand_size_inches"),
        "arm_length_in": bio.get("arm_length_inches"),
        "hometown_state": bio.get("hometown_state"),
    }
    node["athletic"] = {
        "forty_yard": athletic.get("forty_yard"),
        "vertical_in": athletic.get("vertical_inches"),
        "broad_jump_in": athletic.get("broad_jump_inches"),
        "three_cone": athletic.get("three_cone"),
        "shuttle": athletic.get("shuttle"),
        "bench_reps": athletic.get("bench_press_reps"),
    }
    return node


def main() -> int:
    cur = os.environ.get("S3_CURATED_BUCKET")
    if not cur:
        print("S3_CURATED_BUCKET env var required", file=sys.stderr)
        return 2
    bundle_path = Path(os.environ.get("BUNDLE_PATH") or DEFAULT_BUNDLE)
    print(f"Loading bundle from {bundle_path}")
    bundle = json.loads(bundle_path.read_text())
    print(f"  {len(bundle['nodes'])} nodes")

    print(f"Loading profile JSONLs from s3://{cur}/profiles/...")
    profiles = load_profiles(cur)
    print(f"  {len(profiles)} total profiles")

    matched = 0
    missing: list[str] = []
    for node in bundle["nodes"]:
        p = profiles.get(node["id"])
        if not p:
            missing.append(node["id"])
            continue
        merge_node(node, p)
        matched += 1

    print(f"Merged athletic+bio into {matched}/{len(bundle['nodes'])} nodes")
    if missing:
        print(f"  {len(missing)} nodes had no matching profile (first 5: {missing[:5]})")

    bundle_path.write_text(json.dumps(bundle, separators=(",", ":")))
    print(f"Wrote {bundle_path} ({bundle_path.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
