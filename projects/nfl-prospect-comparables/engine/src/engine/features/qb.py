"""QB feature engineering — efficiency, situational splits, mobility, trajectory.

Reads the shared cohort-attributed plays frame produced by
`engine.parse.attribute.build_attributed_plays` (parser + resolver were
applied once across all positions). This module filters that frame to
plays where the QB is the passer or rusher and computes per-season
aggregates.

What we compute (Tier 1 — implementable from parsed plays + PPA):
  efficiency:    epa_per_db, success_rate, completion_pct, ypa, adjusted_ypa,
                 td_rate, int_rate, td_to_int
  volume:        total_attempts, attempts_per_game, dropbacks_per_game
  situational:   epa_per_db_{3rd_down, red_zone, late_close, leading, tied, trailing}
                 redzone_td_rate, third_down_conversion_rate, garbage_time_share
  mobility:      rush_rate, yards_per_rush, rush_td_rate, sack_rate
  trajectory:    epa_yoy_slope, final_year_epa_z

What we explicitly DO NOT compute (no public-data path without PFF):
  cpoe, adot, air_yards_per_attempt, deep_attempt_share, deep_completion_pct,
  yac_per_completion, scramble_rate, designed_run_rate, pressure_to_sack
  → flagged in feature catalog and methodology page.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

import polars as pl

from engine.schema import PlayerProfile, Position


PASS_TYPES = ("pass_complete", "pass_incomplete", "pass_int", "pass_td")
COMPLETION_TYPES = ("pass_complete", "pass_td")


# ---------- aggregation ----------


def _safe_div(num, den, *, default=None, ndigits=3):
    if den is None or den == 0:
        return default
    return round(num / den, ndigits)


def _aggregate_per_season(df: pl.DataFrame) -> pl.DataFrame:
    """Per (qb_id, season) aggregates that downstream features key off."""
    is_pass = pl.col("parsed_type").is_in(list(PASS_TYPES))
    is_completion = pl.col("parsed_type").is_in(list(COMPLETION_TYPES))
    is_dropback = is_pass | (pl.col("parsed_type") == "sack")
    is_qb_rush = pl.col("parsed_type").is_in(["rush", "rush_td"])
    not_two_point = ~pl.col("is_two_point")

    return (
        df.with_columns([
            (is_pass & not_two_point).alias("_is_pass"),
            (is_completion & not_two_point).alias("_is_completion"),
            (is_dropback & not_two_point).alias("_is_dropback"),
            is_qb_rush.alias("_is_qb_rush"),
        ])
        .group_by(["qb_id", "season"])
        .agg([
            pl.col("game_id").n_unique().alias("games_played"),
            pl.col("_is_pass").sum().alias("pass_attempts"),
            pl.col("_is_completion").sum().alias("completions"),
            pl.col("_is_dropback").sum().alias("dropbacks"),
            (pl.col("parsed_type") == "sack").sum().alias("sacks"),
            (pl.col("parsed_type") == "pass_td").sum().alias("pass_tds"),
            (pl.col("parsed_type") == "pass_int").sum().alias("interceptions"),
            (pl.col("_is_pass").cast(pl.Int64) * pl.col("yards_gained").fill_null(0)).sum().alias("pass_yards"),
            pl.col("_is_qb_rush").sum().alias("rush_attempts"),
            (pl.col("_is_qb_rush").cast(pl.Int64) * pl.col("yards_gained").fill_null(0)).sum().alias("rush_yards"),
            ((pl.col("parsed_type") == "rush_td").cast(pl.Int64)).sum().alias("rush_tds"),
            (pl.col("_is_dropback").cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_dropbacks"),
            (pl.col("_is_dropback") & (pl.col("ppa") > 0)).sum().alias("ppa_positive_dropbacks"),
            (pl.col("_is_dropback") & (pl.col("down") == 3)).sum().alias("dropbacks_3rd"),
            ((pl.col("_is_dropback") & (pl.col("down") == 3)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_3rd"),
            (pl.col("_is_dropback") & (pl.col("yards_to_goal") <= 20)).sum().alias("dropbacks_rz"),
            ((pl.col("_is_dropback") & (pl.col("yards_to_goal") <= 20)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_rz"),
            (pl.col("_is_dropback") & (pl.col("period") == 4) & (pl.col("score_diff").abs() <= 8)).sum().alias("dropbacks_late_close"),
            ((pl.col("_is_dropback") & (pl.col("period") == 4) & (pl.col("score_diff").abs() <= 8)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_late_close"),
            (pl.col("_is_dropback") & (pl.col("score_diff") < 0)).sum().alias("dropbacks_trailing"),
            ((pl.col("_is_dropback") & (pl.col("score_diff") < 0)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_trailing"),
            (pl.col("_is_dropback") & (pl.col("score_diff") > 0)).sum().alias("dropbacks_leading"),
            ((pl.col("_is_dropback") & (pl.col("score_diff") > 0)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_leading"),
            (pl.col("_is_dropback") & (pl.col("score_diff") == 0)).sum().alias("dropbacks_tied"),
            ((pl.col("_is_dropback") & (pl.col("score_diff") == 0)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_tied"),
            (pl.col("_is_dropback") & (pl.col("period") == 4) & (pl.col("score_diff").abs() > 16)).sum().alias("dropbacks_garbage"),
            (
                pl.col("_is_dropback") & (pl.col("down") == 3)
                & (pl.col("is_first_down") | pl.col("is_touchdown"))
            ).sum().alias("third_down_conversions"),
            (pl.col("_is_dropback") & (pl.col("yards_to_goal") <= 20) & pl.col("is_touchdown")).sum().alias("rz_tds"),
        ])
    )


def _career_features(seasons_df: pl.DataFrame) -> dict[str, float]:
    """Reduce per-season aggregates → career feature values for one QB."""
    if seasons_df.height == 0:
        return {}
    s = seasons_df.sort("season")
    sum_ = s.sum()
    n = s.height
    pass_att = int(sum_["pass_attempts"][0])
    completions = int(sum_["completions"][0])
    dropbacks = int(sum_["dropbacks"][0])
    sacks = int(sum_["sacks"][0])
    pass_yards = int(sum_["pass_yards"][0])
    pass_tds = int(sum_["pass_tds"][0])
    interceptions = int(sum_["interceptions"][0])
    rush_att = int(sum_["rush_attempts"][0])
    rush_yards = int(sum_["rush_yards"][0])
    rush_tds = int(sum_["rush_tds"][0])
    games = int(s["games_played"].sum())
    ppa_db = float(sum_["ppa_dropbacks"][0])

    f: dict[str, float] = {}
    # Volume
    f["qb_total_attempts"] = float(pass_att)
    f["qb_attempts_per_game"] = _safe_div(pass_att, games)
    f["qb_dropbacks_per_game"] = _safe_div(dropbacks, games)

    # Efficiency
    f["qb_epa_per_db"] = _safe_div(ppa_db, dropbacks)
    f["qb_success_rate"] = _safe_div(int(sum_["ppa_positive_dropbacks"][0]), dropbacks)
    f["qb_completion_pct"] = _safe_div(completions, pass_att)
    f["qb_ypa"] = _safe_div(pass_yards, pass_att)
    if pass_att > 0:
        # Adjusted Y/A: (yards + 20*TD - 45*INT) / attempts (PFR formula)
        f["qb_adjusted_ypa"] = round(
            (pass_yards + 20 * pass_tds - 45 * interceptions) / pass_att, 2
        )
    f["qb_td_rate"] = _safe_div(pass_tds, pass_att)
    f["qb_int_rate"] = _safe_div(interceptions, pass_att)
    if interceptions > 0:
        f["qb_td_to_int"] = round(min(pass_tds / interceptions, 20.0), 2)
    elif pass_tds > 0:
        f["qb_td_to_int"] = 20.0  # cap when no INTs

    # Mobility
    f["qb_sack_rate"] = _safe_div(sacks, dropbacks)
    f["qb_rush_rate"] = _safe_div(rush_att, dropbacks + rush_att)
    f["qb_yards_per_rush"] = _safe_div(rush_yards, rush_att)
    f["qb_rush_td_rate"] = _safe_div(rush_tds, rush_att)

    # Situational
    f["qb_epa_per_db_3rd_down"] = _safe_div(float(sum_["ppa_3rd"][0]), int(sum_["dropbacks_3rd"][0]))
    f["qb_epa_per_db_red_zone"] = _safe_div(float(sum_["ppa_rz"][0]), int(sum_["dropbacks_rz"][0]))
    f["qb_epa_per_db_late_close"] = _safe_div(float(sum_["ppa_late_close"][0]), int(sum_["dropbacks_late_close"][0]))
    f["qb_epa_per_db_trailing"] = _safe_div(float(sum_["ppa_trailing"][0]), int(sum_["dropbacks_trailing"][0]))
    f["qb_epa_per_db_leading"] = _safe_div(float(sum_["ppa_leading"][0]), int(sum_["dropbacks_leading"][0]))
    f["qb_epa_per_db_tied"] = _safe_div(float(sum_["ppa_tied"][0]), int(sum_["dropbacks_tied"][0]))
    f["qb_third_down_conversion_rate"] = _safe_div(int(sum_["third_down_conversions"][0]), int(sum_["dropbacks_3rd"][0]))
    f["qb_redzone_td_rate"] = _safe_div(int(sum_["rz_tds"][0]), int(sum_["dropbacks_rz"][0]))
    f["qb_garbage_time_share"] = _safe_div(int(sum_["dropbacks_garbage"][0]), dropbacks)

    # Trajectory
    if n >= 2:
        per_season_epa = []
        for row in s.iter_rows(named=True):
            db = row["dropbacks"]
            if db and db > 0:
                per_season_epa.append((row["season"], row["ppa_dropbacks"] / db))
        if len(per_season_epa) >= 2:
            xs = [p[0] for p in per_season_epa]
            ys = [p[1] for p in per_season_epa]
            x_mean = sum(xs) / len(xs)
            y_mean = sum(ys) / len(ys)
            num = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(len(xs)))
            den = sum((x - x_mean) ** 2 for x in xs)
            if den > 0:
                f["qb_epa_yoy_slope"] = round(num / den, 4)
            if len(ys) >= 3 and statistics.pstdev(ys[:-1]) > 0:
                prior_mean = statistics.mean(ys[:-1])
                prior_std = statistics.pstdev(ys[:-1])
                z = (ys[-1] - prior_mean) / prior_std
                # Clip to ±5 — final-year-z explodes with near-zero prior_std
                # for transfer QBs and true-frosh breakouts.
                f["qb_final_year_epa_z"] = round(max(-5.0, min(5.0, z)), 2)

    return {k: v for k, v in f.items() if v is not None}


# ---------- top-level ----------


@dataclass
class QBContext:
    plays: pl.DataFrame   # QB-attributed plays (filtered from shared frame)
    seasons: pl.DataFrame  # per-(qb_id, season) aggregates


def build_qb_context(
    attributed_plays: pl.DataFrame,
    qb_canon_ids: set[int],
) -> QBContext:
    """Filter the shared cohort plays to QB-relevant rows and aggregate."""
    if attributed_plays.height == 0 or not qb_canon_ids:
        return QBContext(plays=pl.DataFrame(), seasons=pl.DataFrame())

    qb_id_list = list(qb_canon_ids)
    plays = attributed_plays.filter(
        pl.col("passer_id").is_in(qb_id_list)
        | pl.col("rusher_id").is_in(qb_id_list)
    ).with_columns(
        # The QB's id is the passer for pass plays / sacks, the rusher for QB
        # rushes. Coalesce works because a play doesn't have both roles set on
        # the QB simultaneously.
        pl.coalesce([
            pl.when(pl.col("passer_id").is_in(qb_id_list)).then(pl.col("passer_id")),
            pl.when(pl.col("rusher_id").is_in(qb_id_list)).then(pl.col("rusher_id")),
        ]).alias("qb_id")
    )
    seasons = _aggregate_per_season(plays) if plays.height > 0 else pl.DataFrame()
    return QBContext(plays=plays, seasons=seasons)


def compute(
    profile: PlayerProfile,
    ctx: QBContext,
    *,
    pfr_to_canon_id: dict[str, int],
) -> dict[str, float]:
    """Compute QB features for a single profile. No-op for non-QB profiles."""
    if profile.position != Position.QB:
        return {}
    if ctx.seasons.height == 0:
        return {}
    qb_id = pfr_to_canon_id.get(profile.player_id)
    if qb_id is None:
        return {}
    seasons_df = ctx.seasons.filter(pl.col("qb_id") == qb_id)
    if seasons_df.height == 0:
        return {}
    return _career_features(seasons_df)
