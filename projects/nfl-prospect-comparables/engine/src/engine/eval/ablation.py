"""Ablation eval — outcome-class accuracy per embedding arm.

Trains a simple kNN classifier over the training cohort's hybrid vectors
(or feature-only / text-only arms for ablation), predicts outcome class
on the validation cohort, and reports per-arm accuracy + confusion
matrix + per-position breakdown.

The kNN classifier is intentionally simple — it's a direct probe of the
embedding's outcome-discriminative power, not a final production model.
A more sophisticated classifier (e.g., logistic regression, random
forest) might squeeze more out of the same embedding, but the ablation
question is "do the features add signal? does the text add signal?"
which kNN tests cleanly.
"""

from __future__ import annotations

import io
from collections import Counter
from dataclasses import dataclass

import boto3
import numpy as np
import polars as pl

from engine.embedding import comps as comps_mod


OUTCOME_TIERS = ["Bust", "Role Player", "Starter", "Pro Bowl", "HOF-track"]


def load_outcomes(curated_bucket: str, cohort: str) -> dict[str, str]:
    """player_id (pfr_player_id) → outcome_class."""
    s3 = boto3.client("s3")
    body = s3.get_object(
        Bucket=curated_bucket, Key=f"outcomes/{cohort}/data.parquet"
    )["Body"].read()
    df = pl.read_parquet(io.BytesIO(body))
    return {
        row["pfr_player_id"]: row["outcome_class"]
        for row in df.iter_rows(named=True)
        if row["pfr_player_id"] and row["outcome_class"]
    }


def baseline_accuracy(val_outcomes: dict[str, str]) -> tuple[str, float]:
    """Modal-class baseline — predict the most common training class always."""
    counts = Counter(val_outcomes.values())
    modal, modal_count = counts.most_common(1)[0]
    return modal, modal_count / len(val_outcomes)


@dataclass
class ArmResult:
    arm: str
    k: int
    n: int
    correct: int
    accuracy: float
    adjacent_correct: int   # within ±1 tier
    adjacent_accuracy: float
    macro_f1: float         # average F1 across the 5 tiers
    precision_at_k: float          # mean per-query: top-K share actual tier
    precision_at_k_adjacent: float  # mean per-query: top-K within ±1 of actual
    confusion: dict[str, dict[str, int]]  # actual → predicted → count
    by_position: dict[str, tuple[int, int]]  # pos → (correct, n)


_TIER_RANK = {t: i for i, t in enumerate(OUTCOME_TIERS)}


def _is_adjacent(actual: str, predicted: str) -> bool:
    return abs(_TIER_RANK[actual] - _TIER_RANK[predicted]) <= 1


def _macro_f1(confusion: dict[str, dict[str, int]]) -> float:
    """Mean of per-tier F1. Ignores tiers with zero actual + zero predicted."""
    f1s = []
    for tier in OUTCOME_TIERS:
        tp = confusion.get(tier, {}).get(tier, 0)
        fn = sum(v for k, v in confusion.get(tier, {}).items() if k != tier)
        fp = sum(
            confusion.get(other, {}).get(tier, 0)
            for other in OUTCOME_TIERS
            if other != tier
        )
        if tp + fn + fp == 0:
            continue
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        if precision + recall == 0:
            f1s.append(0.0)
        else:
            f1s.append(2 * precision * recall / (precision + recall))
    return sum(f1s) / len(f1s) if f1s else 0.0


def _knn_predict_with_precision(
    q_vec: np.ndarray,
    train_M: np.ndarray,
    train_outcomes_in_pos: list[str],
    actual: str,
    *,
    k: int,
    weighted: bool = True,
) -> tuple[str, float, float]:
    """Predict outcome + compute precision@K over the same top-K neighbors.

    Returns (predicted_tier, precision_exact, precision_adjacent).
      precision_exact:  fraction of top-K whose outcome equals actual
      precision_adjacent: fraction within ±1 tier of actual
    """
    qn = q_vec / (np.linalg.norm(q_vec) or 1.0)
    sims = train_M @ qn  # train_M is already L2-normalized
    top = np.argsort(-sims)[:k]
    labels = [train_outcomes_in_pos[int(i)] for i in top]
    # Prediction
    if not weighted:
        prediction = Counter(labels).most_common(1)[0][0]
    else:
        label_score: dict[str, float] = {}
        for i in top:
            lab = train_outcomes_in_pos[int(i)]
            label_score[lab] = label_score.get(lab, 0.0) + float(sims[int(i)])
        prediction = max(label_score.items(), key=lambda kv: kv[1])[0]
    # Precision@K
    p_exact = sum(1 for lab in labels if lab == actual) / k
    p_adj = sum(1 for lab in labels if _is_adjacent(actual, lab)) / k
    return prediction, p_exact, p_adj


