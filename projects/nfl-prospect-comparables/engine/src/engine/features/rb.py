"""RB feature engineering — public-PBP gold-standard set, audited 2026-04-28
against the RB-analyst community (JJ Zachariason, Hayden Winks, Eric Eager,
Bill Connelly / SP+, Mike Clay / 4for4, Kevin Cole / OSF, PlayerProfiler,
Pat Thorman, FFFaceoff PSI).

Reads the shared cohort-attributed plays frame (engine.parse.attribute) plus
universal CohortContext.pss_wide for team-level player_season_stats
aggregates and team denominators.

19 features computed (see catalog.RB_FEATURES). The hard public-data ceiling
is contact-charting (PFF YACO / forced missed tackles / elusive rating) and
defensive-context labels (box count, snap share). 10 deferred specs in
catalog.RB_DEFERRED.

Headline analyst-framework concepts:
  - opportunity_rate + highlight_yards_per_opportunity (Connelly / SP+) — the
    public-PBP analogue of PFF YACO; isolates RB-driven yards from line yards
    by counting only the RB's contribution beyond the first 5.
  - yards_per_team_play (Zachariason) — single most predictive RB input in
    his model; team-pace-normalized career production.
  - weighted_opportunity_per_game (Mike Clay) — gold-standard RB workload.
  - expected_tds_minus_actual (Mike Clay) — TD regression signal that
    neutralizes goal-line luck better than goalline_td_rate.
"""

from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from engine.schema import PlayerProfile, Position


# ---------- TD baselines (yardline → P(TD)) ----------

# Approximation; refine in Phase 1.1 by computing empirically from the
# parsed_plays frame. Per-play TD probability conditional on yards-to-goal
# bucket. Lower goalline rates than NFL because college play-action /
# passing TDs from goalline are rarer.
RUSH_TD_BASELINE: dict[int, float] = {
    1: 0.50,
    5: 0.18,
    10: 0.05,
    20: 0.020,
    50: 0.005,
    100: 0.001,
}
CATCH_TD_BASELINE: dict[int, float] = {
    1: 0.45,
    5: 0.20,
    10: 0.07,
    20: 0.025,
    50: 0.008,
    100: 0.002,
}


def _ytg_bucket_expr() -> pl.Expr:
    """Return a polars expression that buckets `yards_to_goal` into the
    keys of {RUSH,CATCH}_TD_BASELINE."""
    return (
        pl.when(pl.col("yards_to_goal") <= 1).then(1)
        .when(pl.col("yards_to_goal") <= 5).then(5)
        .when(pl.col("yards_to_goal") <= 10).then(10)
        .when(pl.col("yards_to_goal") <= 20).then(20)
        .when(pl.col("yards_to_goal") <= 50).then(50)
        .otherwise(100)
        .alias("_ytg_bucket")
    )


# ---------- aggregations ----------


def _safe_div(num, den, *, default=None, ndigits=3):
    if den is None or den == 0:
        return default
    return round(num / den, ndigits)


