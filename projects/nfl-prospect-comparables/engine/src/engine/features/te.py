"""TE features — same receiver math as WR (CFBD playText doesn't actually
differentiate the two — no formation, blocking, or route data). Position-
specific TE concerns (in-line vs flexed, run-block exposure, route
participation) live in catalog.TE_DEFERRED — public-data-impossible.

22 features computed (see catalog.TE_FEATURES). Math identical to WR; the
position-conditioned cohort distributions in Phase 2 will let the embedding
distinguish a TE getting 8 yds/target from a WR getting 8 yds/target.
"""

from __future__ import annotations

import polars as pl

from engine.features import _receiver
from engine.schema import PlayerProfile, Position


TEContext = _receiver.ReceiverContext


def build_te_context(
    attributed_plays: pl.DataFrame,
    te_canon_ids: set[int],
) -> TEContext:
    return _receiver.build_context(attributed_plays, te_canon_ids)


def compute(
    profile: PlayerProfile,
    ctx: TEContext,
    *,
    pfr_to_canon_id: dict[str, int],
    pss_wide: pl.DataFrame,
    team_pass_dist: pl.DataFrame,
) -> dict[str, float]:
    return _receiver.compute_for_profile(
        profile, ctx,
        position=Position.TE,
        prefix="te",
        pfr_to_canon_id=pfr_to_canon_id,
        pss_wide=pss_wide,
        team_pass_dist=team_pass_dist,
    )
