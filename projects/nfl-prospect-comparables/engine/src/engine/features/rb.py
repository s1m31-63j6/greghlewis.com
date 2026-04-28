"""RB feature engineering.

Reads the shared cohort-attributed plays frame (engine.parse.attribute) plus
`cfbd/player_season_stats` aggregates (via universal CohortContext.pss_wide)
for receiving share and team-level denominators.

Implementable now (17 features):
  efficiency:    epa_per_rush, ypc, success_rate, explosive_rate, stuff_rate
  situational:   epa_per_rush_early_down, epa_per_rush_third_short,
                 goalline_td_rate
  receiving:     targets_per_game, catch_rate, yards_per_reception,
                 receiving_yards_share
  workload:      touches_per_game, career_touches, workload_concentration
  trajectory:    yoy_yards_slope, breakout_season

Deferred (no public data without PFF/charting):
  yards_over_expected, perf_vs_stacked_box, perf_vs_light_box,
  snap_share_peak, route_participation_proxy, yac_per_reception.
"""

from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from engine.schema import PlayerProfile, Position


# ---------- aggregations ----------


def _safe_div(num, den, *, default=None, ndigits=3):
    if den is None or den == 0:
        return default
    return round(num / den, ndigits)


def _aggregate_per_season(plays: pl.DataFrame) -> pl.DataFrame:
    """Per (rb_id, season) aggregates split by role."""
    not_two_point = ~pl.col("is_two_point")
    is_rusher = (pl.col("role") == "rusher") & not_two_point
    is_receiver = (pl.col("role") == "receiver") & not_two_point
    is_catch = is_receiver & pl.col("parsed_type").is_in(["pass_complete", "pass_td"])

    df = plays.with_columns([
        is_rusher.alias("_is_rusher"),
        is_receiver.alias("_is_receiver"),
        is_catch.alias("_is_catch"),
    ])
    return (
        df.group_by(["rb_id", "season"])
        .agg([
            pl.col("game_id").n_unique().alias("games_played"),
            # Rushing
            pl.col("_is_rusher").sum().alias("rush_attempts"),
            (pl.col("_is_rusher").cast(pl.Int64) * pl.col("yards_gained").fill_null(0)).sum().alias("rush_yards"),
            ((pl.col("parsed_type") == "rush_td") & not_two_point).sum().alias("rush_tds"),
            (pl.col("_is_rusher").cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_rush"),
            (pl.col("_is_rusher") & (pl.col("ppa") > 0)).sum().alias("rush_success"),
            (pl.col("_is_rusher") & (pl.col("yards_gained") >= 10)).sum().alias("rush_explosive"),
            (pl.col("_is_rusher") & (pl.col("yards_gained") <= 0)).sum().alias("rush_stuffed"),
            # Situational
            (pl.col("_is_rusher") & (pl.col("down") <= 2)).sum().alias("rush_early_down"),
            ((pl.col("_is_rusher") & (pl.col("down") <= 2)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_rush_early"),
            (pl.col("_is_rusher") & (pl.col("down") == 3) & (pl.col("distance") <= 2)).sum().alias("rush_third_short"),
            ((pl.col("_is_rusher") & (pl.col("down") == 3) & (pl.col("distance") <= 2)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_rush_third_short"),
            (pl.col("_is_rusher") & (pl.col("yards_to_goal") <= 5)).sum().alias("rush_goalline"),
            (pl.col("_is_rusher") & (pl.col("yards_to_goal") <= 5) & pl.col("is_touchdown")).sum().alias("rush_goalline_tds"),
            # Receiving
            pl.col("_is_receiver").sum().alias("targets"),
            pl.col("_is_catch").sum().alias("receptions"),
            (pl.col("_is_catch").cast(pl.Int64) * pl.col("yards_gained").fill_null(0)).sum().alias("rec_yards"),
            ((pl.col("_is_catch") & pl.col("is_touchdown")).cast(pl.Int64)).sum().alias("rec_tds"),
        ])
    )


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
    """Reduce per-season RB aggregates → career features."""
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

    f: dict[str, float] = {}

    # --- rushing efficiency ---
    f["rb_epa_per_rush"] = _safe_div(float(sum_["ppa_rush"][0]), rush_att)
    f["rb_ypc"] = _safe_div(rush_yds, rush_att)
    f["rb_success_rate"] = _safe_div(int(sum_["rush_success"][0]), rush_att)
    f["rb_explosive_rate"] = _safe_div(int(sum_["rush_explosive"][0]), rush_att)
    f["rb_stuff_rate"] = _safe_div(int(sum_["rush_stuffed"][0]), rush_att)

    # --- situational ---
    f["rb_epa_per_rush_early_down"] = _safe_div(
        float(sum_["ppa_rush_early"][0]), int(sum_["rush_early_down"][0])
    )
    f["rb_epa_per_rush_third_short"] = _safe_div(
        float(sum_["ppa_rush_third_short"][0]), int(sum_["rush_third_short"][0])
    )
    f["rb_goalline_td_rate"] = _safe_div(
        int(sum_["rush_goalline_tds"][0]), int(sum_["rush_goalline"][0])
    )

    # --- receiving ---
    f["rb_targets_per_game"] = _safe_div(targets, games)
    f["rb_catch_rate"] = _safe_div(receptions, targets)
    f["rb_yards_per_reception"] = _safe_div(rec_yds, receptions)

    # rb_receiving_yards_share via pss_wide for the player's team-seasons.
    # pss_wide is more reliable than parsed yard sums for share denominators.
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
    f["rb_career_touches"] = float(rush_att + receptions)
    f["rb_touches_per_game"] = _safe_div(rush_att + receptions, games)

    # workload_concentration: avg over seasons of (player rush yds / team rush yds).
    # High = bell-cow back; low = committee.
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

    # --- trajectory ---
    if n >= 2:
        scrim_by_season = []
        for row in s.iter_rows(named=True):
            scrim = (row["rush_yards"] or 0) + (row["rec_yards"] or 0)
            scrim_by_season.append((row["season"], scrim))
        xs = [p[0] for p in scrim_by_season]
        ys = [p[1] for p in scrim_by_season]
        x_mean = sum(xs) / len(xs)
        y_mean = sum(ys) / len(ys)
        num = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(len(xs)))
        den = sum((x - x_mean) ** 2 for x in xs)
        if den > 0:
            f["rb_yoy_yards_slope"] = round(num / den, 1)

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
    """Filter the shared cohort plays to RB-relevant rows and aggregate.

    A play is RB-relevant when the rusher_id (running plays) or receiver_id
    (pass plays — RBs are pass catchers too) matches a cohort RB. The role
    column is derived from which id matched.
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
