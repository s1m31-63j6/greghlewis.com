"""Compute structured feature vectors for each cohort, write to curated bucket.

Pools train + val for normalization stats so the 2026 prediction cohort uses
the same baseline. Produces:
  s3://<curated>/embeddings/feature_stats.json   (one file, keyed by position)
  s3://<curated>/embeddings/feature_vectors/cohort=<name>/data.parquet

Run from engine/:
    uv run python scripts/run_feature_vectors.py
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

from engine.embedding import feature_vector as fv
from engine.features import runner

load_dotenv()


DEFAULT_COHORTS = ["training_2014_2020", "validation_2021_2025"]


def main() -> int:
    cur = os.environ["S3_CURATED_BUCKET"]

    by_cohort = {name: runner.load_cohort(cur, name) for name in DEFAULT_COHORTS}
    pooled = [p for ps in by_cohort.values() for p in ps]
    print(f"Pooled stats from {len(pooled)} profiles ({', '.join(f'{n}={len(p)}' for n, p in by_cohort.items())})")

    stats = fv.build_all_stats(pooled)
    for pos, s in stats.items():
        n_real = sum(1 for n in s.feature_order if s.stds[n] != 1.0 or s.means[n] != 0.0)
        print(f"  {pos}: {len(s.feature_order)} features ({n_real} with observed values)")

    stats_uri = fv.persist_stats(stats, cur)
    print(f"  → {stats_uri}")

    for cohort_name, profiles in by_cohort.items():
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
