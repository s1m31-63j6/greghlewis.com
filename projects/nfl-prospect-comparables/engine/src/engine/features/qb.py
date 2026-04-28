"""QB feature engineering — efficiency, situational splits, mobility, trajectory.

Backbone: parsed CFBD plays (engine.parse.playtext) + resolver-attributed
espn_ids + per-play PPA from CFBD plays (their EPA equivalent).

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
    parse_play,
)
from engine.parse.resolver import NameResolver
from engine.schema import PlayerProfile, Position


# ---------- attribution ----------


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


def build_attributed_plays(
    raw_bucket: str,
    *,
    qb_espn_ids: set[int],
    progress: bool = True,
) -> pl.DataFrame:
    """Parse all CFBD plays, attribute QB plays to cohort espn_ids.

    Returns a polars frame with one row per QB-attributed play:
      espn_id, season, week, season_type, parsed_type, ppa,
      yardsGained, down, distance, yardsToGoal, period, score_diff,
      is_first_down, is_touchdown, is_two_point
    """
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
        season_type = k.split("season_type=")[1].split("/")[0]
        week = int(k.split("week=")[1].split("/")[0])
        # Filter to plays we care about
        df = df.filter(pl.col("playType").is_in(list(PASS_PLAY_TYPES | RUSH_PLAY_TYPES)))
        for row in df.iter_rows(named=True):
            pp = parse_play(row.get("playType"), row.get("playText"))
            if pp.parsed_type in ("other", "kneel"):
                continue
            offense = row.get("offense")
            espn_id: int | None = None
            if pp.parsed_type in ("pass_complete", "pass_incomplete", "pass_int", "pass_td", "sack"):
                espn_id = resolver.resolve(season=season, team=offense, name=pp.passer)
            elif pp.parsed_type in ("rush", "rush_td"):
                espn_id = resolver.resolve(season=season, team=offense, name=pp.rusher)
            if espn_id is None or espn_id not in qb_espn_ids:
                continue
            score_diff = (row.get("offenseScore") or 0) - (row.get("defenseScore") or 0)
            rows.append({
                "espn_id": espn_id,
                "season": season,
                "week": week,
                "season_type": season_type,
                "parsed_type": pp.parsed_type,
                "ppa": row.get("ppa"),
                "yards_gained": row.get("yardsGained"),
                "down": row.get("down"),
                "distance": row.get("distance"),
                "yards_to_goal": row.get("yardsToGoal"),
                "period": row.get("period"),
                "score_diff": score_diff,
                "is_first_down": pp.is_first_down,
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


# ---------- feature computation ----------


PASS_TYPES = ("pass_complete", "pass_incomplete", "pass_int", "pass_td")
COMPLETION_TYPES = ("pass_complete", "pass_td")


def _safe_div(num, den, *, default=None, ndigits=3):
    if den is None or den == 0:
        return default
    return round(num / den, ndigits)


def _aggregate_per_season(df: pl.DataFrame) -> pl.DataFrame:
    """Per (espn_id, season) aggregates that downstream features key off."""
    is_pass = pl.col("parsed_type").is_in(list(PASS_TYPES))
    is_completion = pl.col("parsed_type").is_in(list(COMPLETION_TYPES))
    is_dropback = is_pass | (pl.col("parsed_type") == "sack")
    is_qb_rush = pl.col("parsed_type").is_in(["rush", "rush_td"])
    not_two_point = ~pl.col("is_two_point")

    agg = (
        df.with_columns([
            (is_pass & not_two_point).alias("_is_pass"),
            (is_completion & not_two_point).alias("_is_completion"),
            (is_dropback & not_two_point).alias("_is_dropback"),
            is_qb_rush.alias("_is_qb_rush"),
        ])
        .group_by(["espn_id", "season"])
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
            # Situational accumulators (filtered ppa sums + counts).
            # `_is_dropback` is bool; multiply ppa by (filter & dropback) cast to int
            # to get a "ppa-only-on-matching-plays" sum.
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
            # 3rd-down conversion: dropback on 3rd down resulting in first down or TD
            (
                pl.col("_is_dropback") & (pl.col("down") == 3)
                & (pl.col("is_first_down") | pl.col("is_touchdown"))
            ).sum().alias("third_down_conversions"),
            # Red zone TD attempts/conversions
            (pl.col("_is_dropback") & (pl.col("yards_to_goal") <= 20) & pl.col("is_touchdown")).sum().alias("rz_tds"),
        ])
    )
    return agg


def _career_features(seasons_df: pl.DataFrame) -> dict[str, float]:
    """Reduce per-season aggregates → career feature values for one QB."""
    if seasons_df.height == 0:
        return {}
    s = seasons_df.sort("season")
    # Career totals
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
    # Adjusted Y/A: (yards + 20*TD - 45*INT) / attempts (PFR formula)
    if pass_att > 0:
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

    # Trajectory: YoY slope of per-season EPA/dropback
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
            # Final-year z within own career
            if len(ys) >= 3 and statistics.pstdev(ys[:-1]) > 0:
                prior_mean = statistics.mean(ys[:-1])
                prior_std = statistics.pstdev(ys[:-1])
                z = (ys[-1] - prior_mean) / prior_std
                f["qb_final_year_epa_z"] = round(max(-5.0, min(5.0, z)), 2)

    return {k: v for k, v in f.items() if v is not None}


# ---------- top-level ----------


@dataclass
class QBContext:
    plays: pl.DataFrame  # parse_play-attributed plays for all cohort QBs
    seasons: pl.DataFrame  # per-(espn_id, season) aggregates
    # pfr_id → canonical qb id (CFBD or ESPN) used in `seasons.espn_id`. Lets
    # downstream lookup by player_id even when the CFBD legacy id (e.g. 550373
    # for Baker Mayfield) differs from the ff_playerids ESPN id.
    pfr_to_qb_id: dict[str, int] = field(default_factory=dict)


def _augment_with_cfbd_roster_ids(
    profiles: list[PlayerProfile],
    raw_bucket: str,
    pfr_to_espn: dict[str, int],
) -> tuple[set[int], dict[int, str]]:
    """Find CFBD roster IDs for each cohort QB via name+college match.

    CFBD assigns legacy non-ESPN IDs to older players (e.g. Baker Mayfield is
    `550373` in rosters but `3052587` in ESPN/ff_playerids). We harvest both.

    Returns:
        (set of all relevant CFBD/ESPN ids, map from cfbd_id → pfr_id)
    """
    from engine.parse.playtext import normalize_name

    keys = sorted(
        k for k in _list_keys(raw_bucket, "raw/cfbd/rosters/")
        if k.endswith("data.parquet")
    )
    rosters = pl.concat(
        [_read_parquet(raw_bucket, k) for k in keys], how="vertical_relaxed"
    )
    qbs = [p for p in profiles if p.position == Position.QB]
    ids: set[int] = set()
    cfbd_to_pfr: dict[int, str] = {}

    # First pass: any matching ESPN id
    for p in qbs:
        eid = pfr_to_espn.get(p.player_id)
        if eid is not None:
            ids.add(eid)
            cfbd_to_pfr[eid] = p.player_id

    # Second pass: harvest CFBD roster IDs by (name, college) match
    for p in qbs:
        college_field = p.bio.college or ""
        if not college_field:
            continue
        nname = normalize_name(p.name)
        for school in college_field.split(";"):
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


def build_qb_context(profiles: list[PlayerProfile], raw_bucket: str) -> QBContext:
    """Produce the parsed-and-aggregated context for QB feature computation."""
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
    qb_espn_ids, cfbd_to_pfr = _augment_with_cfbd_roster_ids(profiles, raw_bucket, pfr_to_espn)
    print(
        f"  parsing plays for {len(qb_espn_ids)} cohort QB ids "
        f"(union of ESPN + CFBD legacy)...", flush=True,
    )
    plays = build_attributed_plays(raw_bucket, qb_espn_ids=qb_espn_ids)
    if plays.height > 0:
        # Rewrite multiple ids to a single canonical id per QB (the smallest CFBD/ESPN
        # id we have for them). All ids in cfbd_to_pfr point to one pfr_id, so we
        # remap every play's espn_id to a chosen canonical id per QB.
        canonical: dict[str, int] = {}
        for cid, pfr in cfbd_to_pfr.items():
            if pfr not in canonical or cid < canonical[pfr]:
                canonical[pfr] = cid
        canon_map = {cid: canonical[pfr] for cid, pfr in cfbd_to_pfr.items()}
        plays = plays.with_columns(
            pl.col("espn_id").replace_strict(canon_map, default=pl.col("espn_id"))
        )
    seasons = _aggregate_per_season(plays) if plays.height > 0 else pl.DataFrame()
    return QBContext(plays=plays, seasons=seasons, pfr_to_qb_id={
        pfr: canonical[pfr] for pfr in canonical
    } if plays.height > 0 else {})


def compute(profile: PlayerProfile, ctx: QBContext, *, pfr_to_espn: dict[str, int]) -> dict[str, float]:
    """Compute QB features for a single profile. No-op for non-QB profiles."""
    if profile.position != Position.QB:
        return {}
    if ctx.seasons.height == 0:
        return {}
    # Prefer canonical qb id (handles Baker Mayfield-style CFBD-vs-ESPN mismatches)
    qb_id = ctx.pfr_to_qb_id.get(profile.player_id)
    if qb_id is None:
        qb_id = pfr_to_espn.get(profile.player_id)
    if qb_id is None:
        return {}
    seasons_df = ctx.seasons.filter(pl.col("espn_id") == qb_id)
    if seasons_df.height == 0:
        return {}
    return _career_features(seasons_df)
