"""WR features — public-PBP gold-standard set, audited 2026-04-28 against
the WR-analyst community. All math lives in `_receiver`; this module is the
WR-tagged wrapper.

22 features computed (see catalog.WR_FEATURES). The hard public-data ceiling
is route counts and coverage labels; we substitute per-team-pass-attempt
denominators (RYPTPA / TPTPA / 1DPTPA) — the community's standard college
analogue. 13 deferred specs (paid charting required) live in
catalog.WR_DEFERRED for the methodology page.
"""

from __future__ import annotations

import polars as pl

from engine.features import _receiver
from engine.schema import PlayerProfile, Position


WRContext = _receiver.ReceiverContext


def build_wr_context(
    attributed_plays: pl.DataFrame,
    wr_canon_ids: set[int],
) -> WRContext:
    return _receiver.build_context(attributed_plays, wr_canon_ids)


def compute(
    profile: PlayerProfile,
    ctx: WRContext,
    *,
    pfr_to_canon_id: dict[str, int],
    pss_wide: pl.DataFrame,
    team_pass_dist: pl.DataFrame,
) -> dict[str, float]:
    return _receiver.compute_for_profile(
        profile, ctx,
        position=Position.WR,
        prefix="wr",
        pfr_to_canon_id=pfr_to_canon_id,
        pss_wide=pss_wide,
        team_pass_dist=team_pass_dist,
    )
