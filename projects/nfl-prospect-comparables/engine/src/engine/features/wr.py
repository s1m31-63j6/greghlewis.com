"""WR feature engineering — public-PBP gold-standard set.

Reads the shared cohort-attributed plays frame (engine.parse.attribute) plus
universal CohortContext.pss_wide for player team-seasons + receiving totals,
and attribute.team_pass_dist for team-level pass-attempt denominators.

22 features computed (audited 2026-04-28 against WR-analyst frameworks —
Reception Perception, Hayden Winks, JJ Z, Eric Eager, PFF, PlayerProfiler,
Howard / Campus2Canton / Heath, Open Source Football). The hard public-data
ceiling is route counts and coverage labels; we substitute per-team-pass-
attempt denominators (RYPTPA / TPTPA / 1DPTPA) — the community standard for
free-data WR analytics.

13 deferred specs (route + coverage dependent) live in catalog.WR_DEFERRED
and will surface on the methodology page as the explicit public-data gap.
"""

from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from engine.schema import PlayerProfile, Position


CATCH_TYPES = ("pass_complete", "pass_td")
TARGET_TYPES = ("pass_complete", "pass_incomplete", "pass_int", "pass_td")


# ---------- aggregation ----------


def _safe_div(num, den, *, default=None, ndigits=3):
    if den is None or den == 0:
        return default
    return round(num / den, ndigits)


def _aggregate_per_season(plays: pl.DataFrame) -> pl.DataFrame:
    """Per (wr_id, season) aggregates."""
    not_two_point = ~pl.col("is_two_point")
    is_target = pl.col("parsed_type").is_in(list(TARGET_TYPES)) & not_two_point
    is_catch = pl.col("parsed_type").is_in(list(CATCH_TYPES)) & not_two_point
    is_int = (pl.col("parsed_type") == "pass_int") & not_two_point

    df = plays.with_columns([
        is_target.alias("_is_target"),
        is_catch.alias("_is_catch"),
        is_int.alias("_is_int"),
    ])
    return (
        df.group_by(["wr_id", "season"])
        .agg([
            pl.col("game_id").n_unique().alias("games_played"),
            # Primary team for the season — first encountered.
            pl.col("offense").first().alias("team"),
            pl.col("_is_target").sum().alias("targets"),
            pl.col("_is_catch").sum().alias("receptions"),
            (pl.col("_is_catch").cast(pl.Int64) * pl.col("yards_gained").fill_null(0)).sum().alias("rec_yards"),
            (pl.col("_is_catch") & pl.col("is_touchdown")).sum().alias("rec_tds"),
            pl.col("_is_int").sum().alias("intercepted_targets"),
            (pl.col("_is_target").cast(pl.Int64) * pl.col("ppa").fill_null(0)).sum().alias("ppa_targets"),
            (pl.col("_is_target") & (pl.col("ppa") > 0)).sum().alias("success_targets"),
            (pl.col("_is_catch") & (pl.col("yards_gained") >= 20)).sum().alias("big_plays"),
            (pl.col("_is_catch") & pl.col("is_first_down")).sum().alias("first_downs"),
            (pl.col("_is_target") & (pl.col("down") == 3)).sum().alias("third_down_targets"),
            (pl.col("_is_target") & (pl.col("yards_to_goal") <= 20)).sum().alias("rz_targets"),
        ])
    )


# ---------- team / teammate denominator helpers ----------


def _team_pass_lookup(team_pass_dist: pl.DataFrame, col: str) -> dict[tuple[str, int], int]:
    if team_pass_dist.height == 0:
        return {}
    return {
        (row["team"], int(row["season"])): int(row[col])
        for row in team_pass_dist.iter_rows(named=True)
    }


