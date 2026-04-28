"""Assemble PlayerProfile records for each cohort and write JSONL to curated.

Run from engine/:
    uv run python scripts/assemble_profiles.py
    uv run python scripts/assemble_profiles.py --cohort training
    uv run python scripts/assemble_profiles.py --cohort prediction --draft-year 2026
"""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

from engine.profiles import assemble

load_dotenv()


COHORTS = {
    "training": {
        "name": "training_2014_2020",
        "kind": "labeled",
    },
    "validation": {
        "name": "validation_2021_2025",
        "kind": "labeled",
    },
    "prediction": {
        "name": "prediction_2026",
        "kind": "prediction",
        "draft_year": 2026,
    },
}


def _print_coverage(label: str, coverage: dict) -> None:
    print(f"\n=== {label} — {int(coverage['total']):,} profiles "
          f"(skipped {int(coverage['skipped_no_id'])} without canonical id) ===")
    for k in (
        "pct_with_combine",
        "pct_with_birthdate",
        "pct_with_college_stats",
        "pct_with_hometown",
        "pct_with_height",
    ):
        print(f"  {k:30s} {coverage[k]:>5.1f}%")


def run_one(cohort_key: str, *, draft_year: int | None) -> None:
    cfg = COHORTS[cohort_key]
    raw_bucket = os.environ["S3_RAW_BUCKET"]
    curated_bucket = os.environ["S3_CURATED_BUCKET"]

    if cfg["kind"] == "labeled":
        spine = assemble.load_labeled_spine(curated_bucket, cfg["name"])
        has_outcome = True
    else:
        year = draft_year or cfg.get("draft_year")
        spine = assemble.load_prediction_spine(raw_bucket, year)
        if spine.height == 0:
            print(f"  · {cfg['name']}: spine empty (no {year} draft picks ingested yet) — skipping")
            return
        has_outcome = False

    print(f"Assembling {cfg['name']}: {spine.height:,} spine rows...")
    profiles, coverage = assemble.assemble_cohort(
        spine, raw_bucket=raw_bucket, has_outcome=has_outcome
    )
    uri = assemble.write_jsonl(profiles, name=cfg["name"])
    print(f"  wrote {len(profiles):,} profiles → {uri}")
    _print_coverage(cfg["name"], coverage)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--cohort",
        choices=list(COHORTS) + ["all"],
        default="all",
    )
    ap.add_argument("--draft-year", type=int, default=None)
    args = ap.parse_args()

    targets = list(COHORTS) if args.cohort == "all" else [args.cohort]
    for ck in targets:
        run_one(ck, draft_year=args.draft_year)
    return 0


if __name__ == "__main__":
    sys.exit(main())
