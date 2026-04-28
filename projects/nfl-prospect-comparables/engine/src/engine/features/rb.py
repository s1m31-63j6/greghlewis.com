"""RB feature engineering.

Backbone: parsed CFBD plays + per-play PPA (engine.parse) for rushing
efficiency and situational splits, plus `cfbd/player_season_stats` aggregates
(via universal CohortContext.pss_wide) for receiving share and team-level
denominators.

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

import io
import os
import statistics
import time
from dataclasses import dataclass, field

import polars as pl

from engine.io import s3 as s3io
from engine.parse.playtext import (
    PASS_PLAY_TYPES,
    RUSH_PLAY_TYPES,
    normalize_name,
    parse_play,
)
from engine.parse.resolver import NameResolver
from engine.schema import PlayerProfile, Position


# ---------- shared S3 helpers (mirror qb.py — small enough not to extract yet) ----------


def _list_keys(bucket: str, prefix: str) -> list[str]:
    paginator = s3io._client().get_paginator("list_objects_v2")
    return [
        obj["Key"]
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix)
        for obj in page.get("Contents", [])
    ]


def _read_parquet(bucket: str, key: str) -> pl.DataFrame:
    body = s3io._client().get_object(Bucket=bucket, Key=key)["Body"].read()
    return pl.read_parquet(io.BytesIO(body))


# ---------- cohort-id augmentation (reused pattern from qb.py) ----------


def _augment_with_cfbd_roster_ids(
    profiles: list[PlayerProfile],
    raw_bucket: str,
    pfr_to_espn: dict[str, int],
) -> tuple[set[int], dict[int, str]]:
    """Same Baker-Mayfield-style bridge as qb.py — find CFBD legacy IDs by name+college."""
    keys = sorted(
        k for k in _list_keys(raw_bucket, "raw/cfbd/rosters/")
        if k.endswith("data.parquet")
    )
    rosters = pl.concat(
        [_read_parquet(raw_bucket, k) for k in keys], how="vertical_relaxed"
    )
    rbs = [p for p in profiles if p.position == Position.RB]
    ids: set[int] = set()
    cfbd_to_pfr: dict[int, str] = {}

    for p in rbs:
        eid = pfr_to_espn.get(p.player_id)
        if eid is not None:
            ids.add(eid)
            cfbd_to_pfr[eid] = p.player_id

    for p in rbs:
        college = p.bio.college or ""
        if not college:
            continue
        nname = normalize_name(p.name)
        for school in college.split(";"):
            school = school.strip()
            if not school:
                continue
            cand = rosters.filter(
                (pl.col("team") == school)
                & (
                    (pl.col("firstName").fill_null("") + " " + pl.col("lastName").fill_null(""))
                    .str.to_lowercase()
                    .str.strip_chars()
                    == nname
                )
            )
            for row in cand.iter_rows(named=True):
                try:
                    rid = int(row["id"])
                except (ValueError, TypeError):
                    continue
                ids.add(rid)
                cfbd_to_pfr.setdefault(rid, p.player_id)
    return ids, cfbd_to_pfr


# ---------- attribution ----------


def _build_attributed_plays(
    raw_bucket: str,
    *,
    rb_ids: set[int],
    progress: bool = True,
) -> pl.DataFrame:
    """Parse plays once. Emit a row per RB-attributed play with role=rusher|receiver."""
    print("  building name resolver from rosters...", flush=True)
    t0 = time.monotonic()
    resolver = NameResolver.from_s3(raw_bucket)
    if progress:
        print(f"  resolver built in {time.monotonic() - t0:.1f}s", flush=True)

    keys = sorted(
        k for k in _list_keys(raw_bucket, "raw/cfbd/plays/")
        if k.endswith("data.parquet")
    )
    n = len(keys)
    rows: list[dict] = []
    started = time.monotonic()

    for i, k in enumerate(keys, 1):
        df = _read_parquet(raw_bucket, k)
        season = int(k.split("season=")[1].split("/")[0])
        df = df.filter(pl.col("playType").is_in(list(PASS_PLAY_TYPES | RUSH_PLAY_TYPES)))
        for row in df.iter_rows(named=True):
            pp = parse_play(row.get("playType"), row.get("playText"))
            if pp.parsed_type in ("other", "kneel"):
                continue
            offense = row.get("offense")
            rb_id: int | None = None
            role: str | None = None
            if pp.parsed_type in ("rush", "rush_td"):
                rb_id = resolver.resolve(season=season, team=offense, name=pp.rusher)
                role = "rusher"
            elif pp.parsed_type in ("pass_complete", "pass_incomplete", "pass_td") and pp.receiver:
                rb_id = resolver.resolve(season=season, team=offense, name=pp.receiver)
                role = "receiver"
            if rb_id is None or rb_id not in rb_ids:
                continue
            rows.append({
                "rb_id": rb_id,
                "season": season,
                "role": role,
                "parsed_type": pp.parsed_type,
                "ppa": row.get("ppa"),
                "yards_gained": row.get("yardsGained"),
                "down": row.get("down"),
                "distance": row.get("distance"),
                "yards_to_goal": row.get("yardsToGoal"),
                "is_touchdown": pp.is_touchdown,
                "is_two_point": pp.is_two_point,
                "game_id": row.get("gameId"),
            })
        if progress and (i % 30 == 0 or i == n):
            print(
                f"    [{i}/{n}] {k.split('plays/')[1]:55s} elapsed {(time.monotonic()-started)/60:.1f} min, {len(rows):,} rows",
                flush=True,
            )

    if not rows:
        return pl.DataFrame()
    return pl.from_dicts(rows)


# ---------- aggregations ----------


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
            # Team-context: any teammates? Captured separately via pss_wide.
        ])
    )


def _team_rushing_yds_lookup(pss_wide: pl.DataFrame) -> dict[tuple[str, int], int]:
    """Per (team, season) total rush yards across all players in the box-score pivot."""
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


def _safe_div(num, den, *, default=None, ndigits=3):
    if den is None or den == 0:
        return default
    return round(num / den, ndigits)


def _career_features(
    seasons_df: pl.DataFrame,
    *,
    pss_wide: pl.DataFrame,
    espn_id: int,
    pfr_to_espn_inv: dict[int, str],
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

    # rb_receiving_yards_share: aggregate via pss_wide for the player's
    # (team, season) pairs in the cohort. Use the pss_wide rec_yards as
    # numerator and team_rec_yards as denominator. Box totals reconcile against
    # CFBD's own player_season_stats — more reliable than parsed yard sums for
    # WRs/TEs who have richer feeds; for RBs we use the player's parsed
    # rec_yards directly since that's what we attributed.
    team_rec_lookup = _team_rec_yds_lookup(pss_wide)
    # Find the player's team-seasons via pss_wide
    player_team_seasons = (
        pss_wide.filter(pl.col("espn_id") == espn_id)
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

    # workload_concentration: average across player's seasons of
    # (player_rush_yds / team_rush_yds). High = bell-cow back; low = committee.
    team_rush_lookup = _team_rushing_yds_lookup(pss_wide)
    if player_team_seasons:
        # Use parsed rush yards as numerator (more accurate to attribution scope)
        rb_seasons = s.to_dicts()
        # We need team for each season — get from pss_wide
        shares = []
        for row in player_team_seasons:
            team = row["team"]
            season = int(row["season"])
            team_rush = team_rush_lookup.get((team, season), 0)
            # find the matching parsed-season rush yards (may not exist if no plays parsed)
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
    pfr_to_qb_id: dict[str, int] = field(default_factory=dict)  # name kept for parity with QBContext


def build_rb_context(profiles: list[PlayerProfile], raw_bucket: str) -> RBContext:
    """Same shape as build_qb_context but resolves rushers AND receivers."""
    df = _read_parquet(raw_bucket, "raw/nflverse/ff_playerids/data.parquet")
    df = df.select(
        pl.col("pfr_id"),
        pl.col("espn_id").cast(pl.Int64, strict=False).alias("espn_id"),
    )
    pfr_to_espn: dict[str, int] = {
        row["pfr_id"]: int(row["espn_id"])
        for row in df.iter_rows(named=True)
        if row["espn_id"] is not None
    }
    rb_ids, cfbd_to_pfr = _augment_with_cfbd_roster_ids(profiles, raw_bucket, pfr_to_espn)
    print(
        f"  parsing plays for {len(rb_ids)} cohort RB ids "
        f"(union of ESPN + CFBD legacy)...", flush=True,
    )
    plays = _build_attributed_plays(raw_bucket, rb_ids=rb_ids)
    if plays.height > 0:
        canonical: dict[str, int] = {}
        for cid, pfr in cfbd_to_pfr.items():
            if pfr not in canonical or cid < canonical[pfr]:
                canonical[pfr] = cid
        canon_map = {cid: canonical[pfr] for cid, pfr in cfbd_to_pfr.items()}
        plays = plays.with_columns(
            pl.col("rb_id").replace_strict(canon_map, default=pl.col("rb_id"))
        )
        pfr_to_canon = {pfr: canonical[pfr] for pfr in canonical}
    else:
        pfr_to_canon = {}
    seasons = _aggregate_per_season(plays) if plays.height > 0 else pl.DataFrame()
    return RBContext(plays=plays, seasons=seasons, pfr_to_qb_id=pfr_to_canon)


def compute(
    profile: PlayerProfile,
    ctx: RBContext,
    *,
    pfr_to_espn: dict[str, int],
    pss_wide: pl.DataFrame,
) -> dict[str, float]:
    """Compute RB features for a single profile. No-op for non-RB profiles."""
    if profile.position != Position.RB:
        return {}
    if ctx.seasons.height == 0:
        return {}
    rb_id = ctx.pfr_to_qb_id.get(profile.player_id)
    if rb_id is None:
        rb_id = pfr_to_espn.get(profile.player_id)
    if rb_id is None:
        return {}
    seasons_df = ctx.seasons.filter(pl.col("rb_id") == rb_id)
    if seasons_df.height == 0:
        return {}
    return _career_features(
        seasons_df,
        pss_wide=pss_wide,
        espn_id=rb_id,
        pfr_to_espn_inv={v: k for k, v in pfr_to_espn.items()},
    )
