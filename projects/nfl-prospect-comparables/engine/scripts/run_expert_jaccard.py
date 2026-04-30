"""Phase 3.3 — engine vs expert comp agreement (Jaccard / hit-rate).

For each cohort prospect with expert-named comps, run engine top-K and
report overlap / hit-rate against the analyst-named comps.

Run from engine/:
    uv run python scripts/run_expert_jaccard.py
    uv run python scripts/run_expert_jaccard.py --arm hybrid_clean --top-k 10
    uv run python scripts/run_expert_jaccard.py --by-source
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict

from dotenv import load_dotenv

from engine.eval import expert_jaccard

load_dotenv()


def _agg_metrics(rows):
    n = len(rows)
    if n == 0:
        return {"n": 0, "hit_any": 0.0, "mean_overlap": 0.0, "mean_jaccard": 0.0,
                "mean_expert_size": 0.0}
    hit_any = sum(r.hit_any for r in rows) / n
    mean_overlap = sum(r.overlap for r in rows) / n
    mean_jaccard = sum(r.jaccard for r in rows) / n
    mean_expert = sum(len(r.expert_in_pool) for r in rows) / n
    return {
        "n": n,
        "hit_any": hit_any,
        "mean_overlap": mean_overlap,
        "mean_jaccard": mean_jaccard,
        "mean_expert_size": mean_expert,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", default="hybrid", help="engine arm to query (default: hybrid)")
    ap.add_argument("--top-k", type=int, default=5, help="engine kNN top-K (default: 5)")
    ap.add_argument("--source", action="append", help="restrict expert sources (repeatable: brugler / walter_football)")
    ap.add_argument("--by-source", action="store_true", help="report metrics per expert source separately")
    ap.add_argument("--examples", type=int, default=10, help="show N example rows in the report")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    sources = tuple(args.source) if args.source else ("brugler", "walter_football")

    print("=" * 78)
    print(f"Phase 3.3 — engine vs expert agreement  (arm={args.arm}, top_k={args.top_k})")
    print(f"  expert sources: {sources}")
    print("=" * 78)

    rows = expert_jaccard.run_jaccard_eval(
        cur, arm=args.arm, top_k=args.top_k, sources=sources,
    )
    print(f"\n{len(rows)} cohort players evaluated (have ≥1 expert comp resolvable to engine pool)")

    # Overall metrics
    m = _agg_metrics(rows)
    print(
        f"\n--- Overall ---\n"
        f"  n:                          {m['n']}\n"
        f"  hit-rate (any expert in top-{args.top_k}):  {100 * m['hit_any']:.1f}%\n"
        f"  mean overlap:               {m['mean_overlap']:.2f}\n"
        f"  mean Jaccard:               {m['mean_jaccard']:.3f}\n"
        f"  mean expert-set size:       {m['mean_expert_size']:.1f}"
    )

    # By position
    by_pos: dict[str, list] = defaultdict(list)
    for r in rows:
        by_pos[r.position].append(r)
    print("\n--- By position ---")
    for pos in sorted(by_pos):
        m = _agg_metrics(by_pos[pos])
        print(
            f"  {pos}: n={m['n']:3d}  hit-any={100*m['hit_any']:5.1f}%  "
            f"overlap={m['mean_overlap']:.2f}  Jaccard={m['mean_jaccard']:.3f}"
        )

    # By cohort
    by_cohort: dict[str, list] = defaultdict(list)
    for r in rows:
        by_cohort[r.cohort].append(r)
    print("\n--- By cohort ---")
    for c in sorted(by_cohort):
        m = _agg_metrics(by_cohort[c])
        print(
            f"  {c}: n={m['n']:3d}  hit-any={100*m['hit_any']:5.1f}%  "
            f"overlap={m['mean_overlap']:.2f}  Jaccard={m['mean_jaccard']:.3f}"
        )

    # By source — re-run filtered to each source
    if args.by_source:
        print("\n--- By expert source (separate runs) ---")
        for src in sources:
            sub = expert_jaccard.run_jaccard_eval(
                cur, arm=args.arm, top_k=args.top_k, sources=(src,),
            )
            m = _agg_metrics(sub)
            print(
                f"  {src}: n={m['n']:3d}  hit-any={100*m['hit_any']:5.1f}%  "
                f"overlap={m['mean_overlap']:.2f}  Jaccard={m['mean_jaccard']:.3f}  "
                f"(mean expert-set size: {m['mean_expert_size']:.1f})"
            )

    # Examples
    print(f"\n--- {args.examples} example rows (highest-overlap first) ---")
    sorted_rows = sorted(rows, key=lambda r: (-r.overlap, -r.jaccard, r.name))
    for r in sorted_rows[:args.examples]:
        print(
            f"  {r.name} ({r.position}, {r.cohort.split('_')[0]}) — "
            f"overlap={r.overlap}  Jaccard={r.jaccard:.2f}"
        )
        print(f"    expert comps: {r.expert_comps}")
        print(f"    engine top-{args.top_k}: {r.engine_top_k_names}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
