"""Phase 3 — outcome-class ablation eval.

Runs the kNN classifier across all embedding arms and reports
accuracy / ±1 tier / macro F1 / P@K / P@K±1 per arm.

Phase 3 v1.2 (this version) compares the new production text corpus
(Brugler + Walter Football) against the legacy corpus (Brugler + Wikipedia)
to show that removing Wikipedia's retrospective bias improves the text and
hybrid arms. Also breaks the text channel down by source (Brugler-only vs
Walter Football-only) to show where the signal comes from.

Run from engine/:
    uv run python scripts/run_ablation_eval.py
    uv run python scripts/run_ablation_eval.py --k 10 --no-weighted
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass

from dotenv import load_dotenv

from engine.embedding import comps as comps_mod
from engine.eval import ablation

load_dotenv()


# Display order — groups the methodology story:
# (1) structural arms, (2) production text+hybrid, (3) legacy comparison,
# (4) per-source breakdown.
ARMS_ALL = (
    # structural
    "feature",
    "measurables",
    "engineered",
    # v2 layered arms (per-position weighted: TRAITS/VOLUME/BODY for skill,
    # EFFICIENCY/TRAITS/BODY/VOLUME for QB)
    "feature_v2",          # engineered features only, layered
    "feature_v2_traits",   # engineered + Sonnet structured archetype traits
    # production
    "text",            # = text_clean (Brugler + Walter)
    "hybrid",          # = hybrid_clean
    # legacy ablation (the headline beat: removing Wikipedia helped)
    "text_legacy",     # Brugler + Wikipedia
    "hybrid_legacy",
    # per-source breakdown
    "text_brugler",
    "text_walter_football",
    "hybrid_brugler",
    "hybrid_walter_football",
)


# Per-arm population requirements. Other arms (feature, measurables,
# engineered) have no text requirement → run over the full cohort.
ARM_REQUIRES: dict[str, dict[str, bool]] = {
    "text":                      {"brugler_or_walter": True},
    "hybrid":                    {},  # feature half always present
    "text_legacy":               {"brugler_or_wiki": True},
    "hybrid_legacy":             {},
    "text_brugler":              {"brugler": True},
    "hybrid_brugler":            {"brugler": True},
    "text_walter_football":      {"walter": True},
    "hybrid_walter_football":    {"walter": True},
}


@dataclass
class _PopFilter:
    train_ids: set[str] | None
    val_ids: set[str] | None


def _ids_for(curated_bucket: str, cohort: str, **kw) -> set[str]:
    return comps_mod.player_ids_with_sources(curated_bucket, cohort, **kw)


def _native_population(curated_bucket: str, arm: str) -> _PopFilter:
    req = ARM_REQUIRES.get(arm, {})
    if not req:
        return _PopFilter(None, None)

    def _per_cohort(cohort: str) -> set[str]:
        if req.get("brugler_or_walter"):
            return _ids_for(curated_bucket, cohort, require_brugler=True) | _ids_for(curated_bucket, cohort, require_walter_football=True)
        if req.get("brugler_or_wiki"):
            return _ids_for(curated_bucket, cohort, require_brugler=True) | _ids_for(curated_bucket, cohort, require_wikipedia=True)
        return _ids_for(
            curated_bucket, cohort,
            require_brugler=req.get("brugler", False),
            require_walter_football=req.get("walter", False),
            require_wikipedia=req.get("wikipedia", False),
        )

    return _PopFilter(
        _per_cohort("training_2014_2020"),
        _per_cohort("validation_2021_2025"),
    )


def _all_sources_population(curated_bucket: str) -> _PopFilter:
    """Players with Brugler AND Walter Football AND Wikipedia in both pools.
    The strictest apples-to-apples comparison."""
    train = _ids_for(
        curated_bucket, "training_2014_2020",
        require_brugler=True, require_walter_football=True, require_wikipedia=True,
    )
    val = _ids_for(
        curated_bucket, "validation_2021_2025",
        require_brugler=True, require_walter_football=True, require_wikipedia=True,
    )
    return _PopFilter(train, val)


def _print_summary(title: str, results: list[ablation.ArmResult]) -> None:
    print("\n" + "=" * 86)
    print(title)
    print("=" * 86)
    print(
        f"  {'arm':>26}  {'n':>4}  {'exact':>7}  {'±1 tier':>8}  "
        f"{'F1':>6}  {'P@5':>6}  {'P@5±1':>6}"
    )
    for r in results:
        print(
            f"  {r.arm:>26}  {r.n:>4d}  {100 * r.accuracy:>6.1f}%  "
            f"{100 * r.adjacent_accuracy:>7.1f}%  "
            f"{r.macro_f1:>6.3f}  "
            f"{100 * r.precision_at_k:>5.1f}%  "
            f"{100 * r.precision_at_k_adjacent:>5.1f}%"
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=5, help="kNN k")
    ap.add_argument("--no-weighted", action="store_true", help="majority vote (default: similarity-weighted)")
    ap.add_argument("--arm", action="append", help="restrict to specific arm (repeatable)")
    ap.add_argument("--skip-detail", action="store_true", help="skip per-arm confusion matrices, just print summary")
    ap.add_argument("--skip-subset", action="store_true", help="skip the all-sources apples-to-apples subset eval")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    arms = tuple(args.arm) if args.arm else ARMS_ALL

    print("=" * 70)
    print(f"Phase 3 v1.2 — outcome ablation (k={args.k}, weighted={not args.no_weighted})")
    print("=" * 70)

    # Per-position modal baseline
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

    # ----- Native eval: each arm runs over its native population -----
    print("\n\n>>> NATIVE EVAL — each arm over its full source-having population")
    native_results: list[ablation.ArmResult] = []
    for arm in arms:
        pop = _native_population(cur, arm)
        n_train = len(pop.train_ids) if pop.train_ids is not None else "all"
        n_val = len(pop.val_ids) if pop.val_ids is not None else "all"
        print(f"\n--- {arm}  (train pool: {n_train}, val pool: {n_val}) ---")
        r = ablation.evaluate_arm(
            cur, arm=arm, k=args.k, weighted=not args.no_weighted,
            train_player_ids=pop.train_ids, val_player_ids=pop.val_ids,
        )
        native_results.append(r)
        if not args.skip_detail:
            print(ablation.format_result(r))
        else:
            print(
                f"  exact={100 * r.accuracy:.1f}%  ±1={100 * r.adjacent_accuracy:.1f}%  "
                f"F1={r.macro_f1:.3f}  P@{r.k}={100 * r.precision_at_k:.1f}%  "
                f"P@{r.k}±1={100 * r.precision_at_k_adjacent:.1f}%"
            )
    _print_summary("NATIVE-POP SUMMARY (each arm over its source-having population)", native_results)

    # ----- Subset eval: all arms over the all-sources subset -----
    if not args.skip_subset:
        print("\n\n>>> SUBSET EVAL — apples-to-apples: only players with Brugler AND Walter AND Wikipedia")
        subset_pop = _all_sources_population(cur)
        print(f"  train pool: {len(subset_pop.train_ids)}  |  val pool: {len(subset_pop.val_ids)}")
        subset_results: list[ablation.ArmResult] = []
        for arm in arms:
            r = ablation.evaluate_arm(
                cur, arm=arm, k=args.k, weighted=not args.no_weighted,
                train_player_ids=subset_pop.train_ids, val_player_ids=subset_pop.val_ids,
            )
            subset_results.append(r)
            print(
                f"\n  {arm}: exact={100 * r.accuracy:.1f}%  ±1={100 * r.adjacent_accuracy:.1f}%  "
                f"F1={r.macro_f1:.3f}  P@{r.k}={100 * r.precision_at_k:.1f}%  "
                f"P@{r.k}±1={100 * r.precision_at_k_adjacent:.1f}%"
            )
        _print_summary(
            "SUBSET SUMMARY (all-sources apples-to-apples — clean comparison)",
            subset_results,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
