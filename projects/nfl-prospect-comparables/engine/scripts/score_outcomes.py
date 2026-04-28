"""Score outcomes for the training (2014-2020) and validation (2021-2025) cohorts.

Run from engine/:
    uv run python scripts/score_outcomes.py
"""

from __future__ import annotations

import sys

import polars as pl
from dotenv import load_dotenv

from engine.outcomes import score

load_dotenv()


def _summarize(df: pl.DataFrame, label: str) -> None:
    print(f"\n=== {label} ({df.height} players) ===")
    dist = (
        df.group_by(["category", "outcome_class"])
        .len()
        .pivot(values="len", index="category", on="outcome_class")
        .fill_null(0)
    )
    # Reorder columns: position first, then outcome tiers in order
    tier_order = ["Bust", "Role Player", "Starter", "Pro Bowl", "HOF-track"]
    cols = ["category"] + [c for c in tier_order if c in dist.columns]
    dist = dist.select(cols).sort("category")
    print(dist)


def main() -> int:
    print("Scoring training cohort (2014-2020, settled through 2025)...")
    train = score.label_cohort(first_year=2014, last_year=2020, settled_through=2025)
    train_uri = score.write_to_curated(train, name="training_2014_2020")
    print(f"  wrote {train.height:,} players → {train_uri}")
    _summarize(train, "TRAINING")

    print("\nScoring validation cohort (2021-2025, settled through 2025)...")
    val = score.label_cohort(first_year=2021, last_year=2025, settled_through=2025)
    val_uri = score.write_to_curated(val, name="validation_2021_2025")
    print(f"  wrote {val.height:,} players → {val_uri}")
    _summarize(val, "VALIDATION (partial outcomes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
