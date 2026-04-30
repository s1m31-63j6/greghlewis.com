"""Find top-K NFL prospect comps via the hybrid embedding.

In-memory kNN over the hybrid vectors persisted in Phase 2.5. Phase 2.6
will move this onto pgvector for production latency, but for the ~1K-vector
cohort the NumPy version is fast.

By default the comp output also shows the cluster's NFL outcome distribution
— per the v2 architecture, the comp set's range of NFL careers IS the
implicit forecast (Silver/PECOTA + PlayerProfiler framing). Disable with
--no-outcomes if you only want the comp list.

Run from engine/:
    uv run python scripts/find_comps.py --player "Patrick Mahomes"
    uv run python scripts/find_comps.py --player "Cooper Kupp" --arm text
    uv run python scripts/find_comps.py --player "Saquon Barkley" --top-k 15
    uv run python scripts/find_comps.py --player "Brock Bowers" --arm feature_v2_traits
"""

from __future__ import annotations

import argparse
import io
import os
import sys
from collections import Counter

import boto3
import polars as pl
from dotenv import load_dotenv

from engine.embedding import comps as comps_mod
from engine.eval.ablation import OUTCOME_TIERS

load_dotenv()


def _load_outcomes_lookup(curated_bucket: str, cohorts: tuple[str, ...]) -> dict[tuple[str, str], dict]:
    """Map (cohort, pfr_player_id) -> outcome row dict. Only loads what's
    available — prediction cohorts have no outcomes yet."""
    s3 = boto3.client("s3")
    out: dict[tuple[str, str], dict] = {}
    for c in cohorts:
        try:
            body = s3.get_object(
                Bucket=curated_bucket, Key=f"outcomes/{c}/data.parquet"
            )["Body"].read()
        except Exception:
            continue
        df = pl.read_parquet(io.BytesIO(body))
        for row in df.iter_rows(named=True):
            pid = row.get("pfr_player_id")
            if pid:
                out[(c, pid)] = row
    return out


def _print_outcome_distribution(comps, outcomes_by_key) -> None:
    counts: Counter = Counter()
    av_vals: list[float] = []
    for c in comps:
        row = outcomes_by_key.get((c.cohort, c.player_id))
        if row and row.get("outcome_class"):
            counts[row["outcome_class"]] += 1
            if row.get("career_av") is not None:
                av_vals.append(float(row["career_av"]))
    if not counts and not av_vals:
        return
    parts = [f"{tier}={counts.get(tier, 0)}" for tier in OUTCOME_TIERS if counts.get(tier)]
    line = "  Outcome distribution:  " + ", ".join(parts) if parts else ""
    if av_vals:
        av_sorted = sorted(av_vals)
        line += (
            f"  |  career AV: median={av_sorted[len(av_sorted)//2]:.0f}, "
            f"max={max(av_sorted):.0f}"
        )
    print(line)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--player", required=True, help="player name (must match cohort exactly)")
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument(
        "--arm",
        choices=[
            "hybrid", "hybrid_clean", "hybrid_legacy",
            "feature", "feature_v2", "feature_v2_traits",
            "measurables", "engineered",
            "text", "text_clean", "text_legacy",
            "text_brugler", "text_walter_football", "text_wikipedia",
            "hybrid_brugler", "hybrid_walter_football", "hybrid_wikipedia",
        ],
        default="hybrid",
        help="which embedding arm to query",
    )
    ap.add_argument(
        "--include-prediction",
        action="store_true",
        help="include prediction_2026 cohort in the pool (default: train + val only)",
    )
    ap.add_argument(
        "--allow-prediction-comps",
        action="store_true",
        help=(
            "Allow 2026-vs-2026 matches when the query is a 2026 prospect "
            "(default: comps come from train+val only — historical players "
            "with settled NFL outcomes)."
        ),
    )
    ap.add_argument(
        "--no-completeness",
        action="store_true",
        help=(
            "Disable completeness-weighted similarity (default: ON when "
            "the arm carries observation masks). Use to reproduce the "
            "pre-2026-04-29 unweighted behavior for ablation."
        ),
    )
    ap.add_argument(
        "--no-outcomes",
        action="store_true",
        help="Hide the NFL outcome class + distribution. Default shows them.",
    )
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    cohorts = ("training_2014_2020", "validation_2021_2025", "prediction_2026")
    print(f"Loading {args.arm} pool from {cur} (cohorts: {', '.join(cohorts)})...")
    pool = comps_mod.load_pool(cur, cohorts=cohorts, arm=args.arm)
    print(f"  {pool.df.height} vectors across {len(pool.by_position)} positions")

    # If the query player is in the prediction cohort, default to comping
    # against historical (train+val) only — 2026 prospects haven't drafted
    # so they shouldn't be valid comps for each other (they share a
    # missing-data signature that inflates within-cohort similarity).
    exclude_cohorts: set[str] = set()
    q_row = pool.df.filter(pl.col("name") == args.player)
    if q_row.height and q_row["cohort"][0] == "prediction_2026" and not args.allow_prediction_comps:
        exclude_cohorts = {"prediction_2026"}
        print(f"  query is 2026 prospect → comping against train+val only "
              f"(--allow-prediction-comps to override)")

    res = comps_mod.find_comps(
        pool,
        args.player,
        top_k=args.top_k,
        exclude_cohorts=exclude_cohorts or None,
        completeness_weighted=False if args.no_completeness else None,
    )
    if not res:
        print(f"\n  player {args.player!r} not found in pool")
        return 1

    outcomes_by_key: dict = {}
    if not args.no_outcomes:
        outcomes_by_key = _load_outcomes_lookup(cur, cohorts)

    print(f"\nTop {args.top_k} {args.arm} comps for {args.player}:")
    for c in res:
        outcome_str = ""
        if not args.no_outcomes:
            row = outcomes_by_key.get((c.cohort, c.player_id))
            if row and row.get("outcome_class"):
                cls = row["outcome_class"]
                av = row.get("career_av")
                pb = row.get("pro_bowls") or 0
                outcome_str = f"  -> {cls:11s}  AV={int(av) if av is not None else '--'}  PB={int(pb)}"
        print(
            f"  {c.similarity:+.3f}  {c.name:26s} ({c.position} / {c.cohort.split('_')[0]}){outcome_str}"
        )
    if not args.no_outcomes:
        _print_outcome_distribution(res, outcomes_by_key)
    return 0


if __name__ == "__main__":
    sys.exit(main())
