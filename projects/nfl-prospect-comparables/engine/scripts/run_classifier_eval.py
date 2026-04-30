"""Phase 3.2 — fitted-classifier eval.

Complements scripts/run_ablation_eval.py (kNN probe) with sklearn
LogisticRegression + GradientBoostingClassifier per arm, per position.

Question being tested: does the surprising kNN finding (measurables wins
on exact accuracy, hybrid loses) hold under a fitted classifier? If yes,
the embedding's local structure really does favor measurables. If the
fitted classifier flips the ranking, kNN was hiding signal.

Run from engine/:
    uv run python scripts/run_classifier_eval.py
    uv run python scripts/run_classifier_eval.py --arm hybrid --arm measurables
"""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

from engine.eval import ablation, classifier

load_dotenv()


# Trim the arm list for classifier eval — focus on the arms where the
# kNN-vs-fitted comparison is informative. Skip the per-source legacy /
# walter-only arms (small populations, high variance under fits).
ARMS = (
    "feature",
    "measurables",
    "engineered",
    "text",          # = text_clean (Brugler + Walter Football)
    "hybrid",        # = hybrid_clean
    "text_legacy",   # Brugler + Wikipedia
    "hybrid_legacy",
    "text_brugler",
)

MODELS = ("logreg", "logreg_balanced", "gbm")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", action="append", help="restrict to specific arm (repeatable)")
    ap.add_argument("--model", action="append", help="restrict models (repeatable)")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    arms = tuple(args.arm) if args.arm else ARMS
    models = tuple(args.model) if args.model else MODELS

    print("=" * 78)
    print(f"Phase 3.2 — fitted-classifier eval ({len(arms)} arms × {len(models)+1} models)")
    print("=" * 78)

    # Build full results matrix: arm × model → metrics. kNN baseline included
    # for direct comparison.
    rows: list[dict] = []
    for arm in arms:
        # kNN baseline (matches run_ablation_eval default settings)
        r_knn = ablation.evaluate_arm(cur, arm=arm, k=5, weighted=True)
        rows.append({
            "arm": arm, "model": "kNN k=5",
            "n": r_knn.n,
            "exact": r_knn.accuracy,
            "adj": r_knn.adjacent_accuracy,
            "f1": r_knn.macro_f1,
        })

        for model in models:
            r = classifier.evaluate_arm(cur, arm=arm, model=model)
            rows.append({
                "arm": arm, "model": model,
                "n": r.n,
                "exact": r.accuracy,
                "adj": r.adjacent_accuracy,
                "f1": r.macro_f1,
            })
            print(
                f"  {arm:>16}  {model:>6}  n={r.n:>3d}  "
                f"exact={100*r.accuracy:5.1f}%  ±1={100*r.adjacent_accuracy:5.1f}%  "
                f"F1={r.macro_f1:.3f}"
            )

    # Side-by-side summary: rows = arm, cols = model
    print("\n" + "=" * 92)
    print("SUMMARY — exact accuracy / macro F1 per (arm × model)")
    print("=" * 92)
    header = f"  {'arm':>16}" + "".join(f"  {m:>22}" for m in ("kNN k=5",) + tuple(models))
    print(header)
    by_arm: dict[str, dict[str, dict]] = {}
    for r in rows:
        by_arm.setdefault(r["arm"], {})[r["model"]] = r
    for arm in arms:
        cells = []
        for m in ("kNN k=5",) + tuple(models):
            r = by_arm[arm].get(m)
            if r is None:
                cells.append(" " * 22)
            else:
                cells.append(f"  {100*r['exact']:5.1f}% / F1={r['f1']:.3f}".ljust(22))
        print(f"  {arm:>16}" + "  ".join(cells))

    # Best-per-arm summary — which model does each arm prefer?
    print("\n" + "=" * 78)
    print("BEST MODEL PER ARM (by exact accuracy)")
    print("=" * 78)
    for arm in arms:
        best = max(by_arm[arm].values(), key=lambda r: r["exact"])
        print(f"  {arm:>16}  best={best['model']:>8}  exact={100*best['exact']:5.1f}%  F1={best['f1']:.3f}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