def _team_rec_yds_by_player(pss_wide: pl.DataFrame) -> dict[tuple[str, int], list[int]]:
    """Per (team, season) → list of every player's rec_yards. Used for
    `wr_yards_above_teammate_pct` (top-teammate denominator)."""
    out: dict[tuple[str, int], list[int]] = {}
    for row in pss_wide.iter_rows(named=True):
        key = (row["team"], int(row["season"]))
        out.setdefault(key, []).append(int(row["rec_yards"] or 0))
    return out


def _team_rec_totals(pss_wide: pl.DataFrame) -> dict[tuple[str, int], tuple[int, int, int]]:
    """Per (team, season) → (team_rec_yards, team_receptions, team_rec_tds).
    Used for wr_target_premium (YPC-baseline) and dominator denominators."""
    agg = (
        pss_wide
        .group_by(["team", "season"])
        .agg([
            pl.col("rec_yards").fill_null(0).sum().alias("team_rec_yards"),
            pl.col("receptions").fill_null(0).sum().alias("team_receptions"),
            pl.col("rec_tds").fill_null(0).sum().alias("team_rec_tds"),
        ])
    )
    return {
        (row["team"], int(row["season"])): (
            int(row["team_rec_yards"]),
            int(row["team_receptions"]),
            int(row["team_rec_tds"]),
        )
        for row in agg.iter_rows(named=True)
    }


# ---------- career feature reducer ----------


