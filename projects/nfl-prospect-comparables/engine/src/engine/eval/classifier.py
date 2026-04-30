"""Fitted-classifier eval — sklearn LogisticRegression + GradientBoosting per
embedding arm, complementing the kNN probe in `ablation.py`.

The question: kNN is a passive probe of the embedding's local structure. A
fitted classifier may extract signal that kNN can't — particularly from a
combined feature_vec where dimensions interact non-linearly (which kNN smears
through cosine similarity). If the surprising "measurables wins, hybrid
loses" finding flips under a fitted model, that's a real result; if it
holds, the embedding's local structure really does favor measurables.

Per-position fits because outcome distributions and feature scales vary by
position. Trained on training cohort, evaluated on validation cohort.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np

from engine.embedding import comps as comps_mod
from engine.eval import ablation


OUTCOME_TIERS = ablation.OUTCOME_TIERS  # ("Bust", "Role Player", "Starter", "Pro Bowl", "HOF-track")


@dataclass
class ClassifierResult:
    arm: str
    model: str
    n: int
    correct: int
    accuracy: float
    adjacent_correct: int
    adjacent_accuracy: float
    macro_f1: float
    confusion: dict[str, dict[str, int]]
    by_position: dict[str, tuple[int, int]]


def _make_model(model_name: str, n_classes_seen: int):
    """Construct a fresh sklearn classifier instance per (arm, position) fit.
    Constructed locally (not module-level) to avoid sklearn import at import time.
    """
    if model_name == "logreg":
        from sklearn.linear_model import LogisticRegression
        # No class_weight — validation cohort really is heavy Bust+Role
        # (89% — 1-5 NFL seasons in for the latest classes), so a model
        # that learns the natural class prior is honest. Use C=1.0 default.
        # sklearn 1.5+ auto-selects multinomial for multi-class.
        return LogisticRegression(
            solver="lbfgs",
            max_iter=2000,
            C=1.0,
        )
    if model_name == "logreg_balanced":
        from sklearn.linear_model import LogisticRegression
        # Inverse-frequency class weights — pushes toward rare-class recall
        # at the cost of exact accuracy. Useful for the macro-F1 view.
        return LogisticRegression(
            solver="lbfgs",
            max_iter=2000,
            class_weight="balanced",
            C=1.0,
        )
    if model_name == "gbm":
        from sklearn.ensemble import GradientBoostingClassifier
        return GradientBoostingClassifier(
            n_estimators=200,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.8,
            random_state=42,
        )
    raise ValueError(f"unknown model: {model_name!r}")


def evaluate_arm(
    curated_bucket: str,
    *,
    arm: str,
    model: str,
    train_player_ids: set[str] | None = None,
    val_player_ids: set[str] | None = None,
) -> ClassifierResult:
    """Fit a per-position classifier on the training pool's vectors and
    evaluate on validation. Returns a ClassifierResult with the same metrics
    shape as kNN ablation results so the two can be compared side-by-side.
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

    train_outcomes = ablation.load_outcomes(curated_bucket, "training_2014_2020")
    val_outcomes = ablation.load_outcomes(curated_bucket, "validation_2021_2025")

    confusion: dict[str, dict[str, int]] = {t: {} for t in OUTCOME_TIERS}
    by_position: dict[str, list[int]] = {}
    correct = 0
    adjacent_correct = 0
    n = 0

    val_vec_col = val_pool.vec_col
    train_vec_col = train_pool.vec_col

    for pos in train_pool.by_position:
        # Build train X / y for this position
        train_idxs = train_pool.pos_index[pos]
        train_pids = [train_pool.df["player_id"][i] for i in train_idxs]
        train_y = [train_outcomes.get(pid) for pid in train_pids]
        # Drop any train players without an outcome label
        keep = [i for i, y in enumerate(train_y) if y is not None]
        if len(keep) < 5:
            continue
        train_X = np.stack([
            np.asarray(train_pool.df[train_vec_col][train_idxs[i]], dtype=np.float64)
            for i in keep
        ])
        train_y_clean = [train_y[i] for i in keep]
        # Pre-normalize (cosine-equivalent for L2-normed inputs; harmless for
        # logreg even if vectors aren't unit length)
        norms = np.linalg.norm(train_X, axis=1, keepdims=True)
        train_X = train_X / np.clip(norms, 1e-12, None)

        n_classes_seen = len(set(train_y_clean))
        if n_classes_seen < 2:
            continue
        clf = _make_model(model, n_classes_seen)
        clf.fit(train_X, train_y_clean)

        # Build val X / y
        if pos not in val_pool.pos_index:
            continue
        val_idxs = val_pool.pos_index[pos]
        for i in val_idxs:
            pid = val_pool.df["player_id"][i]
            actual = val_outcomes.get(pid)
            if actual is None:
                continue
            x = np.asarray(val_pool.df[val_vec_col][i], dtype=np.float64)
            x = x / max(np.linalg.norm(x), 1e-12)
            pred = clf.predict(x.reshape(1, -1))[0]
            confusion.setdefault(actual, {})
            confusion[actual][pred] = confusion[actual].get(pred, 0) + 1
            n += 1
            by_position.setdefault(pos, [0, 0])
            by_position[pos][1] += 1
            if pred == actual:
                correct += 1
                by_position[pos][0] += 1
            if abs(OUTCOME_TIERS.index(actual) - OUTCOME_TIERS.index(pred)) <= 1:
                adjacent_correct += 1

    return ClassifierResult(
        arm=arm,
        model=model,
        n=n,
        correct=correct,
        accuracy=correct / n if n else 0.0,
        adjacent_correct=adjacent_correct,
        adjacent_accuracy=adjacent_correct / n if n else 0.0,
        macro_f1=ablation._macro_f1(confusion),
        confusion=confusion,
        by_position={p: (c, t) for p, (c, t) in by_position.items()},
    )
