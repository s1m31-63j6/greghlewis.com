"""QB feature engineering — public-PBP gold-standard set, audited 2026-04-28
against the QB-analyst community (Ben Baldwin / OSF, Hayden Winks, Eric Eager,
PFF, Steve Palazzolo, Cynthia Frelund, Brian Burke / Total QBR, Football
Outsiders DVOA, Bill Connelly / SP+, Kevin Cole / Unexpected Points,
Mockdraftable / Pat Kerrane).

Reads the shared cohort-attributed plays frame (engine.parse.attribute) and
its defense_pass_epa frame for opponent-adjusted residuals. Filters the
frame to plays where the QB is the passer or rusher and computes per-season
aggregates.

20 features computed (see catalog.QB_FEATURES). The hard public-data
ceiling is air yards, pressure data, and PFF charting (BTT% / TWP% /
CPOE / aDOT). 12 deferred specs in catalog.QB_DEFERRED, including the
two model-based v1.1 candidates (xPass PROE, EPA-over-expected baseline
regression).

Headline analyst-framework concepts in this set:
  - early_down_epa_per_db (Baldwin) — "the cleanest passer-quality signal"
    because late-down EPA is dominated by situation
  - isoppp_pass (Connelly / SP+) — pure explosiveness on successful
    dropbacks, decoupled from efficiency
  - clutch_weighted_epa_per_db (Burke / Total QBR) — continuous WP-weighted
    leverage; replaces 5 partition splits (leading/tied/trailing/late-close/
    garbage_time) with one less-noisy signal
  - opponent_adj_epa_per_db (Burke / Connelly) — per-play EPA residual
    against opponent's season pass-defense baseline; schedule strength
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

import polars as pl

from engine.schema import PlayerProfile, Position


PASS_TYPES = ("pass_complete", "pass_incomplete", "pass_int", "pass_td")
COMPLETION_TYPES = ("pass_complete", "pass_td")


def _safe_div(num, den, *, default=None, ndigits=3):
    if den is None or den == 0:
        return default
    return round(num / den, ndigits)


# ---------- aggregation ----------


def _aggregate_per_season(df: pl.DataFrame) -> pl.DataFrame:
    """Per (qb_id, season) aggregates that downstream features key off.

    Expects `df` to already include `qb_id` (filtered + coalesced) and
    `opp_mean_ppa` (joined from defense_pass_epa) columns.
    """
    is_pass = pl.col("parsed_type").is_in(list(PASS_TYPES))
    is_completion = pl.col("parsed_type").is_in(list(COMPLETION_TYPES))
    is_dropback = is_pass | (pl.col("parsed_type") == "sack")
    is_qb_rush = pl.col("parsed_type").is_in(["rush", "rush_td"])
    not_two_point = ~pl.col("is_two_point")

    # Clutch weight per dropback: continuous WP-leverage approximation.
    # Late-and-close (4Q, |score| ≤ 8) ~ weight 1.5+
    # Garbage time (4Q, |score| > 16) ~ weight ~0.3
    # Mid-game close ~ weight 1.0
    clutch_w = (
        (-pl.col("score_diff").abs().cast(pl.Float64) / 14.0).exp()
        * (1.0 + 0.5 * (pl.col("period") >= 4).cast(pl.Float64))
    )

    return (
        df.with_columns([
            (is_pass & not_two_point).alias("_is_pass"),
            (is_completion & not_two_point).alias("_is_completion"),
            (is_dropback & not_two_point).alias("_is_dropback"),
            is_qb_rush.alias("_is_qb_rush"),
            clutch_w.alias("_clutch_w"),
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
            # Sum of ppa on successful dropbacks only — for isoppp_pass
            (
                (pl.col("_is_dropback") & (pl.col("ppa") > 0)).cast(pl.Float64)
                * pl.col("ppa").fill_null(0)
            ).sum().alias("ppa_successful"),
            # Early-down (1st/2nd) dropbacks — Baldwin's cleanest signal
            (pl.col("_is_dropback") & (pl.col("down") <= 2)).sum().alias("dropbacks_early"),
            (
                (pl.col("_is_dropback") & (pl.col("down") <= 2)).cast(pl.Int64)
                * pl.col("ppa").fill_null(0)
            ).sum().alias("ppa_early"),
            # Clutch-weighted EPA — continuous WP-leverage replacement for
            # leading/tied/trailing/late_close/garbage splits
            (pl.col("_is_dropback").cast(pl.Float64) * pl.col("_clutch_w")).sum().alias("clutch_weight_sum"),
            (
                pl.col("_is_dropback").cast(pl.Float64)
                * pl.col("_clutch_w")
                * pl.col("ppa").fill_null(0)
            ).sum().alias("clutch_ppa_sum"),
            # Opponent residual: ppa - opp_mean_ppa per dropback, summed
            (
                pl.col("_is_dropback").cast(pl.Float64)
                * (pl.col("ppa").fill_null(0) - pl.col("opp_mean_ppa").fill_null(0))
            ).sum().alias("opp_residual_sum"),
            (pl.col("_is_dropback") & pl.col("opp_mean_ppa").is_not_null()).sum().alias("dropbacks_with_opp"),
            # 3rd-down + red-zone splits we keep
            (pl.col("_is_dropback") & (pl.col("down") == 3)).sum().alias("dropbacks_3rd"),
            ((pl.col("_is_dropback") & (pl.col("down") == 3)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_3rd"),
            (pl.col("_is_dropback") & (pl.col("yards_to_goal") <= 20)).sum().alias("dropbacks_rz"),
            ((pl.col("_is_dropback") & (pl.col("yards_to_goal") <= 20)).cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_rz"),
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
    successful_dropbacks = int(sum_["ppa_positive_dropbacks"][0])

    f: dict[str, float] = {}

    # --- volume ---
    f["qb_total_attempts"] = float(pass_att)
    # qb_attempts_per_game dropped — r=0.997 redundant with qb_dropbacks_per_game
    # (sacks are ~6-7% of dropbacks). dropbacks is the unified denominator.
    f["qb_dropbacks_per_game"] = _safe_div(dropbacks, games)

    # --- efficiency ---
    f["qb_epa_per_db"] = _safe_div(ppa_db, dropbacks)
    f["qb_success_rate"] = _safe_div(successful_dropbacks, dropbacks)
    if pass_att > 0:
        f["qb_adjusted_ypa"] = round(
            (pass_yards + 20 * pass_tds - 45 * interceptions) / pass_att, 2
        )
    f["qb_int_rate"] = _safe_div(interceptions, pass_att)

    # IsoPPP — mean EPA on successful dropbacks only (Connelly explosiveness)
    f["qb_isoppp_pass"] = _safe_div(
        float(sum_["ppa_successful"][0]), successful_dropbacks, ndigits=3
    )

    # Early-down EPA/db (Baldwin)
    f["qb_early_down_epa_per_db"] = _safe_div(
        float(sum_["ppa_early"][0]), int(sum_["dropbacks_early"][0])
    )

    # Clutch-weighted EPA (Burke / Total QBR)
    f["qb_clutch_weighted_epa_per_db"] = _safe_div(
        float(sum_["clutch_ppa_sum"][0]), float(sum_["clutch_weight_sum"][0])
    )

    # Opponent-adjusted EPA (Burke / Connelly)
    f["qb_opponent_adj_epa_per_db"] = _safe_div(
        float(sum_["opp_residual_sum"][0]), int(sum_["dropbacks_with_opp"][0])
    )

    # --- mobility ---
    f["qb_sack_rate"] = _safe_div(sacks, dropbacks)
    f["qb_rush_rate"] = _safe_div(rush_att, dropbacks + rush_att)
    f["qb_yards_per_rush"] = _safe_div(rush_yards, rush_att)
    f["qb_rush_td_rate"] = _safe_div(rush_tds, rush_att)

    # --- situational (kept) ---
    f["qb_epa_per_db_3rd_down"] = _safe_div(float(sum_["ppa_3rd"][0]), int(sum_["dropbacks_3rd"][0]))
    f["qb_epa_per_db_red_zone"] = _safe_div(float(sum_["ppa_rz"][0]), int(sum_["dropbacks_rz"][0]))
    f["qb_redzone_td_rate"] = _safe_div(int(sum_["rz_tds"][0]), int(sum_["dropbacks_rz"][0]))

    # --- trajectory ---
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
                f["qb_final_year_epa_z"] = round(max(-5.0, min(5.0, z)), 2)

    return {k: v for k, v in f.items() if v is not None}


# ---------- top-level ----------


@dataclass
class QBContext:
    plays: pl.DataFrame
    seasons: pl.DataFrame


def build_qb_context(
    attributed_plays: pl.DataFrame,
    qb_canon_ids: set[int],
    *,
    defense_pass_epa: pl.DataFrame,
) -> QBContext:
    """Filter the shared cohort plays to QB-relevant rows, join opponent
    pass-defense EPA, and aggregate."""
    if attributed_plays.height == 0 or not qb_canon_ids:
        return QBContext(plays=pl.DataFrame(), seasons=pl.DataFrame())

    qb_id_list = list(qb_canon_ids)
    plays = attributed_plays.filter(
        pl.col("passer_id").is_in(qb_id_list)
        | pl.col("rusher_id").is_in(qb_id_list)
    ).with_columns(
        pl.coalesce([
            pl.when(pl.col("passer_id").is_in(qb_id_list)).then(pl.col("passer_id")),
            pl.when(pl.col("rusher_id").is_in(qb_id_list)).then(pl.col("rusher_id")),
        ]).alias("qb_id")
    )

    # Join opponent pass-defense EPA (mean_ppa per defense+season).
    if defense_pass_epa.height > 0:
        plays = plays.join(
            defense_pass_epa.select(["defense", "season", "mean_ppa"]).rename(
                {"mean_ppa": "opp_mean_ppa"}
            ),
            on=["defense", "season"],
            how="left",
        )
    else:
        plays = plays.with_columns(pl.lit(None, dtype=pl.Float64).alias("opp_mean_ppa"))

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
