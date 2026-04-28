"""Compute structured feature vectors for each cohort, write to curated bucket.

By default pools training + validation for normalization stats so the
prediction cohort uses the same baseline. With --use-persisted-stats, loads
the previously-persisted feature_stats.json and only vectorizes the named
cohort(s) — used for the prediction cohort once stats are locked in.

Outputs:
  s3://<curated>/embeddings/feature_stats.json   (one file, keyed by position)
  s3://<curated>/embeddings/feature_vectors/cohort=<name>/data.parquet

Run from engine/:
    uv run python scripts/run_feature_vectors.py
    uv run python scripts/run_feature_vectors.py --cohort prediction_2026 --use-persisted-stats
"""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

from engine.embedding import feature_vector as fv
from engine.features import runner

load_dotenv()


DEFAULT_COHORTS = ["training_2014_2020", "validation_2021_2025"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", help="cohort name (repeatable)")
    ap.add_argument(
        "--use-persisted-stats",
        action="store_true",
        help="load feature_stats.json from S3 instead of recomputing from cohort pool",
    )
    args = ap.parse_args()
    cohorts = args.cohort if args.cohort else DEFAULT_COHORTS

    cur = os.environ["S3_CURATED_BUCKET"]

    if args.use_persisted_stats:
        stats = fv.load_stats(cur)
        print(f"Loaded persisted stats for positions: {list(stats)}")
    else:
        by_cohort = {name: runner.load_cohort(cur, name) for name in cohorts}
        pooled = [p for ps in by_cohort.values() for p in ps]
        print(
            f"Pooled stats from {len(pooled)} profiles "
            f"({', '.join(f'{n}={len(p)}' for n, p in by_cohort.items())})"
        )
        stats = fv.build_all_stats(pooled)
        for pos, s in stats.items():
            n_real = sum(1 for n in s.feature_order if s.stds[n] != 1.0 or s.means[n] != 0.0)
            print(f"  {pos}: {len(s.feature_order)} features ({n_real} with observed values)")
        stats_uri = fv.persist_stats(stats, cur)
        print(f"  → {stats_uri}")

    for cohort_name in cohorts:
        profiles = runner.load_cohort(cur, cohort_name)
        df = fv.vectorize_cohort(profiles, stats)
        uri = fv.persist_cohort_vectors(df, cur, cohort_name)
        print(f"\n=== {cohort_name} ===")
        for pos in stats:
            sub = df.filter(df["position"] == pos)
            if sub.height == 0:
                continue
            sample_vec = sub["vector"][0]
            print(f"  {pos}: {sub.height} vectors, dim={len(sample_vec)}")
        print(f"  → {uri}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
