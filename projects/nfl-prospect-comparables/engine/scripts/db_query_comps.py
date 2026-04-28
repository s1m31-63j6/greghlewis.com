"""Find comps via pgvector kNN. Mirrors scripts/find_comps.py interface.

Run from engine/:
    uv run python scripts/db_query_comps.py --player "Patrick Mahomes"
    uv run python scripts/db_query_comps.py --player "Cooper Kupp" --arm text
    uv run python scripts/db_query_comps.py --player "Fernando Mendoza" --top-k 8
"""

from __future__ import annotations

import argparse
import sys

from dotenv import load_dotenv

from engine.db import query as db_query

load_dotenv()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--player", required=True)
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument(
        "--arm",
        choices=["hybrid", "feature", "text"],
        default="hybrid",
    )
    args = ap.parse_args()

    res = db_query.find_comps(args.player, top_k=args.top_k, arm=args.arm)
    if not res:
        print(f"player {args.player!r} not found.")
        return 1

    print(f"\nTop {args.top_k} {args.arm} comps for {args.player}:")
    for c in res:
        outcome = f" / {c.outcome_class}" if c.outcome_class else ""
        cohort_short = c.cohort.split("_")[0]
        print(f"  {c.similarity:+.3f}  {c.name:24s} ({c.position} / {cohort_short}{outcome})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
