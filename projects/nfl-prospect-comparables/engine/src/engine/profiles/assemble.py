"""Assemble PlayerProfile records by joining cohort spines with raw sources.

Sources joined:
  - cohort spine (curated/outcomes/{cohort}/data.parquet for labeled cohorts;
    raw/nflverse/draft_picks filtered for the prediction cohort)
  - nflverse/players (gsis_id) → bio
  - nflverse/combine (pfr_id) → raw athletic measurables
  - nflverse/ff_playerids → bridges nflverse slugs ↔ CFBD espn_id
  - cfbd/player_season_stats (espn_id) → college counting stats (long→wide, summed)
  - cfbd/rosters (espn_id) → hometown_state / hometown_country

`features` and `scouting_text_refs` are intentionally left empty here — they
belong to feature engineering (tasks 4-8) and Phase 2 scouting ingest.
"""

from __future__ import annotations

import io
import os
from datetime import date, datetime

import boto3
import polars as pl

from engine.io import s3 as s3io
from engine.schema import (
    SCHEMA_VERSION,
    Athletic,
    Bio,
    CareerOutcome,
    CollegeCounting,
    Draft,
    OutcomeClass,
    PlayerProfile,
    Position,
)

SKILL_CATEGORIES = ("QB", "RB", "WR", "TE")


# ---------- S3 helpers ----------


def _read_parquet(bucket: str, key: str) -> pl.DataFrame:
    body = s3io._client().get_object(Bucket=bucket, Key=key)["Body"].read()
    return pl.read_parquet(io.BytesIO(body))


def _list_keys(bucket: str, prefix: str) -> list[str]:
    paginator = s3io._client().get_paginator("list_objects_v2")
    return [
        obj["Key"]
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix)
        for obj in page.get("Contents", [])
    ]


# ---------- source loaders ----------


def load_crosswalk(raw_bucket: str) -> pl.DataFrame:
    """ff_playerids: gsis_id ↔ pfr_id ↔ cfbref_id ↔ espn_id."""
    df = _read_parquet(raw_bucket, "raw/nflverse/ff_playerids/data.parquet")
    return df.select(
        pl.col("gsis_id"),
        pl.col("pfr_id"),
        pl.col("cfbref_id"),
        pl.col("espn_id").cast(pl.Int64, strict=False).alias("espn_id"),
        pl.col("birthdate").alias("xwalk_birthdate"),
        pl.col("height").alias("xwalk_height_in"),
        pl.col("weight").alias("xwalk_weight_lbs"),
    )


def load_players_meta(raw_bucket: str) -> pl.DataFrame:
    df = _read_parquet(raw_bucket, "raw/nflverse/players/data.parquet")
    return df.select(
        "gsis_id",
        pl.col("birth_date").alias("nfl_birth_date"),
        pl.col("height").alias("nfl_height_in"),
        pl.col("weight").alias("nfl_weight_lbs"),
        pl.col("college_name").alias("nfl_college"),
        pl.col("college_conference").alias("nfl_college_conference"),
    )


def load_combine(raw_bucket: str) -> pl.DataFrame:
    """Raw measurables only — percentiles/composites are feature-engineering work."""
    df = _read_parquet(raw_bucket, "raw/nflverse/combine/data.parquet")
    return df.select(
        pl.col("pfr_id"),
        pl.col("ht").alias("combine_ht_str"),
        pl.col("wt").cast(pl.Float64, strict=False).alias("combine_wt"),
        pl.col("forty").cast(pl.Float64, strict=False).alias("combine_forty"),
        pl.col("vertical").cast(pl.Float64, strict=False).alias("combine_vertical"),
        pl.col("broad_jump").cast(pl.Float64, strict=False).alias("combine_broad"),
        pl.col("cone").cast(pl.Float64, strict=False).alias("combine_cone"),
        pl.col("shuttle").cast(pl.Float64, strict=False).alias("combine_shuttle"),
        pl.col("bench").cast(pl.Int64, strict=False).alias("combine_bench"),
    )


