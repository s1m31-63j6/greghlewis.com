"""Shared state bucketing.

The tendency tables and the engine have to agree exactly on which bucket a
state falls into, and so does the TypeScript port. Keeping the boundaries in
one module — and mirroring it verbatim in `engine/buckets.ts` — is what makes
the parity test meaningful. Change a boundary here and you must change it
there, or the parity test will tell you about it.
"""

from __future__ import annotations

# Seconds remaining in the fourth quarter.
TIME_EDGES = [15, 40, 70, 120]
TIME_LABELS = ["0-15", "16-40", "41-70", "71-120", "121+"]

# Score differential from the possessing team's point of view.
DIFF_EDGES = [-9, -4, -1, 0, 3, 8]
DIFF_LABELS = ["down9+", "down4-8", "down1-3", "tied", "up1-3", "up4-8", "up9+"]

# Yards to go for a first down.
#
# These labels are shared by the tendency tables AND by the yardage
# distributions in `fit_distributions.py`. They used to be defined twice, with
# different boundaries — "1-2"/"3-5"/"6-9"/"10+" here and
# "1-3"/"4-6"/"7-10"/"11-15"/"16+" there — which meant every distribution
# lookup in the engine missed its key and silently fell through to the pooled
# distribution. Both engines did it identically, so parity passed and nothing
# looked wrong; a mutation test on this boundary is what surfaced it. One
# definition, imported everywhere.
YTG_EDGES = [3, 6, 10, 15]
YTG_LABELS = ["1-3", "4-6", "7-10", "11-15", "16+"]

# Yards from the opponent's goal line.
YARDLINE_EDGES = [10, 25, 40, 55, 70]
YARDLINE_LABELS = ["1-10", "11-25", "26-40", "41-55", "56-70", "71+"]


def _bucket(value: float, edges: list[int], labels: list[str]) -> str:
    for edge, label in zip(edges, labels):
        if value <= edge:
            return label
    return labels[-1]


def time_band(seconds: float) -> str:
    return _bucket(seconds, TIME_EDGES, TIME_LABELS)


def diff_band(score_diff: float) -> str:
    """Note the asymmetric edges: `down9+` is anything at -9 or worse."""
    if score_diff <= -9:
        return "down9+"
    if score_diff <= -4:
        return "down4-8"
    if score_diff <= -1:
        return "down1-3"
    if score_diff == 0:
        return "tied"
    if score_diff <= 3:
        return "up1-3"
    if score_diff <= 8:
        return "up4-8"
    return "up9+"


def ytg_band(ydstogo: float) -> str:
    return _bucket(ydstogo, YTG_EDGES, YTG_LABELS)


def yardline_band(yardline_100: float) -> str:
    return _bucket(yardline_100, YARDLINE_EDGES, YARDLINE_LABELS)


def key(*parts: str) -> str:
    return "|".join(parts)