def _aggregate_per_season(plays: pl.DataFrame) -> pl.DataFrame:
    """Per (rb_id, season) aggregates split by role, with TD-expected
    sub-aggregates for the rb_expected_tds_minus_actual feature."""
    not_two_point = ~pl.col("is_two_point")
    is_rusher = (pl.col("role") == "rusher") & not_two_point
    is_receiver = (pl.col("role") == "receiver") & not_two_point
    is_catch = is_receiver & pl.col("parsed_type").is_in(["pass_complete", "pass_td"])

    df = plays.with_columns([
        is_rusher.alias("_is_rusher"),
        is_receiver.alias("_is_receiver"),
        is_catch.alias("_is_catch"),
        _ytg_bucket_expr(),
    ]).with_columns([
        pl.col("_ytg_bucket").replace_strict(RUSH_TD_BASELINE, default=0.001).alias("_rush_td_exp"),
        pl.col("_ytg_bucket").replace_strict(CATCH_TD_BASELINE, default=0.001).alias("_catch_td_exp"),
    ])
    return (
        df.group_by(["rb_id", "season"])
        .agg([
            pl.col("game_id").n_unique().alias("games_played"),
            pl.col("offense").first().alias("team"),
            # Rushing
            pl.col("_is_rusher").sum().alias("rush_attempts"),
            (pl.col("_is_rusher").cast(pl.Int64) * pl.col("yards_gained").fill_null(0)).sum().alias("rush_yards"),
            ((pl.col("parsed_type") == "rush_td") & not_two_point).sum().alias("rush_tds"),
            (pl.col("_is_rusher").cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_rush"),
            (pl.col("_is_rusher") & (pl.col("ppa") > 0)).sum().alias("rush_success"),
            (pl.col("_is_rusher") & (pl.col("yards_gained") >= 10)).sum().alias("rush_explosive"),
            (pl.col("_is_rusher") & (pl.col("yards_gained") <= 0)).sum().alias("rush_stuffed"),
            # Opportunity (Connelly): carries gaining ≥ 5 yards
            (pl.col("_is_rusher") & (pl.col("yards_gained") >= 5)).sum().alias("opportunity_carries"),
            # Highlight yards: (yards - 5) on opportunity carries (≥5 yd carries only)
            (
                pl.col("_is_rusher").cast(pl.Int64)
                * pl.when(pl.col("yards_gained") >= 5)
                  .then(pl.col("yards_gained") - 5)
                  .otherwise(0)
            ).sum().alias("highlight_yards"),
            # Situational
            (pl.col("_is_rusher") & (pl.col("down") <= 2)).sum().alias("rush_early_down"),
            ((pl.col("_is_rusher") & (pl.col("down") <= 2)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_rush_early"),
            (pl.col("_is_rusher") & (pl.col("down") == 3) & (pl.col("distance") <= 2)).sum().alias("rush_third_short"),
            ((pl.col("_is_rusher") & (pl.col("down") == 3) & (pl.col("distance") <= 2)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_rush_third_short"),
            # Receiving
            pl.col("_is_receiver").sum().alias("targets"),
            pl.col("_is_catch").sum().alias("receptions"),
            (pl.col("_is_catch").cast(pl.Int64) * pl.col("yards_gained").fill_null(0)).sum().alias("rec_yards"),
            ((pl.col("_is_catch") & pl.col("is_touchdown")).cast(pl.Int64)).sum().alias("rec_tds"),
            # Expected TDs (Mike Clay TD regression baseline)
            (pl.col("_is_rusher").cast(pl.Float64) * pl.col("_rush_td_exp")).sum().alias("expected_rush_tds"),
            (pl.col("_is_catch").cast(pl.Float64) * pl.col("_catch_td_exp")).sum().alias("expected_catch_tds"),
        ])
    )


# ---------- team / cohort denominator helpers ----------


def _team_total_plays_lookup(pss_wide: pl.DataFrame) -> dict[tuple[str, int], int]:
    """Per (team, season) → total team plays (pass + rush attempts summed across players)."""
    agg = (
        pss_wide
        .group_by(["team", "season"])
        .agg(
            (pl.col("pass_attempts").fill_null(0).sum() + pl.col("rush_attempts").fill_null(0).sum())
            .alias("team_plays")
        )
    )
    return {
        (row["team"], int(row["season"])): int(row["team_plays"])
        for row in agg.iter_rows(named=True)
    }


def _team_total_scrim_yds_lookup(pss_wide: pl.DataFrame) -> dict[tuple[str, int], int]:
    """Per (team, season) → team scrimmage yards (rush + receiving)."""
    agg = (
        pss_wide
        .group_by(["team", "season"])
        .agg(
            (pl.col("rush_yards").fill_null(0).sum() + pl.col("rec_yards").fill_null(0).sum())
            .alias("team_scrim_yards")
        )
    )
    return {
        (row["team"], int(row["season"])): int(row["team_scrim_yards"])
        for row in agg.iter_rows(named=True)
    }


def _team_rushing_yds_lookup(pss_wide: pl.DataFrame) -> dict[tuple[str, int], int]:
    agg = (
        pss_wide
        .group_by(["team", "season"])
        .agg(pl.col("rush_yards").fill_null(0).sum().alias("team_rush_yards"))
    )
    return {
        (row["team"], int(row["season"])): int(row["team_rush_yards"])
        for row in agg.iter_rows(named=True)
    }


def _team_rec_yds_lookup(pss_wide: pl.DataFrame) -> dict[tuple[str, int], int]:
    agg = (
        pss_wide
        .group_by(["team", "season"])
        .agg(pl.col("rec_yards").fill_null(0).sum().alias("team_rec_yards"))
    )
    return {
        (row["team"], int(row["season"])): int(row["team_rec_yards"])
        for row in agg.iter_rows(named=True)
    }


# ---------- career feature reducer ----------


def _career_features(
    seasons_df: pl.DataFrame,
    *,
    pss_wide: pl.DataFrame,
    rb_id: int,
) -> dict[str, float]:
    if seasons_df.height == 0:
        return {}
    s = seasons_df.sort("season")
    sum_ = s.sum()
    n = s.height

    rush_att = int(sum_["rush_attempts"][0])
    rush_yds = int(sum_["rush_yards"][0])
    rush_tds = int(sum_["rush_tds"][0])
    games = int(s["games_played"].sum())
    targets = int(sum_["targets"][0])
    receptions = int(sum_["receptions"][0])
    rec_yds = int(sum_["rec_yards"][0])
    rec_tds = int(sum_["rec_tds"][0])
    opp_carries = int(sum_["opportunity_carries"][0])
    highlight_yds = int(sum_["highlight_yards"][0])

    f: dict[str, float] = {}

    # --- rushing efficiency ---
    f["rb_epa_per_rush"] = _safe_div(float(sum_["ppa_rush"][0]), rush_att)
    f["rb_success_rate"] = _safe_div(int(sum_["rush_success"][0]), rush_att)
    f["rb_explosive_rate"] = _safe_div(int(sum_["rush_explosive"][0]), rush_att)
    f["rb_stuff_rate"] = _safe_div(int(sum_["rush_stuffed"][0]), rush_att)
    f["rb_opportunity_rate"] = _safe_div(opp_carries, rush_att)
    f["rb_highlight_yards_per_opportunity"] = _safe_div(highlight_yds, opp_carries, ndigits=2)

    # --- situational ---
    f["rb_epa_per_rush_early_down"] = _safe_div(
        float(sum_["ppa_rush_early"][0]), int(sum_["rush_early_down"][0])
    )
    f["rb_epa_per_rush_third_short"] = _safe_div(
        float(sum_["ppa_rush_third_short"][0]), int(sum_["rush_third_short"][0])
    )

    # --- receiving ---
    f["rb_targets_per_game"] = _safe_div(targets, games)
    f["rb_catch_rate"] = _safe_div(receptions, targets)
    f["rb_yards_per_reception"] = _safe_div(rec_yds, receptions)
    f["rb_receiving_yards_per_game"] = _safe_div(rec_yds, games, ndigits=1)

    # rb_receiving_yards_share via pss_wide (more reliable than parsed sums)
    team_rec_lookup = _team_rec_yds_lookup(pss_wide)
    player_team_seasons = (
        pss_wide.filter(pl.col("espn_id") == rb_id)
        .select(["team", "season", "rec_yards"])
        .to_dicts()
    )
    if player_team_seasons:
        num = sum((row["rec_yards"] or 0) for row in player_team_seasons)
        den = sum(
            team_rec_lookup.get((row["team"], int(row["season"])), 0)
            for row in player_team_seasons
        )
        f["rb_receiving_yards_share"] = _safe_div(num, den, ndigits=4)

    # --- workload ---
    f["rb_touches_per_game"] = _safe_div(rush_att + receptions, games)
    f["rb_weighted_opportunity_per_game"] = _safe_div(rush_att + 2 * targets, games, ndigits=2)

    # workload_concentration: avg over seasons of (player rush yds / team rush yds).
    team_rush_lookup = _team_rushing_yds_lookup(pss_wide)
    if player_team_seasons:
        rb_seasons = s.to_dicts()
        shares = []
        for row in player_team_seasons:
            team = row["team"]
            season = int(row["season"])
            team_rush = team_rush_lookup.get((team, season), 0)
            this_season = next(
                (r for r in rb_seasons if int(r["season"]) == season), None
            )
            player_rush = this_season["rush_yards"] if this_season else (row.get("rush_yards") or 0)
            if team_rush and team_rush > 0:
                shares.append(player_rush / team_rush)
        if shares:
            f["rb_workload_concentration"] = round(sum(shares) / len(shares), 3)

    # --- yards per team play (Zachariason) ---
    team_plays_lookup = _team_total_plays_lookup(pss_wide)
    if player_team_seasons:
        team_plays_total = sum(
            team_plays_lookup.get((row["team"], int(row["season"])), 0)
            for row in player_team_seasons
        )
        f["rb_yards_per_team_play"] = _safe_div(rush_yds + rec_yds, team_plays_total, ndigits=3)

    # --- expected_tds_minus_actual (Mike Clay TD regression) ---
    expected_tds = float(sum_["expected_rush_tds"][0]) + float(sum_["expected_catch_tds"][0])
    actual_tds = rush_tds + rec_tds
    f["rb_expected_tds_minus_actual"] = round(actual_tds - expected_tds, 2)

    # --- final_year_dominator (replaces yoy_yards_slope) ---
    team_scrim_lookup = _team_total_scrim_yds_lookup(pss_wide)
    last_season_row = s.tail(1).to_dicts()[0]
    last_team = last_season_row["team"]
    last_season = int(last_season_row["season"])
    team_scrim = team_scrim_lookup.get((last_team, last_season), 0)
    if team_scrim > 0:
        player_last_scrim = (last_season_row["rush_yards"] or 0) + (last_season_row["rec_yards"] or 0)
        f["rb_final_year_dominator"] = round(player_last_scrim / team_scrim, 3)

    return {k: v for k, v in f.items() if v is not None}


# ---------- top-level ----------


@dataclass
class RBContext:
    plays: pl.DataFrame
    seasons: pl.DataFrame


def build_rb_context(
    attributed_plays: pl.DataFrame,
    rb_canon_ids: set[int],
) -> RBContext:
    """Filter shared cohort plays to RB-relevant rows and aggregate.

    A play is RB-relevant when rusher_id (rushing plays) or receiver_id
    (RB receptions) matches a cohort RB. Role column derived from which
    id matched.
    """
    if attributed_plays.height == 0 or not rb_canon_ids:
        return RBContext(plays=pl.DataFrame(), seasons=pl.DataFrame())

    rb_id_list = list(rb_canon_ids)
    plays = attributed_plays.filter(
        pl.col("rusher_id").is_in(rb_id_list)
        | pl.col("receiver_id").is_in(rb_id_list)
    ).with_columns([
        pl.coalesce([
            pl.when(pl.col("rusher_id").is_in(rb_id_list)).then(pl.col("rusher_id")),
            pl.when(pl.col("receiver_id").is_in(rb_id_list)).then(pl.col("receiver_id")),
        ]).alias("rb_id"),
        pl.when(pl.col("rusher_id").is_in(rb_id_list))
            .then(pl.lit("rusher"))
            .otherwise(pl.lit("receiver"))
            .alias("role"),
    ])
    seasons = _aggregate_per_season(plays) if plays.height > 0 else pl.DataFrame()
    return RBContext(plays=plays, seasons=seasons)


def compute(
    profile: PlayerProfile,
    ctx: RBContext,
    *,
    pfr_to_canon_id: dict[str, int],
    pss_wide: pl.DataFrame,
) -> dict[str, float]:
    """Compute RB features for a single profile. No-op for non-RB profiles."""
    if profile.position != Position.RB:
        return {}
    if ctx.seasons.height == 0:
        return {}
    rb_id = pfr_to_canon_id.get(profile.player_id)
    if rb_id is None:
        return {}
    seasons_df = ctx.seasons.filter(pl.col("rb_id") == rb_id)
    if seasons_df.height == 0:
        return {}
    return _career_features(seasons_df, pss_wide=pss_wide, rb_id=rb_id)