def _career_features(
    seasons_df: pl.DataFrame,
    *,
    pss_wide: pl.DataFrame,
    team_pass_dist: pl.DataFrame,
    wr_id: int,
    birthdate=None,  # datetime.date | None — for wr_breakout_age_dominator
) -> dict[str, float]:
    if seasons_df.height == 0:
        return {}
    s = seasons_df.sort("season")
    sum_ = s.sum()
    n = s.height

    targets = int(sum_["targets"][0])
    receptions = int(sum_["receptions"][0])
    rec_yards = int(sum_["rec_yards"][0])
    rec_tds = int(sum_["rec_tds"][0])
    interceptions = int(sum_["intercepted_targets"][0])
    games = int(s["games_played"].sum())
    big_plays = int(sum_["big_plays"][0])
    first_downs = int(sum_["first_downs"][0])
    third_down_targets = int(sum_["third_down_targets"][0])
    rz_targets = int(sum_["rz_targets"][0])

    f: dict[str, float] = {}

    # --- volume / production ---
    f["wr_targets_per_game"] = _safe_div(targets, games)
    f["wr_yards_per_game"] = _safe_div(rec_yards, games, ndigits=1)
    f["wr_rec_per_game"] = _safe_div(receptions, games)
    f["wr_td_per_game"] = _safe_div(rec_tds, games)
    f["wr_big_play_rate"] = _safe_div(big_plays, games)
    f["wr_first_down_per_rec"] = _safe_div(first_downs, receptions)

    # --- efficiency ---
    f["wr_catch_rate"] = _safe_div(receptions, targets)
    f["wr_epa_per_target"] = _safe_div(float(sum_["ppa_targets"][0]), targets)
    f["wr_success_rate"] = _safe_div(int(sum_["success_targets"][0]), targets)

    # WR rating: NFL passer rating formula treating WR's targets as attempts.
    # Each component clamped to [0, 2.375], averaged, scaled to ~158.3 max.
    if targets > 0:
        a = max(0.0, min(2.375, ((receptions / targets) - 0.3) * 5))
        b = max(0.0, min(2.375, ((rec_yards / targets) - 3) * 0.25))
        c = max(0.0, min(2.375, (rec_tds / targets) * 20))
        d = max(0.0, min(2.375, 2.375 - ((interceptions / targets) * 25)))
        f["wr_rating"] = round(((a + b + c + d) / 6) * 100, 1)

    # --- per-team-pass-attempt family ---
    pass_att_lookup = _team_pass_lookup(team_pass_dist, "pass_attempts")
    third_dn_lookup = _team_pass_lookup(team_pass_dist, "third_down_pass_attempts")
    rz_lookup = _team_pass_lookup(team_pass_dist, "red_zone_pass_attempts")

    wr_team_seasons = [(row["team"], int(row["season"])) for row in s.iter_rows(named=True)]
    team_pass_total = sum(pass_att_lookup.get(ts, 0) for ts in wr_team_seasons)
    team_3rd_total = sum(third_dn_lookup.get(ts, 0) for ts in wr_team_seasons)
    team_rz_total = sum(rz_lookup.get(ts, 0) for ts in wr_team_seasons)

    f["wr_ryptpa"] = _safe_div(rec_yards, team_pass_total, ndigits=3)
    f["wr_tptpa"] = _safe_div(targets, team_pass_total, ndigits=4)
    f["wr_1dptpa"] = _safe_div(first_downs, team_pass_total, ndigits=4)

    # --- situational target shares ---
    f["wr_third_down_target_share"] = _safe_div(third_down_targets, team_3rd_total, ndigits=3)
    f["wr_red_zone_target_share"] = _safe_div(rz_targets, team_rz_total, ndigits=3)

    # --- premium / above-teammate (uses pss_wide for team-level rec totals) ---
    rec_totals = _team_rec_totals(pss_wide)
    by_player = _team_rec_yds_by_player(pss_wide)

    # wr_target_premium: player YPC minus teammate YPC (across his team-seasons).
    # YPT-based version isn't feasible in college (no team-level target counts);
    # YPC is the closest viable substitute.
    if receptions > 0:
        teammate_yds = 0
        teammate_recs = 0
        for ts in wr_team_seasons:
            tot_yds, tot_rec, _ = rec_totals.get(ts, (0, 0, 0))
            # subtract self via per-season aggregates
            self_row = next(
                (r for r in s.iter_rows(named=True) if r["team"] == ts[0] and r["season"] == ts[1]),
                None,
            )
            self_yds = self_row["rec_yards"] if self_row else 0
            self_rec = self_row["receptions"] if self_row else 0
            teammate_yds += tot_yds - self_yds
            teammate_recs += tot_rec - self_rec
        if teammate_recs > 0:
            self_ypc = rec_yards / receptions
            mate_ypc = teammate_yds / teammate_recs
            f["wr_target_premium"] = round(self_ypc - mate_ypc, 2)

    # wr_yards_above_teammate_pct: self rec_yards / max(teammate rec_yards), per
    # team-season, then averaged. Hog Rate analogue without snap shares.
    pcts = []
    for ts in wr_team_seasons:
        peers = by_player.get(ts, [])
        self_row = next(
            (r for r in s.iter_rows(named=True) if r["team"] == ts[0] and r["season"] == ts[1]),
            None,
        )
        self_yds = self_row["rec_yards"] if self_row else 0
        # exclude self by removing one occurrence of self_yds (if present)
        peers_excl_self = list(peers)
        try:
            peers_excl_self.remove(self_yds)
        except ValueError:
            pass
        top_mate = max(peers_excl_self) if peers_excl_self else 0
        if top_mate > 0:
            pcts.append(self_yds / top_mate)
    if pcts:
        f["wr_yards_above_teammate_pct"] = round(sum(pcts) / len(pcts), 3)

    # --- trajectory ---
    # Per-season dominator: mean of (yards_share, td_share). Both denominators
    # come from rec_totals (one polars groupby; no per-season filter calls).
    season_doms: list[tuple[int, float]] = []
    season_yards_per_game: list[tuple[int, float]] = []
    season_target_shares: list[tuple[int, float]] = []
    for row in s.iter_rows(named=True):
        ts = (row["team"], row["season"])
        tot_yds, _, team_tds = rec_totals.get(ts, (0, 0, 0))
        yards_share = (row["rec_yards"] / tot_yds) if tot_yds > 0 else 0.0
        td_share = (row["rec_tds"] / team_tds) if team_tds > 0 else 0.0
        dom = (yards_share + td_share) / 2 if (tot_yds > 0 or team_tds > 0) else 0.0
        if dom > 0:
            season_doms.append((row["season"], dom))
        if row["games_played"] and row["games_played"] > 0:
            season_yards_per_game.append((row["season"], row["rec_yards"] / row["games_played"]))
        team_att = pass_att_lookup.get(ts, 0)
        if team_att > 0:
            season_target_shares.append((row["season"], row["targets"] / team_att))

    if season_doms:
        f["wr_dominator_peak"] = round(max(d for _, d in season_doms), 3)
        f["wr_final_year_dominator"] = round(season_doms[-1][1], 3)
        # Breakout age (Hayden Winks standard): real age at first season with
        # dominator ≥ 0.20. Caller passes birthdate; reference Sept 1 of season
        # year as the season start.
        breakout_seasons = [season for season, dom in season_doms if dom >= 0.20]
        if breakout_seasons and birthdate is not None:
            from datetime import date
            ref = date(breakout_seasons[0], 9, 1)
            f["wr_breakout_age_dominator"] = round((ref - birthdate).days / 365.25, 1)

    # YoY slopes
    def _slope(pairs: list[tuple[int, float]]) -> float | None:
        if len(pairs) < 2:
            return None
        xs = [p[0] for p in pairs]
        ys = [p[1] for p in pairs]
        x_mean = sum(xs) / len(xs)
        y_mean = sum(ys) / len(ys)
        num = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(len(xs)))
        den = sum((x - x_mean) ** 2 for x in xs)
        return num / den if den > 0 else None

    cy_slope = _slope(season_yards_per_game)
    if cy_slope is not None:
        f["wr_career_yards_slope"] = round(cy_slope, 1)
    ts_slope = _slope(season_target_shares)
    if ts_slope is not None:
        f["wr_target_share_yoy_slope"] = round(ts_slope, 4)

    return {k: v for k, v in f.items() if v is not None}