# CFBD long-format stats: (category, statType) → wide column we care about.
_STAT_MAP: dict[tuple[str, str], str] = {
    ("passing", "ATT"): "pass_attempts",
    ("passing", "COMPLETIONS"): "pass_completions",
    ("passing", "YDS"): "pass_yards",
    ("passing", "TD"): "pass_tds",
    ("passing", "INT"): "interceptions",
    ("rushing", "CAR"): "rush_attempts",
    ("rushing", "YDS"): "rush_yards",
    ("rushing", "TD"): "rush_tds",
    ("receiving", "REC"): "receptions",
    ("receiving", "YDS"): "rec_yards",
    ("receiving", "TD"): "rec_tds",
}


def load_college_stats(raw_bucket: str) -> pl.DataFrame:
    """Sum CFBD player_season_stats across all seasons per playerId.

    Returns one row per espn_id (CFBD's playerId, cast to Int64) with
    college counting totals + season count.
    """
    keys = sorted(
        k for k in _list_keys(raw_bucket, "raw/cfbd/player_season_stats/")
        if k.endswith("data.parquet")
    )
    frames: list[pl.DataFrame] = []
    for k in keys:
        frames.append(_read_parquet(raw_bucket, k))
    if not frames:
        return pl.DataFrame()

    long = pl.concat(frames, how="vertical_relaxed").select(
        pl.col("season"),
        pl.col("playerId").cast(pl.Int64, strict=False).alias("espn_id"),
        pl.col("category"),
        pl.col("statType"),
        pl.col("stat").cast(pl.Float64, strict=False).alias("stat_value"),
    )

    # Build wide stats by collapsing the (category, statType) → metric mapping.
    when_chain = pl.lit(None, dtype=pl.Float64)
    metrics: dict[str, pl.Expr] = {}
    for (cat, stype), metric in _STAT_MAP.items():
        expr = (
            pl.when((pl.col("category") == cat) & (pl.col("statType") == stype))
            .then(pl.col("stat_value"))
            .otherwise(None)
        )
        metrics[metric] = expr.sum().alias(metric)

    seasons = pl.col("season").n_unique().alias("seasons")

    wide = long.group_by("espn_id").agg([seasons, *metrics.values()])
    return wide


def load_rosters_meta(raw_bucket: str) -> pl.DataFrame:
    """Per-player home-state / country, taken from earliest CFBD roster row."""
    keys = sorted(
        k for k in _list_keys(raw_bucket, "raw/cfbd/rosters/")
        if k.endswith("data.parquet")
    )
    frames: list[pl.DataFrame] = []
    for k in keys:
        df = _read_parquet(raw_bucket, k)
        # Older partitions may be missing some columns; relaxed concat handles it.
        frames.append(df.select(
            pl.col("id").cast(pl.Int64, strict=False).alias("espn_id"),
            pl.col("year").cast(pl.Int64, strict=False).alias("year"),
            pl.col("homeState").alias("home_state"),
            pl.col("homeCountry").alias("home_country"),
        ))
    if not frames:
        return pl.DataFrame()
    rosters = pl.concat(frames, how="vertical_relaxed")
    # earliest year wins
    return (
        rosters
        .filter(pl.col("espn_id").is_not_null())
        .sort("year")
        .group_by("espn_id")
        .agg(
            pl.col("home_state").drop_nulls().first().alias("home_state"),
            pl.col("home_country").drop_nulls().first().alias("home_country"),
        )
    )


# ---------- spines ----------


def load_labeled_spine(curated_bucket: str, name: str) -> pl.DataFrame:
    """Cohort spine for training/validation: the labeled outcomes table."""
    return _read_parquet(curated_bucket, f"outcomes/{name}/data.parquet")


