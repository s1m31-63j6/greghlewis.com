"""Bradley-Terry rating fit, with standard errors and anchoring.

Turning tournament results into ratings, and being honest about how much to
trust them.

**The model.** Standard Bradley-Terry on the Elo scale: the probability that
player *i* scores against player *j* is

    p_ij = 1 / (1 + 10^((r_j - r_i) / 400))

Draws count as half a win. That is the conventional Elo treatment. A Davidson
model with an explicit draw parameter would give slightly tighter estimates, but
it does not change the ordering and it would complicate the story on the
methodology page for no decision-relevant gain.

**Why not just play against `UCI_Elo` anchors and read off the label?** Because
that assumes Stockfish's own labels are correct, which is the very thing in
question. Fitting all players jointly and *then* shifting the whole scale to sit
best against the anchors keeps the internal comparisons clean, and — more
usefully — produces a per-anchor residual. If the anchors disagree with each
other by 150 Elo, that shows up as a large residual spread, and you know the
absolute numbers deserve a caveat. If they line up, the anchoring is credible.

**Standard errors** come from the inverse Fisher information. The information
matrix is singular by construction (ratings are identified only up to a common
shift), so we use the pseudo-inverse, which yields variances for the
mean-centred contrasts — exactly the quantity the confidence bands on the
calibration chart should show.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.optimize import minimize

# Converts an Elo difference into the logistic scale: p = sigmoid(C * delta).
C = math.log(10) / 400


def _pairs(payload: dict) -> list[tuple[str, str, float, int]]:
    """Deduplicate the symmetric pairing table into (a, b, score_a, games)."""
    seen: dict[tuple[str, str], tuple[float, int]] = {}
    for row in payload["pairings"]:
        a, b = row["a"], row["b"]
        key = (a, b) if a < b else (b, a)
        if key in seen:
            continue
        score_a = row["score_a"] if a < b else row["games"] - row["score_a"]
        seen[key] = (score_a, row["games"])
    return [(a, b, s, n) for (a, b), (s, n) in sorted(seen.items())]


def fit(payload: dict) -> dict:
    """Fit ratings, standard errors, and the anchor offset.

    Returns a dict with `ratings` (id -> {elo, se}), `anchor_residuals`, and
    `offset`.
    """
    players = payload["players"]
    ids = [p["id"] for p in players]
    index = {pid: i for i, pid in enumerate(ids)}
    n_players = len(ids)
    pairs = _pairs(payload)

    if not pairs:
        raise ValueError("no pairings to fit")

    def neg_log_likelihood(r: np.ndarray) -> tuple[float, np.ndarray]:
        ll = 0.0
        grad = np.zeros(n_players)
        for a, b, score_a, games in pairs:
            i, j = index[a], index[b]
            p = 1.0 / (1.0 + math.exp(-C * (r[i] - r[j])))
            p = min(max(p, 1e-12), 1 - 1e-12)
            ll += score_a * math.log(p) + (games - score_a) * math.log(1 - p)
            residual = C * (score_a - games * p)
            grad[i] += residual
            grad[j] -= residual
        return -ll, -grad

    result = minimize(
        neg_log_likelihood,
        x0=np.zeros(n_players),
        jac=True,
        method="L-BFGS-B",
        options={"maxiter": 5000, "ftol": 1e-12},
    )
    if not result.success:
        raise RuntimeError(f"rating fit did not converge: {result.message}")

    # Ratings are identified only up to a shift; centre them before anchoring.
    r = result.x - result.x.mean()

    # Fisher information = -Hessian of the log-likelihood.
    info = np.zeros((n_players, n_players))
    for a, b, _score_a, games in pairs:
        i, j = index[a], index[b]
        p = 1.0 / (1.0 + math.exp(-C * (r[i] - r[j])))
        w = C * C * games * p * (1 - p)
        info[i, i] += w
        info[j, j] += w
        info[i, j] -= w
        info[j, i] -= w
    se = np.sqrt(np.clip(np.diag(np.linalg.pinv(info)), 0.0, None))

    # Shift the whole scale to sit as close as possible to the nominal anchors.
    anchors = [p for p in players if p["kind"] == "anchor"]
    if anchors:
        offset = float(np.mean([p["uci_elo"] - r[index[p["id"]]] for p in anchors]))
    else:
        offset = 0.0

    ratings = {
        pid: {"elo": float(r[i] + offset), "se": float(se[i])} for pid, i in index.items()
    }
    anchor_residuals = {
        p["id"]: {
            "nominal": p["uci_elo"],
            "measured": ratings[p["id"]]["elo"],
            "residual": ratings[p["id"]]["elo"] - p["uci_elo"],
        }
        for p in anchors
    }

    return {"ratings": ratings, "anchor_residuals": anchor_residuals, "offset": offset}


def curve(payload: dict, ratings: dict) -> list[dict]:
    """The measured strength curve: one point per sampler, sorted by `s`."""
    points = [
        {
            "s": p["s"],
            "elo": ratings[p["id"]]["elo"],
            "se": ratings[p["id"]]["se"],
            "id": p["id"],
        }
        for p in payload["players"]
        if p["kind"] == "sampler"
    ]
    return sorted(points, key=lambda pt: pt["s"])


def invert(points: list[dict], target_elo: float) -> float:
    """Find the strength scalar `s` that produces `target_elo`.

    Linear interpolation on the measured curve, clamped at the ends. Callers
    should check `monotonicity_breaks` first — interpolating a non-monotone
    curve silently returns a meaningless answer.
    """
    xs = [pt["elo"] for pt in points]
    ys = [pt["s"] for pt in points]
    return float(np.interp(target_elo, xs, ys))


def monotonicity_breaks(points: list[dict]) -> list[tuple[str, str]]:
    """Adjacent curve points where more `s` did not produce more strength.

    A non-empty result means the one-parameter weakening family is not monotone
    over the sampled range, and `invert` cannot be trusted. That is a finding
    about the parameter shapes in `weakening.params_for`, not a bug here.
    """
    return [
        (points[i]["id"], points[i + 1]["id"])
        for i in range(len(points) - 1)
        if points[i + 1]["elo"] <= points[i]["elo"]
    ]