# ---------- top-level ----------


@dataclass
class WRContext:
    plays: pl.DataFrame
    seasons: pl.DataFrame


def build_wr_context(
    attributed_plays: pl.DataFrame,
    wr_canon_ids: set[int],
) -> WRContext:
    """Filter shared cohort plays to WR receptions/targets and aggregate.

    A play is WR-relevant when receiver_id matches a cohort WR. (RBs and TEs
    can be receivers too, but their feature modules filter the same frame on
    different id sets — no contention.)
    """
    if attributed_plays.height == 0 or not wr_canon_ids:
        return WRContext(plays=pl.DataFrame(), seasons=pl.DataFrame())

    wr_id_list = list(wr_canon_ids)
    plays = attributed_plays.filter(
        pl.col("receiver_id").is_in(wr_id_list)
    ).with_columns(
        pl.col("receiver_id").alias("wr_id")
    )
    seasons = _aggregate_per_season(plays) if plays.height > 0 else pl.DataFrame()
    return WRContext(plays=plays, seasons=seasons)


def compute(
    profile: PlayerProfile,
    ctx: WRContext,
    *,
    pfr_to_canon_id: dict[str, int],
    pss_wide: pl.DataFrame,
    team_pass_dist: pl.DataFrame,
) -> dict[str, float]:
    """Compute WR features for a single profile. No-op for non-WR profiles."""
    if profile.position != Position.WR:
        return {}
    if ctx.seasons.height == 0:
        return {}
    wr_id = pfr_to_canon_id.get(profile.player_id)
    if wr_id is None:
        return {}
    seasons_df = ctx.seasons.filter(pl.col("wr_id") == wr_id)
    if seasons_df.height == 0:
        return {}
    return _career_features(
        seasons_df,
        pss_wide=pss_wide,
        team_pass_dist=team_pass_dist,
        wr_id=wr_id,
        birthdate=profile.bio.birth_date if profile.bio else None,
    )
