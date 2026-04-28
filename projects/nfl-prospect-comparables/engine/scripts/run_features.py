"""Compute engineered features for each cohort and write profiles back.

Run from engine/:
    uv run python scripts/run_features.py
    uv run python scripts/run_features.py --cohort training_2014_2020
"""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

from engine.features import runner

load_dotenv()


DEFAULT_COHORTS = ["training_2014_2020", "validation_2021_2025"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--cohort",
        action="append",
        help="Cohort name (repeatable). Default: both labeled cohorts.",
    )
    args = ap.parse_args()

    cohorts = args.cohort if args.cohort else DEFAULT_COHORTS
    raw = os.environ["S3_RAW_BUCKET"]
    cur = os.environ["S3_CURATED_BUCKET"]

    print(f"Computing features for: {cohorts}")
    summary = runner.run(cohorts, raw_bucket=raw, curated_bucket=cur)

    for name, info in summary.items():
        print(f"\n=== {name} — {info['n_profiles']:,} profiles ===")
        cov = info["feature_coverage"]
        # group by category for readability
        for fname in sorted(cov.keys()):
            print(f"  {fname:35s} {cov[fname]:>5.1f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
