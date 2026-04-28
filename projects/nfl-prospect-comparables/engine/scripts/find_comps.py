"""Find top-K NFL prospect comps via the hybrid embedding.

In-memory kNN over the hybrid vectors persisted in Phase 2.5. Phase 2.6
will move this onto pgvector for production latency, but for the ~1K-vector
cohort the NumPy version is fast.

Run from engine/:
    uv run python scripts/find_comps.py --player "Patrick Mahomes"
    uv run python scripts/find_comps.py --player "Cooper Kupp" --arm text
    uv run python scripts/find_comps.py --player "Saquon Barkley" --top-k 15
    uv run python scripts/find_comps.py --player "Brock Bowers" --arm feature
"""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

from engine.embedding import comps as comps_mod

load_dotenv()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--player", required=True, help="player name (must match cohort exactly)")
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument(
        "--arm",
        choices=["hybrid", "feature", "text"],
        default="hybrid",
        help="which embedding arm to query (hybrid / feature / text — for ablation)",
    )
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    print(f"Loading {args.arm} pool from {cur}...")
    pool = comps_mod.load_pool(cur, arm=args.arm)
    print(f"  {pool.df.height} vectors across {len(pool.by_position)} positions")

    res = comps_mod.find_comps(pool, args.player, top_k=args.top_k)
    if not res:
        print(f"\n  player {args.player!r} not found in pool")
        return 1

    print(f"\nTop {args.top_k} {args.arm} comps for {args.player}:")
    for c in res:
        print(f"  {c.similarity:+.3f}  {c.name:24s} ({c.position} / {c.cohort.split('_')[0]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
