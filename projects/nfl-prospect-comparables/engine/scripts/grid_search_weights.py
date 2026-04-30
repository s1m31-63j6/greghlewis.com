"""Grid-search V2_LAYER_WEIGHTS via pre-computed per-layer cosines.

Pre-computes per-(val_player, train_player) per-layer cosine matrices once
(masked-cosine matching find_comps semantics), then evaluates each weight
combination as a vectorized weighted sum + kNN classification. Per-position
independent search.

Objective: composite of kNN exact + 0.5*adj_tier accuracy on the validation
cohort. Saves a top-20 sensitivity table per position so we know how
sensitive the score is to the weight choice (a flat top of the surface
means the architecture is robust; a sharp peak means we'd be overfitting).

Run from engine/:
    uv run python scripts/grid_search_weights.py
    uv run python scripts/grid_search_weights.py --increment 0.05
"""

from __future__ import annotations

import argparse
import itertools
import os
import sys
from collections import Counter

import numpy as np
from dotenv import load_dotenv

from engine.embedding import comps as comps_mod
from engine.eval.ablation import OUTCOME_TIERS, _is_adjacent, load_outcomes

load_dotenv()


def precompute_layer_cosines(train_pool, val_pool, position):
    """For each layer, precompute (N_val, N_train) masked-cosine matrix.
    Mirrors the math in `_layered_knn_predict_with_precision`.
    """
    train_idxs = train_pool.pos_index[position]
    val_idxs = val_pool.pos_index[position]
    layers = (val_pool.layer_set_by_position or {}).get(position, ())
    out: dict[str, np.ndarray] = {}
    for layer in layers:
        train_M = (train_pool.layer_matrices or {}).get(layer, {}).get(position)
        train_mask = (train_pool.layer_masks or {}).get(layer, {}).get(position)
        val_M = (val_pool.layer_matrices or {}).get(layer, {}).get(position)
        val_mask = (val_pool.layer_masks or {}).get(layer, {}).get(position)
        if train_M is None or val_M is None:
            continue
        N_val = val_M.shape[0]
        N_train = train_M.shape[0]
        cos_M = np.zeros((N_val, N_train), dtype=np.float64)
        for vi in range(N_val):
            q_vec = val_M[vi]
            q_mask = val_mask[vi] if val_mask is not None else np.ones_like(q_vec)
            both = (train_mask if train_mask is not None else np.ones_like(train_M)) * q_mask
            a = q_vec[None, :] * both
            b = train_M * both
            num = (a * b).sum(axis=1)
            denom = np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-12
            cos = num / denom
            shared = both.sum(axis=1) if isinstance(both, np.ndarray) else np.full(N_train, train_M.shape[1])
            cos = np.where(shared > 0, cos, 0.0)
            cos_M[vi] = cos
        out[layer] = cos_M
    return out


def evaluate_weights(
    per_layer_cos: dict[str, np.ndarray],
    weights: dict[str, float],
    val_outcomes_in_pos: list[str | None],
    train_outcomes_in_pos: list[str],
    *,
    k: int = 5,
    weighted: bool = True,
    min_shared_total: int = 10,
) -> tuple[int, int, int]:
    """Given pre-computed per-layer cosines + weights, score the weighted-sum kNN.
    Returns (exact_correct, adj_correct, n).
    """
    weighted_sum: np.ndarray | None = None
    for layer, w in weights.items():
        if w == 0.0 or layer not in per_layer_cos:
            continue
        contribution = w * per_layer_cos[layer]
        weighted_sum = contribution if weighted_sum is None else weighted_sum + contribution
    if weighted_sum is None:
        return 0, 0, 0

    correct = 0
    adj_correct = 0
    n = 0
    for vi in range(weighted_sum.shape[0]):
        actual = val_outcomes_in_pos[vi]
        if actual is None:
            continue
        sims = weighted_sum[vi]
        top = np.argsort(-sims)[:k]
        if weighted:
            label_score: dict[str, float] = {}
            for i in top:
                lab = train_outcomes_in_pos[int(i)]
                label_score[lab] = label_score.get(lab, 0.0) + float(sims[int(i)])
            pred = max(label_score.items(), key=lambda kv: kv[1])[0]
        else:
            labels = [train_outcomes_in_pos[int(i)] for i in top]
            pred = Counter(labels).most_common(1)[0][0]
        if pred == actual:
            correct += 1
        if _is_adjacent(actual, pred):
            adj_correct += 1
        n += 1
    return correct, adj_correct, n


