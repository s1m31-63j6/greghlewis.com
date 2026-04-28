"""Phase 3 — outcome-class ablation eval.

Runs the kNN classifier across the three embedding arms (hybrid / feature /
text) and reports accuracy + per-position breakdown + confusion matrix.
Compares against a per-position modal-class baseline.

Run from engine/:
    uv run python scripts/run_ablation_eval.py
    uv run python scripts/run_ablation_eval.py --k 10 --no-weighted
"""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

from engine.eval import ablation

load_dotenv()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=5, help="kNN k")
    ap.add_argument("--no-weighted", action="store_true", help="majority vote (default: similarity-weighted)")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]

    print("=" * 70)
    print(f"Phase 3 — outcome ablation eval (k={args.k}, weighted={not args.no_weighted})")
    print("=" * 70)

    # Per-position modal baseline first
    print("\n--- Baseline (per-position modal class) ---")
    base = ablation.baseline_per_position_modal(cur)
    for pos, info in base.items():
        print(
            f"  {pos}: modal={info['modal']!r} → "
            f"{int(info['accuracy'] * info['n'])}/{int(info['n'])} = "
            f"{100 * info['accuracy']:.1f}%"
        )
    overall_n = sum(int(info["n"]) for info in base.values())
    overall_correct = sum(int(info["accuracy"] * info["n"]) for info in base.values())
    print(f"  overall: {overall_correct}/{overall_n} = {100 * overall_correct / overall_n:.1f}%")

    # Per-arm kNN — 4-arm split per memory's plan + the hybrid composite
    results = []
    for arm in ("hybrid", "feature", "engineered", "measurables", "text"):
        r = ablation.evaluate_arm(
            cur, arm=arm, k=args.k, weighted=not args.no_weighted
        )
        results.append(r)
        print(ablation.format_result(r))

    # Summary table
    print("\n" + "=" * 78)
    print("ABLATION SUMMARY")
    print("=" * 78)
    base_pct = 100 * overall_correct / overall_n
    print(
        f"  {'arm':>12}  {'exact':>7}  {'±1 tier':>8}  "
        f"{'F1':>6}  {'P@5':>6}  {'P@5±1':>6}"
    )
    print(f"  {'baseline':>12}  {base_pct:>6.1f}%  {'':>8}  {'':>6}  {'':>6}  {'':>6}")
    for r in results:
        print(
            f"  {r.arm:>12}  {100 * r.accuracy:>6.1f}%  "
            f"{100 * r.adjacent_accuracy:>7.1f}%  "
            f"{r.macro_f1:>6.3f}  "
            f"{100 * r.precision_at_k:>5.1f}%  "
            f"{100 * r.precision_at_k_adjacent:>5.1f}%"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
