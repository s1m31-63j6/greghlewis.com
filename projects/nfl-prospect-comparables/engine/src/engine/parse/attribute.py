"""Single-pass parse + attribution of CFBD plays to cohort player IDs.

Promotes what QB and RB previously did separately into one shared pass. Each
play is parsed exactly once, all named players (passer, rusher, receiver) are
resolved to canonical cohort ids, and the result is a frame with one row per
play that involves at least one cohort player.

Position feature modules (qb, rb, wr, te) consume this frame instead of
re-parsing the raw plays. With four positions on the roster that's a 4x speedup
on the parse step, and adding more positions later costs nothing extra.
"""

from __future__ import annotations

import io
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
from engine.schema import PlayerProfile


# ---------- S3 helpers ----------


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


# ---------- cohort id construction (all positions, one pass) ----------


def build_cohort_id_set(
    profiles: list[PlayerProfile],
    raw_bucket: str,
) -> tuple[set[int], dict[int, str]]:
    """Build the set of CFBD/ESPN ids spanning every cohort player.

    For each profile we collect (a) the ESPN id from `ff_playerids` and (b) any
    matching CFBD legacy roster ids by name+college. The Baker Mayfield case
    (CFBD `550373` vs ESPN `3052587`) is the canonical reason for (b) — without
    it ~10 cohort QBs across 2015-2018 silently parse to 0 attempts.

    Returns:
        (cohort_id_set, cfbd_id_to_pfr_id_map)
    """
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

    keys = sorted(
        k for k in _list_keys(raw_bucket, "raw/cfbd/rosters/")
        if k.endswith("data.parquet")
    )
    rosters = pl.concat(
        [_read_parquet(raw_bucket, k) for k in keys], how="vertical_relaxed"
    )

    ids: set[int] = set()
    cfbd_to_pfr: dict[int, str] = {}

    for p in profiles:
        eid = pfr_to_espn.get(p.player_id)
        if eid is not None:
            ids.add(eid)
            cfbd_to_pfr[eid] = p.player_id

    for p in profiles:
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


# ---------- single-pass attribution ----------


@dataclass
class CohortAttribution:
    plays: pl.DataFrame  # one row per play involving any cohort player
    pfr_to_canon_id: dict[str, int]  # nflverse pfr_id → canonical cohort id


def build_attributed_plays(
    raw_bucket: str,
    *,
    cohort_ids: set[int],
    cfbd_to_pfr: dict[int, str],
    progress: bool = True,
) -> CohortAttribution:
    """Parse every CFBD play once. Resolve passer/rusher/receiver names to ids.
    Emit a row per play where at least one resolved id is in `cohort_ids`.

    Output frame columns:
      passer_id, rusher_id, receiver_id  (Int64 nullable — set when role applies
                                          AND the resolved id is in cohort_ids)
      season, week, season_type, offense
      parsed_type, ppa, yards_gained, down, distance, yards_to_goal, period,
      score_diff, is_first_down, is_touchdown, is_two_point, game_id

    After the pass, all three id columns are remapped via the canonical-id
    convention (smallest CFBD/ESPN id wins per pfr_id), so downstream consumers
    can key on a single id per player regardless of the Baker-Mayfield-style
    ESPN-vs-CFBD-legacy split.
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
        df = df.filter(pl.col("playType").is_in(list(PASS_PLAY_TYPES | RUSH_PLAY_TYPES)))

        for row in df.iter_rows(named=True):
            pp = parse_play(row.get("playType"), row.get("playText"))
            if pp.parsed_type in ("other", "kneel"):
                continue
            offense = row.get("offense")

            passer_id: int | None = None
            rusher_id: int | None = None
            receiver_id: int | None = None
            if pp.passer:
                pid = resolver.resolve(season=season, team=offense, name=pp.passer)
                if pid is not None and pid in cohort_ids:
                    passer_id = pid
            if pp.rusher:
                pid = resolver.resolve(season=season, team=offense, name=pp.rusher)
                if pid is not None and pid in cohort_ids:
                    rusher_id = pid
            if pp.receiver:
                pid = resolver.resolve(season=season, team=offense, name=pp.receiver)
                if pid is not None and pid in cohort_ids:
                    receiver_id = pid

            if passer_id is None and rusher_id is None and receiver_id is None:
                continue

            score_diff = (row.get("offenseScore") or 0) - (row.get("defenseScore") or 0)
            rows.append({
                "passer_id": passer_id,
                "rusher_id": rusher_id,
                "receiver_id": receiver_id,
                "season": season,
                "week": week,
                "season_type": season_type,
                "offense": offense,
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
                f"    [{i}/{n}] {k.split('plays/')[1]:55s} elapsed "
                f"{(time.monotonic() - started) / 60:.1f} min, {len(rows):,} rows",
                flush=True,
            )

    if not rows:
        return CohortAttribution(plays=pl.DataFrame(), pfr_to_canon_id={})

    plays = pl.from_dicts(rows)

    # Canonical-id remap: smallest id wins per pfr_id, applied to all three role
    # columns. `replace_strict` with a column-default leaves nulls and unmapped
    # values untouched.
    canonical: dict[str, int] = {}
    for cid, pfr in cfbd_to_pfr.items():
        if pfr not in canonical or cid < canonical[pfr]:
            canonical[pfr] = cid
    canon_map = {cid: canonical[pfr] for cid, pfr in cfbd_to_pfr.items()}

    plays = plays.with_columns([
        pl.col("passer_id").replace_strict(canon_map, default=pl.col("passer_id")),
        pl.col("rusher_id").replace_strict(canon_map, default=pl.col("rusher_id")),
        pl.col("receiver_id").replace_strict(canon_map, default=pl.col("receiver_id")),
    ])

    return CohortAttribution(plays=plays, pfr_to_canon_id=canonical)