def generate_weight_grid(layer_names: list[str], increment: float = 0.1) -> list[dict[str, float]]:
    """All weight combos summing to 1.0 in `increment` steps. Allows zero
    weights so the search can discover that a layer should be dropped."""
    n_layers = len(layer_names)
    units = int(round(1.0 / increment))
    out = []
    for combo in itertools.product(range(units + 1), repeat=n_layers):
        if sum(combo) == units:
            out.append({layer: c * increment for layer, c in zip(layer_names, combo)})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--increment", type=float, default=0.1, help="grid increment (0.1 default; 0.05 = finer but ~16x more combos)")
    ap.add_argument("--top-n", type=int, default=20, help="how many top configs to save per position")
    ap.add_argument("--out", default="../methodology/weight_sensitivity_20260430.txt")
    ap.add_argument("--score-mix", default="exact_plus_half_adj", choices=["exact_plus_half_adj", "exact_only", "adj_only"])
    ap.add_argument(
        "--max-weight",
        action="append",
        default=[],
        metavar="LAYER=MAX",
        help=(
            "Cap a layer's weight at MAX (repeatable). E.g., --max-weight DRAFT=0.30 "
            "constrains the search to configs where DRAFT ≤ 0.30. Use to prevent "
            "outcome-leakage by draft capital (the kNN eval objective rewards "
            "draft-collapsed configs that are bad archetype matches)."
        ),
    )
    ap.add_argument(
        "--min-weight",
        action="append",
        default=[],
        metavar="LAYER=MIN",
        help=(
            "Floor a layer's weight at MIN (repeatable). E.g., --min-weight TRAITS=0.30 "
            "forces the search to consider trait-respecting configs only — used when "
            "the eval objective rewards trait-zero configs that produce visibly bad "
            "archetype clusters in the smoke test."
        ),
    )
    ap.add_argument(
        "--positions",
        nargs="+",
        choices=["QB", "RB", "WR", "TE"],
        default=None,
        help="Only search these positions (default: all four)",
    )
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]

    print("Loading feature_v2_traits pools (training_2014_2020 + validation_2021_2025)...")
    train_pool = comps_mod.load_pool(cur, cohorts=("training_2014_2020",), arm="feature_v2_traits")
    val_pool = comps_mod.load_pool(cur, cohorts=("validation_2021_2025",), arm="feature_v2_traits")

    train_outcomes = load_outcomes(cur, "training_2014_2020")
    val_outcomes = load_outcomes(cur, "validation_2021_2025")

    print(f"Train pool: {train_pool.df.height} rows. Val pool: {val_pool.df.height} rows.")

    def score_of(r):
        if args.score_mix == "exact_only":
            return r["exact"]
        if args.score_mix == "adj_only":
            return r["adj"]
        return r["exact"] + 0.5 * r["adj"]

    positions_to_search = tuple(args.positions) if args.positions else ("QB", "RB", "WR", "TE")
    results_by_pos: dict[str, list[dict]] = {}
    for pos in positions_to_search:
        print(f"\n=== Position: {pos} ===")
        if pos not in train_pool.by_position:
            print(f"  no train pool for {pos}; skipping")
            continue

        print("  Pre-computing per-layer cosines...")
        per_layer_cos = precompute_layer_cosines(train_pool, val_pool, pos)
        layers_present = list(per_layer_cos.keys())
        print(f"  Layers: {layers_present}")
        if not layers_present:
            print("  no layers; skipping")
            continue

        train_pids = [train_pool.df["player_id"][i] for i in train_pool.pos_index[pos]]
        val_pids = [val_pool.df["player_id"][i] for i in val_pool.pos_index[pos]]
        train_outcomes_in_pos = [train_outcomes.get(pid, "Bust") for pid in train_pids]
        val_outcomes_in_pos = [val_outcomes.get(pid) for pid in val_pids]
        n_eval = sum(1 for o in val_outcomes_in_pos if o is not None)
        print(f"  {len(train_pids)} train / {n_eval} val with outcomes")

        grid = generate_weight_grid(layers_present, increment=args.increment)
        # Apply per-layer max- and min-weight constraints
        max_weights: dict[str, float] = {}
        for spec in args.max_weight:
            k, v = spec.split("=", 1)
            max_weights[k.strip().upper()] = float(v.strip())
        min_weights: dict[str, float] = {}
        for spec in args.min_weight:
            k, v = spec.split("=", 1)
            min_weights[k.strip().upper()] = float(v.strip())
        if max_weights:
            grid = [w for w in grid if all(w.get(L, 0) <= mx + 1e-9 for L, mx in max_weights.items())]
        if min_weights:
            grid = [w for w in grid if all(w.get(L, 0) >= mn - 1e-9 for L, mn in min_weights.items())]
        print(f"  Searching {len(grid)} weight combinations (post-constraints)...")

        results = []
        for weights in grid:
            correct, adj_correct, n = evaluate_weights(
                per_layer_cos, weights, val_outcomes_in_pos, train_outcomes_in_pos,
            )
            if n > 0:
                results.append({
                    "weights": weights,
                    "exact": correct / n,
                    "adj": adj_correct / n,
                    "n": n,
                })
        for r in results:
            r["score"] = score_of(r)
        results.sort(key=lambda r: -r["score"])
        results_by_pos[pos] = results

        print(f"  Top 5 weight configs for {pos}:")
        for r in results[:5]:
            w_str = " ".join(f"{k}={v:.2f}" for k, v in sorted(r["weights"].items()))
            print(f"    score={r['score']:.4f} exact={r['exact']:.3f} adj={r['adj']:.3f} | {w_str}")

    # Save sensitivity table
    out_path = args.out
    with open(out_path, "w") as f:
        f.write("# Grid-search results — V2_LAYER_WEIGHTS sensitivity\n")
        f.write(f"# Generated 2026-04-30 PM. Increment={args.increment}, weights summing to 1.0.\n")
        f.write(f"# Score formula = {args.score_mix} (composite eval objective).\n")
        f.write("# Per position: top-N configurations, sorted by score desc.\n\n")
        for pos in ("QB", "RB", "WR", "TE"):
            results = results_by_pos.get(pos, [])
            if not results:
                f.write(f"\n=== {pos}: SKIPPED (no pool) ===\n")
                continue
            f.write(f"\n=== {pos} (top {args.top_n} of {len(results)}) ===\n")
            for r in results[: args.top_n]:
                w_str = " ".join(f"{k}={v:.2f}" for k, v in sorted(r["weights"].items()))
                f.write(f"  score={r['score']:.4f} exact={r['exact']:.3f} adj={r['adj']:.3f} n={r['n']} | {w_str}\n")
            # Also save the absolute floor for context
            worst = results[-1]
            w_str = " ".join(f"{k}={v:.2f}" for k, v in sorted(worst["weights"].items()))
            f.write(f"  ... (worst: score={worst['score']:.4f} | {w_str})\n")

    print(f"\nSaved sensitivity table to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