def load_prediction_spine(raw_bucket: str, draft_year: int) -> pl.DataFrame:
    """Cohort spine for the prediction cohort (no outcomes yet)."""
    dp = _read_parquet(raw_bucket, "raw/nflverse/draft_picks/data.parquet")
    return (
        dp.filter(
            (pl.col("season") == draft_year)
            & pl.col("category").is_in(SKILL_CATEGORIES)
        )
        .select(
            "season", "round", "pick", "team",
            "gsis_id", "pfr_player_id", "cfb_player_id", "pfr_player_name",
            "college", "position", "category",
            pl.col("age").cast(pl.Float64, strict=False).alias("age_at_draft"),
        )
    )


# ---------- profile construction ----------


def _to_date(v) -> date | None:
    if v is None:
        return None
    if isinstance(v, date):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v[:10]).date()
        except ValueError:
            return None
    return None


def _ht_string_to_inches(s: str | None) -> float | None:
    """Combine 'ht' is e.g. '6-2' (feet-inches)."""
    if not s or not isinstance(s, str) or "-" not in s:
        return None
    try:
        ft, inch = s.split("-", 1)
        return float(int(ft) * 12 + int(inch))
    except (ValueError, TypeError):
        return None


def _row_to_profile(row: dict, *, has_outcome: bool) -> PlayerProfile | None:
    """Build a PlayerProfile from a fully-joined row dict."""
    pfr_id = row.get("pfr_player_id")
    if not pfr_id:
        return None  # no canonical id → skip

    category = row.get("category") or row.get("position")
    if category not in SKILL_CATEGORIES:
        return None

    bio = Bio(
        birth_date=_to_date(row.get("nfl_birth_date") or row.get("xwalk_birthdate")),
        height_inches=(
            row.get("nfl_height_in")
            or _ht_string_to_inches(row.get("combine_ht_str"))
            or row.get("xwalk_height_in")
        ),
        weight_lbs=(
            row.get("nfl_weight_lbs")
            or row.get("combine_wt")
            or row.get("xwalk_weight_lbs")
        ),
        college=row.get("nfl_college") or row.get("college"),
        college_conference=row.get("nfl_college_conference"),
        hometown_state=row.get("home_state"),
        hometown_country=row.get("home_country") or "USA",
    )

    draft = Draft(
        draft_year=int(row["season"]),
        draft_round=row.get("round"),
        draft_pick=row.get("pick"),
        draft_team=row.get("team"),
        age_at_draft=row.get("age_at_draft") if row.get("age_at_draft") is not None
            else (float(row["age"]) if row.get("age") is not None else None),
    )

    athletic = Athletic(
        forty_yard=row.get("combine_forty"),
        vertical_inches=row.get("combine_vertical"),
        broad_jump_inches=row.get("combine_broad"),
        three_cone=row.get("combine_cone"),
        shuttle=row.get("combine_shuttle"),
        bench_press_reps=row.get("combine_bench"),
    )

    college = CollegeCounting(
        seasons=int(row["seasons"]) if row.get("seasons") is not None else None,
        pass_attempts=_int_or_none(row.get("pass_attempts")),
        pass_completions=_int_or_none(row.get("pass_completions")),
        pass_yards=_int_or_none(row.get("pass_yards")),
        pass_tds=_int_or_none(row.get("pass_tds")),
        interceptions=_int_or_none(row.get("interceptions")),
        rush_attempts=_int_or_none(row.get("rush_attempts")),
        rush_yards=_int_or_none(row.get("rush_yards")),
        rush_tds=_int_or_none(row.get("rush_tds")),
        receptions=_int_or_none(row.get("receptions")),
        rec_yards=_int_or_none(row.get("rec_yards")),
        rec_tds=_int_or_none(row.get("rec_tds")),
    )

    outcome: CareerOutcome | None = None
    outcome_class: OutcomeClass | None = None
    if has_outcome:
        outcome = CareerOutcome(
            settled_through_season=row.get("settled_through_season"),
            games_played=row.get("games"),
            starting_seasons=row.get("seasons_started"),
            career_snaps=_int_or_none(row.get("career_snaps")),
            career_av=row.get("w_av"),
            pro_bowls=row.get("pro_bowls"),
            # The cohort table stores combined 1st+2nd team All-Pros in `all_pros`.
            # We park that combined count in first_team_all_pros; classify_outcome()
            # sums the two slots so the math is unaffected. v1.1 will split them.
            first_team_all_pros=row.get("all_pros"),
            second_team_all_pros=None,
        )
        if row.get("outcome_class"):
            outcome_class = OutcomeClass(row["outcome_class"])

    sources = ["nflverse/draft_picks", "nflverse/players", "nflverse/ff_playerids"]
    if row.get("combine_forty") is not None or row.get("combine_ht_str"):
        sources.append("nflverse/combine")
    if row.get("seasons") is not None:
        sources.append("cfbd/player_season_stats")
    if row.get("home_state"):
        sources.append("cfbd/rosters")

    return PlayerProfile(
        player_id=pfr_id,
        name=row.get("pfr_player_name") or "",
        position=Position(category),
        bio=bio,
        draft=draft,
        athletic=athletic,
        college_counting=college,
        outcome=outcome,
        outcome_class=outcome_class,
        schema_version=SCHEMA_VERSION,
        data_sources=sources,
    )


