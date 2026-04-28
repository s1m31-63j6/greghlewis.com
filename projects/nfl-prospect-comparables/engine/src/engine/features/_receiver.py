"""Shared receiver-feature engine for WR + TE.

In CFBD play-by-play, a TE is just a receiver with a different position
label — there's no formation, blocking, or route data to actually
differentiate the two. The feature math is identical; only the cohort and
the feature-name prefix differ. Both wr.py and te.py are thin wrappers
around the helpers here.

Position-specific features (TE blocking exposure, in-line rate, etc.) live
in catalog.TE_DEFERRED — they're public-data-impossible.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import polars as pl

from engine.schema import PlayerProfile, Position


CATCH_TYPES = ("pass_complete", "pass_td")
TARGET_TYPES = ("pass_complete", "pass_incomplete", "pass_int", "pass_td")


def _safe_div(num, den, *, default=None, ndigits=3):
    if den is None or den == 0:
        return default
    return round(num / den, ndigits)


# ---------- aggregation ----------


def aggregate_per_season(plays: pl.DataFrame) -> pl.DataFrame:
    """Per (recv_id, season) aggregates. `recv_id` column must be set on `plays`
    (caller filters and aliases receiver_id → recv_id before calling this)."""
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
        df.group_by(["recv_id", "season"])
        .agg([
            pl.col("game_id").n_unique().alias("games_played"),
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


def _team_rec_totals(pss_wide: pl.DataFrame) -> dict[tuple[str, int], tuple[int, int, int]]:
    """Per (team, season) → (team_rec_yards, team_receptions, team_rec_tds)."""
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


def _team_rec_yds_by_player(pss_wide: pl.DataFrame) -> dict[tuple[str, int], list[int]]:
    """Per (team, season) → list of every player's rec_yards. For top-teammate
    denominator in `yards_above_teammate_pct`."""
    out: dict[tuple[str, int], list[int]] = {}
    for row in pss_wide.iter_rows(named=True):
        key = (row["team"], int(row["season"]))
        out.setdefault(key, []).append(int(row["rec_yards"] or 0))
    return out


# ---------- career feature reducer ----------


def career_features(
    seasons_df: pl.DataFrame,
    *,
    prefix: str,
    pss_wide: pl.DataFrame,
    team_pass_dist: pl.DataFrame,
    birthdate: date | None = None,
) -> dict[str, float]:
    """Reduce per-season aggregates → career feature dict, keyed by `{prefix}_*`."""
    if seasons_df.height == 0:
        return {}
    s = seasons_df.sort("season")
    sum_ = s.sum()

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
    p = prefix

    # Volume / production
    f[f"{p}_targets_per_game"] = _safe_div(targets, games)
    f[f"{p}_yards_per_game"] = _safe_div(rec_yards, games, ndigits=1)
    f[f"{p}_rec_per_game"] = _safe_div(receptions, games)
    f[f"{p}_td_per_game"] = _safe_div(rec_tds, games)
    f[f"{p}_big_play_rate"] = _safe_div(big_plays, games)
    f[f"{p}_first_down_per_rec"] = _safe_div(first_downs, receptions)

    # Efficiency
    f[f"{p}_catch_rate"] = _safe_div(receptions, targets)
    f[f"{p}_epa_per_target"] = _safe_div(float(sum_["ppa_targets"][0]), targets)
    f[f"{p}_success_rate"] = _safe_div(int(sum_["success_targets"][0]), targets)

    # Receiver Rating: NFL passer-rating formula treating targets as attempts.
    if targets > 0:
        a = max(0.0, min(2.375, ((receptions / targets) - 0.3) * 5))
        b = max(0.0, min(2.375, ((rec_yards / targets) - 3) * 0.25))
        c = max(0.0, min(2.375, (rec_tds / targets) * 20))
        d = max(0.0, min(2.375, 2.375 - ((interceptions / targets) * 25)))
        f[f"{p}_rating"] = round(((a + b + c + d) / 6) * 100, 1)

    # Per-team-pass-attempt family
    pass_att_lookup = _team_pass_lookup(team_pass_dist, "pass_attempts")
    third_dn_lookup = _team_pass_lookup(team_pass_dist, "third_down_pass_attempts")
    rz_lookup = _team_pass_lookup(team_pass_dist, "red_zone_pass_attempts")

    recv_team_seasons = [(row["team"], int(row["season"])) for row in s.iter_rows(named=True)]
    team_pass_total = sum(pass_att_lookup.get(ts, 0) for ts in recv_team_seasons)
    team_3rd_total = sum(third_dn_lookup.get(ts, 0) for ts in recv_team_seasons)
    team_rz_total = sum(rz_lookup.get(ts, 0) for ts in recv_team_seasons)

    f[f"{p}_ryptpa"] = _safe_div(rec_yards, team_pass_total, ndigits=3)
    f[f"{p}_tptpa"] = _safe_div(targets, team_pass_total, ndigits=4)
    f[f"{p}_1dptpa"] = _safe_div(first_downs, team_pass_total, ndigits=4)

    # Situational target shares
    f[f"{p}_third_down_target_share"] = _safe_div(third_down_targets, team_3rd_total, ndigits=3)
    f[f"{p}_red_zone_target_share"] = _safe_div(rz_targets, team_rz_total, ndigits=3)

    # Premium / above-teammate (uses pss_wide for team-level rec totals)
    rec_totals = _team_rec_totals(pss_wide)
    by_player = _team_rec_yds_by_player(pss_wide)

    if receptions > 0:
        teammate_yds = 0
        teammate_recs = 0
        for ts in recv_team_seasons:
            tot_yds, tot_rec, _ = rec_totals.get(ts, (0, 0, 0))
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
            f[f"{p}_target_premium"] = round(self_ypc - mate_ypc, 2)

    pcts = []
    for ts in recv_team_seasons:
        peers = by_player.get(ts, [])
        self_row = next(
            (r for r in s.iter_rows(named=True) if r["team"] == ts[0] and r["season"] == ts[1]),
            None,
        )
        self_yds = self_row["rec_yards"] if self_row else 0
        peers_excl_self = list(peers)
        try:
            peers_excl_self.remove(self_yds)
        except ValueError:
            pass
        top_mate = max(peers_excl_self) if peers_excl_self else 0
        if top_mate > 0:
            pcts.append(self_yds / top_mate)
    if pcts:
        f[f"{p}_yards_above_teammate_pct"] = round(sum(pcts) / len(pcts), 3)

    # Trajectory: per-season dominator and slopes
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
        f[f"{p}_dominator_peak"] = round(max(d for _, d in season_doms), 3)
        f[f"{p}_final_year_dominator"] = round(season_doms[-1][1], 3)
        breakout_seasons = [season for season, dom in season_doms if dom >= 0.20]
        if breakout_seasons and birthdate is not None:
            ref = date(breakout_seasons[0], 9, 1)
            f[f"{p}_breakout_age_dominator"] = round((ref - birthdate).days / 365.25, 1)

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
        f[f"{p}_career_yards_slope"] = round(cy_slope, 1)
    ts_slope = _slope(season_target_shares)
    if ts_slope is not None:
        f[f"{p}_target_share_yoy_slope"] = round(ts_slope, 4)

    return {k: v for k, v in f.items() if v is not None}


# ---------- shared context plumbing ----------


@dataclass
class ReceiverContext:
    plays: pl.DataFrame
    seasons: pl.DataFrame


def build_context(
    attributed_plays: pl.DataFrame,
    canon_ids: set[int],
) -> ReceiverContext:
    """Filter shared cohort plays to receptions/targets for given ids."""
    if attributed_plays.height == 0 or not canon_ids:
        return ReceiverContext(plays=pl.DataFrame(), seasons=pl.DataFrame())
    id_list = list(canon_ids)
    plays = attributed_plays.filter(
        pl.col("receiver_id").is_in(id_list)
    ).with_columns(pl.col("receiver_id").alias("recv_id"))
    seasons = aggregate_per_season(plays) if plays.height > 0 else pl.DataFrame()
    return ReceiverContext(plays=plays, seasons=seasons)


def compute_for_profile(
    profile: PlayerProfile,
    ctx: ReceiverContext,
    *,
    position: Position,
    prefix: str,
    pfr_to_canon_id: dict[str, int],
    pss_wide: pl.DataFrame,
    team_pass_dist: pl.DataFrame,
) -> dict[str, float]:
    """Compute receiver features for one profile when its position matches."""
    if profile.position != position:
        return {}
    if ctx.seasons.height == 0:
        return {}
    recv_id = pfr_to_canon_id.get(profile.player_id)
    if recv_id is None:
        return {}
    seasons_df = ctx.seasons.filter(pl.col("recv_id") == recv_id)
    if seasons_df.height == 0:
        return {}
    return career_features(
        seasons_df,
        prefix=prefix,
        pss_wide=pss_wide,
        team_pass_dist=team_pass_dist,
        birthdate=profile.bio.birth_date if profile.bio else None,
    )