def _layered_knn_predict_with_precision(
    val_pid: str,
    pos: str,
    train_pool,
    val_pool,
    train_outcomes_in_pos: list[str],
    actual: str,
    *,
    k: int,
    weighted: bool = True,
) -> tuple[str, float, float]:
    """Layered weighted-cosine kNN matching production find_comps semantics.
    Combines per-layer (BODY/VOLUME/EFFICIENCY/TRAITS) masked cosines with
    per-position weights, mirroring `find_comps` for the v2 layered arms.
    """
    from engine.features.catalog import v2_layer_weights
    from engine.schema import Position as _Position

    weights = v2_layer_weights(_Position[pos])
    sim_layers = (val_pool.layer_set_by_position or {}).get(pos, ())
    # Find val row index for this player
    val_idxs = val_pool.pos_index[pos]
    val_row_local = None
    for local_i, df_i in enumerate(val_idxs):
        if val_pool.df["player_id"][df_i] == val_pid:
            val_row_local = local_i
            break
    if val_row_local is None:
        return "Bust", 0.0, 0.0

    weighted_sum: np.ndarray | None = None
    for layer in sim_layers:
        train_M = (train_pool.layer_matrices or {}).get(layer, {}).get(pos)
        train_mask = (train_pool.layer_masks or {}).get(layer, {}).get(pos)
        val_M = (val_pool.layer_matrices or {}).get(layer, {}).get(pos)
        val_mask = (val_pool.layer_masks or {}).get(layer, {}).get(pos)
        w = float(weights.get(layer, 0.0))
        if train_M is None or val_M is None or w == 0.0:
            continue
        q_vec = val_M[val_row_local]
        q_mask = val_mask[val_row_local] if val_mask is not None else np.ones_like(q_vec)
        both = (train_mask if train_mask is not None else 1.0) * q_mask
        a = q_vec[None, :] * both
        b = train_M * both
        num = (a * b).sum(axis=1)
        denom = np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-12
        layer_cos = num / denom
        shared = both.sum(axis=1) if isinstance(both, np.ndarray) else np.full(train_M.shape[0], train_M.shape[1])
        layer_cos = np.where(shared > 0, layer_cos, 0.0)
        contribution = w * layer_cos
        weighted_sum = contribution if weighted_sum is None else weighted_sum + contribution

    if weighted_sum is None:
        return "Bust", 0.0, 0.0
    sims = weighted_sum
    top = np.argsort(-sims)[:k]
    labels = [train_outcomes_in_pos[int(i)] for i in top]
    if not weighted:
        prediction = Counter(labels).most_common(1)[0][0]
    else:
        label_score: dict[str, float] = {}
        for i in top:
            lab = train_outcomes_in_pos[int(i)]
            label_score[lab] = label_score.get(lab, 0.0) + float(sims[int(i)])
        prediction = max(label_score.items(), key=lambda kv: kv[1])[0]
    p_exact = sum(1 for lab in labels if lab == actual) / k
    p_adj = sum(1 for lab in labels if _is_adjacent(actual, lab)) / k
    return prediction, p_exact, p_adj


def evaluate_arm(
    curated_bucket: str,
    *,
    arm: str,
    k: int = 5,
    weighted: bool = True,
    train_player_ids: set[str] | None = None,
    val_player_ids: set[str] | None = None,
) -> ArmResult:
    """Run kNN classification on validation using training as the reference set.

    Optional `train_player_ids` / `val_player_ids` restrict the pools to
    the given player_id sets — used for apples-to-apples subset eval (e.g.,
    only players with both Brugler and Wikipedia text).
    """
    train_pool = comps_mod.load_pool(
        curated_bucket, cohorts=("training_2014_2020",), arm=arm
    )
    val_pool = comps_mod.load_pool(
        curated_bucket, cohorts=("validation_2021_2025",), arm=arm
    )
    if train_player_ids is not None:
        train_pool = comps_mod.filter_pool(train_pool, train_player_ids)
    if val_player_ids is not None:
        val_pool = comps_mod.filter_pool(val_pool, val_player_ids)
    train_outcomes = load_outcomes(curated_bucket, "training_2014_2020")
    val_outcomes = load_outcomes(curated_bucket, "validation_2021_2025")

    # Pre-build per-position outcome lists matching the order in train_pool.by_position
    train_outcomes_by_pos: dict[str, list[str]] = {}
    train_player_ids_by_pos: dict[str, list[str]] = {}
    for pos, idxs in train_pool.pos_index.items():
        outs = []
        pids = []
        for i in idxs:
            pid = train_pool.df["player_id"][i]
            outs.append(train_outcomes.get(pid, "Bust"))  # default if missing
            pids.append(pid)
        train_outcomes_by_pos[pos] = outs
        train_player_ids_by_pos[pos] = pids

    correct = 0
    adjacent_correct = 0
    n = 0
    p_exact_sum = 0.0
    p_adj_sum = 0.0
    confusion: dict[str, dict[str, int]] = {t: {} for t in OUTCOME_TIERS}
    by_position: dict[str, list[int]] = {p: [0, 0] for p in train_pool.by_position}

    # If the pool has per-layer matrices (v2 layered arms), use the layered
    # weighted-cosine path so the formal eval matches production comp scoring.
    # Otherwise fall back to the concatenated-vector cosine.
    is_layered = train_pool.layer_matrices is not None and val_pool.layer_matrices is not None

    vec_col = val_pool.vec_col
    for row in val_pool.df.iter_rows(named=True):
        pid = row["player_id"]
        actual = val_outcomes.get(pid)
        if actual is None:
            continue
        pos = row["position"]
        if pos not in train_pool.by_position:
            continue
        if is_layered:
            pred, p_exact, p_adj = _layered_knn_predict_with_precision(
                pid, pos, train_pool, val_pool, train_outcomes_by_pos[pos],
                actual, k=k, weighted=weighted,
            )
        else:
            q_vec = np.asarray(row[vec_col], dtype=np.float64)
            train_M = train_pool.by_position[pos]
            pred, p_exact, p_adj = _knn_predict_with_precision(
                q_vec, train_M, train_outcomes_by_pos[pos], actual,
                k=k, weighted=weighted,
            )
        p_exact_sum += p_exact
        p_adj_sum += p_adj
        confusion.setdefault(actual, {})
        confusion[actual][pred] = confusion[actual].get(pred, 0) + 1
        if pred == actual:
            correct += 1
            by_position[pos][0] += 1
        if _is_adjacent(actual, pred):
            adjacent_correct += 1
        n += 1
        by_position[pos][1] += 1

    return ArmResult(
        arm=arm,
        k=k,
        n=n,
        correct=correct,
        accuracy=correct / n if n else 0.0,
        adjacent_correct=adjacent_correct,
        adjacent_accuracy=adjacent_correct / n if n else 0.0,
        macro_f1=_macro_f1(confusion),
        precision_at_k=p_exact_sum / n if n else 0.0,
        precision_at_k_adjacent=p_adj_sum / n if n else 0.0,
        confusion=confusion,
        by_position={p: (c, t) for p, (c, t) in by_position.items()},
    )