def _int_or_none(v) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# ---------- top-level ----------


def assemble_cohort(
    spine: pl.DataFrame,
    *,
    raw_bucket: str,
    has_outcome: bool,
) -> tuple[list[PlayerProfile], dict[str, float]]:
    """Join spine with all source tables and build PlayerProfile records.

    Returns (profiles, coverage_stats).
    """
    crosswalk = load_crosswalk(raw_bucket)
    players_meta = load_players_meta(raw_bucket)
    combine = load_combine(raw_bucket)
    college_stats = load_college_stats(raw_bucket)
    rosters_meta = load_rosters_meta(raw_bucket)

    # Bridge: spine.gsis_id → ff_playerids.espn_id, then college tables on espn_id.
    enriched = (
        spine
        .join(crosswalk, on="gsis_id", how="left")
        .join(players_meta, on="gsis_id", how="left")
        .join(combine, left_on="pfr_player_id", right_on="pfr_id", how="left")
        .join(college_stats, on="espn_id", how="left")
        .join(rosters_meta, on="espn_id", how="left")
    )

    profiles: list[PlayerProfile] = []
    skipped = 0
    for row in enriched.iter_rows(named=True):
        prof = _row_to_profile(row, has_outcome=has_outcome)
        if prof is None:
            skipped += 1
            continue
        profiles.append(prof)

    n = len(profiles)
    coverage = {
        "total": float(n),
        "skipped_no_id": float(skipped),
        "pct_with_combine": _pct(profiles, lambda p: p.athletic.forty_yard is not None),
        "pct_with_birthdate": _pct(profiles, lambda p: p.bio.birth_date is not None),
        "pct_with_college_stats": _pct(profiles, lambda p: p.college_counting.seasons is not None),
        "pct_with_hometown": _pct(profiles, lambda p: p.bio.hometown_state is not None),
        "pct_with_height": _pct(profiles, lambda p: p.bio.height_inches is not None),
    }
    return profiles, coverage


def _pct(items: list, predicate) -> float:
    if not items:
        return 0.0
    return round(100.0 * sum(1 for x in items if predicate(x)) / len(items), 1)


def write_jsonl(profiles: list[PlayerProfile], *, name: str) -> str:
    """Write profiles to s3://<curated>/profiles/{name}/data.jsonl. Returns the URI."""
    bucket = os.environ["S3_CURATED_BUCKET"]
    key = f"profiles/{name}/data.jsonl"
    body = "\n".join(p.model_dump_json() for p in profiles).encode("utf-8")
    s3io._client().put_object(Bucket=bucket, Key=key, Body=body)
    return f"s3://{bucket}/{key}"