def format_result(r: ArmResult) -> str:
    lines = [
        f"\n=== arm={r.arm}, k={r.k} ===",
        f"  exact:           {r.correct}/{r.n} = {100 * r.accuracy:.1f}%",
        f"  within ±1 tier:  {r.adjacent_correct}/{r.n} = {100 * r.adjacent_accuracy:.1f}%",
        f"  macro F1:        {r.macro_f1:.3f}",
        f"  precision@{r.k}:      {100 * r.precision_at_k:.1f}% (exact)  /  {100 * r.precision_at_k_adjacent:.1f}% (±1)",
        f"  by position (exact):",
    ]
    for pos, (c, t) in sorted(r.by_position.items()):
        if t == 0:
            continue
        pct = 100 * c / t
        lines.append(f"    {pos}: {c}/{t} = {pct:.1f}%")
    lines.append("  confusion (actual → predicted):")
    header = "    " + " " * 14 + "  ".join(f"{p[:10]:>10}" for p in OUTCOME_TIERS)
    lines.append(header)
    for actual in OUTCOME_TIERS:
        row = r.confusion.get(actual, {})
        n_actual = sum(row.values())
        if n_actual == 0:
            continue
        cells = "  ".join(f"{row.get(p, 0):>10}" for p in OUTCOME_TIERS)
        lines.append(f"    {actual:<14}{cells}  (n={n_actual})")
    return "\n".join(lines)


def baseline_per_position_modal(
    curated_bucket: str,
) -> dict[str, dict[str, float]]:
    """Per-position modal-class baseline. Predict each validation player as the
    training cohort's modal class within their position."""
    train_outcomes = load_outcomes(curated_bucket, "training_2014_2020")
    val_outcomes = load_outcomes(curated_bucket, "validation_2021_2025")
    s3 = boto3.client("s3")
    body = s3.get_object(
        Bucket=curated_bucket, Key="outcomes/training_2014_2020/data.parquet"
    )["Body"].read()
    train_df = pl.read_parquet(io.BytesIO(body))
    body = s3.get_object(
        Bucket=curated_bucket, Key="outcomes/validation_2021_2025/data.parquet"
    )["Body"].read()
    val_df = pl.read_parquet(io.BytesIO(body))

    out: dict[str, dict[str, float]] = {}
    for pos in ["QB", "RB", "WR", "TE"]:
        train_pos = [r["outcome_class"] for r in train_df.filter(pl.col("position") == pos).iter_rows(named=True)]
        if not train_pos:
            continue
        modal = Counter(train_pos).most_common(1)[0][0]
        val_pos_outcomes = [
            r["outcome_class"]
            for r in val_df.filter(pl.col("position") == pos).iter_rows(named=True)
        ]
        if not val_pos_outcomes:
            continue
        correct = sum(1 for v in val_pos_outcomes if v == modal)
        out[pos] = {
            "modal": modal,
            "accuracy": correct / len(val_pos_outcomes),
            "n": len(val_pos_outcomes),
        }
    return out
