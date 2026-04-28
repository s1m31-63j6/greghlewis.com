"""Universal engineered features applicable to all skill positions.

Computes features keyed by name from `engine.features.catalog.UNIVERSAL` for
each PlayerProfile. Features fall into five blocks:

  * athletic       — cohort percentiles + composite indices over combine drills
  * age & draft    — birth-date math, draft capital, college longevity
  * recruit        — 247Sports composite + body-comp development
  * trajectory     — season-by-season production arc (slope, peak, breakout, CV)
  * context        — team quality at breakout, conference tier

Game-level context features (sos_mean, share_vs_ranked, perf_vs_ranked_delta,
perf_in_bowl_games, perf_road_delta, returning_production_role) are intentionally
deferred — they require flattening CFBD games_player_stats (doubly-nested struct
list) plus joins against weekly rankings and SP+ ratings. Tracked as a follow-up.
"""

from __future__ import annotations

import io
import math
import os
import statistics
from dataclasses import dataclass, field
from datetime import date, datetime

import polars as pl

from engine.io import s3 as s3io
from engine.schema import PlayerProfile, Position

POWER_FIVE = {
    "Southeastern Conference",
    "Big Ten Conference",
    "Big Twelve Conference",
    "Atlantic Coast Conference",
    "Pac-10 Conference",
    "Pacific Twelve Conference",
    "Pacific-12 Conference",
    "Pacific 12 Conference",
}

SKILL_POSITIONS = {Position.QB, Position.RB, Position.WR, Position.TE}

# ---------- helpers ----------


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


def _percentile(value: float | None, reference: list[float]) -> float | None:
    """ECDF percentile of `value` within `reference` (0..100)."""
    if value is None or not reference:
        return None
    n = len(reference)
    rank = sum(1 for x in reference if x <= value)
    return round(100.0 * rank / n, 1)


def _inverse_percentile(value: float | None, reference: list[float]) -> float | None:
    """Same, but lower raw value = higher percentile (use for forty, cone, shuttle)."""
    if value is None or not reference:
        return None
    n = len(reference)
    rank = sum(1 for x in reference if x >= value)
    return round(100.0 * rank / n, 1)


def _geomean(values: list[float]) -> float | None:
    """Geometric mean over positive values; None if empty or any non-positive."""
    if not values:
        return None
    if any(v <= 0 for v in values):
        return None
    return round(math.exp(sum(math.log(v) for v in values) / len(values)), 2)


# ---------- cohort context ----------


@dataclass
class CohortContext:
    """Pre-loaded shared reference data + per-position drill distributions."""

    profiles: list[PlayerProfile]
    drill_dists: dict[Position, dict[str, list[float]]] = field(default_factory=dict)
    age_dists: dict[Position, list[float]] = field(default_factory=dict)
    height_dists: dict[Position, list[float]] = field(default_factory=dict)
    weight_dists: dict[Position, list[float]] = field(default_factory=dict)
    pss_wide: pl.DataFrame | None = None  # per (espn_id, season) → wide stats
    recruits: pl.DataFrame | None = None  # keyed by athleteId (= espn_id)
    crosswalk: pl.DataFrame | None = None  # gsis_id → espn_id
    sp_ratings: pl.DataFrame | None = None  # (year, team) → rating

    def espn_id_for(self, profile: PlayerProfile) -> int | None:
        if self.crosswalk is None:
            return None
        # crosswalk is small (~25k rows) — filter is fine
        match = self.crosswalk.filter(pl.col("pfr_id") == profile.player_id)
        if match.height == 0:
            return None
        v = match["espn_id"][0]
        return int(v) if v is not None else None


# ---------- context construction ----------


_STAT_MAP = {
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


def _load_pss_wide(raw_bucket: str) -> pl.DataFrame:
    """Per (espn_id, season, team) wide pivot of CFBD player_season_stats."""
    keys = sorted(
        k for k in _list_keys(raw_bucket, "raw/cfbd/player_season_stats/")
        if k.endswith("data.parquet")
    )
    frames = [_read_parquet(raw_bucket, k) for k in keys]
    long = pl.concat(frames, how="vertical_relaxed").select(
        pl.col("season"),
        pl.col("playerId").cast(pl.Int64, strict=False).alias("espn_id"),
        pl.col("team"),
        pl.col("conference"),
        pl.col("category"),
        pl.col("statType"),
        pl.col("stat").cast(pl.Float64, strict=False).alias("stat_value"),
    )
    metrics = []
    for (cat, stype), name in _STAT_MAP.items():
        metrics.append(
            pl.when((pl.col("category") == cat) & (pl.col("statType") == stype))
            .then(pl.col("stat_value"))
            .otherwise(None)
            .sum()
            .alias(name)
        )
    return long.group_by(["espn_id", "season", "team", "conference"]).agg(metrics)


def _load_recruits(raw_bucket: str) -> pl.DataFrame:
    """All CFBD recruits keyed by athleteId (matches espn_id)."""
    keys = sorted(
        k for k in _list_keys(raw_bucket, "raw/cfbd/recruits/")
        if k.endswith("data.parquet")
    )
    frames = [_read_parquet(raw_bucket, k) for k in keys]
    df = pl.concat(frames, how="vertical_relaxed")
    return (
        df.filter(pl.col("athleteId").is_not_null())
        .select(
            pl.col("athleteId").cast(pl.Int64, strict=False).alias("espn_id"),
            pl.col("year").alias("recruit_year"),
            pl.col("ranking").cast(pl.Int64, strict=False).alias("recruit_ranking"),
            pl.col("stars").cast(pl.Int64, strict=False).alias("recruit_stars"),
            pl.col("rating").cast(pl.Float64, strict=False).alias("recruit_rating"),
            pl.col("weight").cast(pl.Float64, strict=False).alias("recruit_weight_lbs"),
            pl.col("height").cast(pl.Float64, strict=False).alias("recruit_height_in"),
        )
        # If a player is in recruits multiple years (rare — JUCO), take the earliest
        .sort("recruit_year")
        .group_by("espn_id")
        .agg(pl.all().first())
    )


def _load_crosswalk(raw_bucket: str) -> pl.DataFrame:
    df = _read_parquet(raw_bucket, "raw/nflverse/ff_playerids/data.parquet")
    return df.select(
        pl.col("pfr_id"),
        pl.col("gsis_id"),
        pl.col("espn_id").cast(pl.Int64, strict=False).alias("espn_id"),
    )


def _load_sp(raw_bucket: str) -> pl.DataFrame:
    keys = sorted(
        k for k in _list_keys(raw_bucket, "raw/cfbd/sp_ratings/")
        if k.endswith("data.parquet")
    )
    frames = [_read_parquet(raw_bucket, k) for k in keys]
    df = pl.concat(frames, how="vertical_relaxed")
    return df.select(
        pl.col("year").cast(pl.Int64).alias("year"),
        pl.col("team"),
        pl.col("rating").cast(pl.Float64).alias("sp_rating"),
    )


def build_context(profiles: list[PlayerProfile], raw_bucket: str) -> CohortContext:
    """Pre-compute per-position drill / age / size distributions and load shared frames."""
    ctx = CohortContext(profiles=profiles)

    # Per-position drill distributions for percentile features
    for pos in SKILL_POSITIONS:
        cohort = [p for p in profiles if p.position == pos]
        ctx.drill_dists[pos] = {
            "forty": [p.athletic.forty_yard for p in cohort if p.athletic.forty_yard is not None],
            "vertical": [p.athletic.vertical_inches for p in cohort if p.athletic.vertical_inches is not None],
            "broad_jump": [p.athletic.broad_jump_inches for p in cohort if p.athletic.broad_jump_inches is not None],
            "three_cone": [p.athletic.three_cone for p in cohort if p.athletic.three_cone is not None],
            "shuttle": [p.athletic.shuttle for p in cohort if p.athletic.shuttle is not None],
            "bench": [p.athletic.bench_press_reps for p in cohort if p.athletic.bench_press_reps is not None],
        }
        ctx.height_dists[pos] = [
            p.bio.height_inches for p in cohort if p.bio.height_inches is not None
        ]
        ctx.weight_dists[pos] = [
            p.bio.weight_lbs for p in cohort if p.bio.weight_lbs is not None
        ]
        # age fills lazily after we compute it for each player

    ctx.pss_wide = _load_pss_wide(raw_bucket)
    ctx.recruits = _load_recruits(raw_bucket)
    ctx.crosswalk = _load_crosswalk(raw_bucket)
    ctx.sp_ratings = _load_sp(raw_bucket)
    return ctx


# ---------- feature blocks ----------


def _draft_date(year: int) -> date:
    """NFL draft is consistently the last full Thurs-Sat of April. Approximate as Apr 25."""
    return date(year, 4, 25)


def _athletic_features(p: PlayerProfile, ctx: CohortContext) -> dict[str, float]:
    f: dict[str, float | None] = {}
    pos = p.position
    a = p.athletic
    bio = p.bio

    # Lower-is-better drills (forty, cone, shuttle): use inverse percentile
    f["forty_pct"] = _inverse_percentile(a.forty_yard, ctx.drill_dists[pos]["forty"])
    f["three_cone_pct"] = _inverse_percentile(a.three_cone, ctx.drill_dists[pos]["three_cone"])
    f["shuttle_pct"] = _inverse_percentile(a.shuttle, ctx.drill_dists[pos]["shuttle"])
    # Higher-is-better drills
    f["vertical_pct"] = _percentile(a.vertical_inches, ctx.drill_dists[pos]["vertical"])
    f["broad_jump_pct"] = _percentile(a.broad_jump_inches, ctx.drill_dists[pos]["broad_jump"])
    f["bench_pct"] = _percentile(a.bench_press_reps, ctx.drill_dists[pos]["bench"])
    f["height_pct"] = _percentile(bio.height_inches, ctx.height_dists[pos])
    f["weight_pct"] = _percentile(bio.weight_lbs, ctx.weight_dists[pos])

    # BMI
    if bio.height_inches and bio.weight_lbs:
        f["bmi"] = round(703.0 * bio.weight_lbs / (bio.height_inches ** 2), 2)

    # Speed score (RB/WR): 200 * weight / forty^4
    if a.forty_yard and bio.weight_lbs and pos in (Position.RB, Position.WR):
        f["speed_score"] = round(200.0 * bio.weight_lbs / (a.forty_yard ** 4), 2)

    # Burst & agility composites
    if a.vertical_inches is not None and a.broad_jump_inches is not None:
        f["burst_score"] = round(a.vertical_inches + a.broad_jump_inches, 1)
    if a.three_cone is not None and a.shuttle is not None:
        # lower = better; we keep raw sum and let downstream interpret. Negate
        # so higher values = more agile, consistent with other composites.
        f["agility_score"] = round(-(a.three_cone + a.shuttle), 2)

    # Catch radius — height + arm length. Arm length isn't ingested, so this
    # stays None for v1. Documented in catalog.

    # Custom indices
    if a.forty_yard and bio.weight_lbs:
        # Weight-adjusted forty: heavier-and-fast scores better (size-fast).
        # forty * sqrt(200/weight) — lower is better, so we negate for embedding-friendly direction.
        f["forty_per_pound"] = round(-(a.forty_yard * math.sqrt(200.0 / bio.weight_lbs)), 3)

    # Athletic composite — geo mean of available position-cohort percentiles.
    pcts = [
        f.get(k) for k in (
            "forty_pct", "vertical_pct", "broad_jump_pct",
            "three_cone_pct", "shuttle_pct", "bench_pct",
        )
    ]
    available = [v for v in pcts if v is not None and v > 0]
    if len(available) >= 3:  # require ≥3 drills for a meaningful composite
        f["athletic_composite"] = _geomean(available)

    # RAS-equivalent: arithmetic mean of available percentiles, scaled to 0-10.
    ras_inputs = [
        v for v in pcts + [f.get("height_pct"), f.get("weight_pct")]
        if v is not None
    ]
    if len(ras_inputs) >= 4:
        f["ras_score"] = round(sum(ras_inputs) / len(ras_inputs) / 10.0, 2)

    return {k: v for k, v in f.items() if v is not None}


def _age_draft_features(p: PlayerProfile, ctx: CohortContext) -> dict[str, float]:
    f: dict[str, float | None] = {}
    pos = p.position
    bio = p.bio
    draft = p.draft

    # age_at_draft (years, decimal)
    age = None
    if bio.birth_date:
        d = _draft_date(draft.draft_year)
        age = (d - bio.birth_date).days / 365.25
        f["age_at_draft"] = round(age, 3)

        # days_since_birthday_at_draft (0..364)
        # birthday in draft_year, possibly already passed — use modular distance
        bday_this_year = bio.birth_date.replace(year=draft.draft_year)
        diff = (d - bday_this_year).days % 365
        f["days_since_birthday_at_draft"] = float(diff)

    # age_at_draft_pct — fill via lazy population of ctx.age_dists
    if age is not None:
        if pos not in ctx.age_dists or not ctx.age_dists[pos]:
            ctx.age_dists[pos] = [
                ((_draft_date(q.draft.draft_year) - q.bio.birth_date).days / 365.25)
                for q in ctx.profiles
                if q.position == pos and q.bio.birth_date
            ]
        # younger = better → inverse percentile
        f["age_at_draft_pct"] = _inverse_percentile(age, ctx.age_dists[pos])

    # draft_capital_pct: 1 - (pick / 256). UDFAs (no pick) → 0.
    if draft.draft_pick is not None:
        f["draft_capital_pct"] = round(1.0 - (draft.draft_pick / 256.0), 3)
    else:
        f["draft_capital_pct"] = 0.0

    # college_seasons + transferred + conference_p5
    seasons = p.college_counting.seasons
    if seasons is not None:
        f["college_seasons"] = float(seasons)
    if bio.college:
        f["transferred"] = 1.0 if ";" in bio.college else 0.0
    if bio.college_conference:
        f["conference_p5"] = 1.0 if bio.college_conference in POWER_FIVE else 0.0

    return {k: v for k, v in f.items() if v is not None}


def _recruit_features(p: PlayerProfile, ctx: CohortContext) -> dict[str, float]:
    if ctx.recruits is None or ctx.crosswalk is None:
        return {}
    espn_id = ctx.espn_id_for(p)
    if espn_id is None:
        return {}
    rec_row = ctx.recruits.filter(pl.col("espn_id") == espn_id)
    if rec_row.height == 0:
        return {}
    r = rec_row.to_dicts()[0]

    f: dict[str, float | None] = {}
    if r.get("recruit_stars") is not None:
        f["recruit_star_rating"] = float(r["recruit_stars"])

    # Composite percentile within the player's own recruiting class (so a 0.95
    # rating in 2014 isn't unfairly compared to inflation in later years).
    if r.get("recruit_rating") is not None and r.get("recruit_year") is not None:
        peer_ratings = (
            ctx.recruits
            .filter(pl.col("recruit_year") == r["recruit_year"])
            .filter(pl.col("recruit_rating").is_not_null())
            ["recruit_rating"]
            .to_list()
        )
        f["recruit_composite_pct"] = _percentile(r["recruit_rating"], peer_ratings)

    # recruiting_to_draft_delta: positive = riser
    pct = f.get("recruit_composite_pct")
    if pct is not None and p.draft.draft_pick is not None:
        draft_pct = (1.0 - (p.draft.draft_pick / 256.0)) * 100.0
        f["recruiting_to_draft_delta"] = round(draft_pct - pct, 1)

    # weight_change_recruit_to_draft
    if r.get("recruit_weight_lbs") and p.bio.weight_lbs:
        f["weight_change_recruit_to_draft"] = round(
            float(p.bio.weight_lbs) - float(r["recruit_weight_lbs"]), 1
        )

    return {k: v for k, v in f.items() if v is not None}


def _trajectory_features(p: PlayerProfile, ctx: CohortContext) -> dict[str, float]:
    """Career arc analysis from per-season production.

    Production scalar by position:
      QB: pass_yards + 9 * pass_tds - 30 * interceptions  (PFR-ish weight)
      RB: rush_yards + rec_yards + 6 * (rush_tds + rec_tds)
      WR/TE: rec_yards + 6 * rec_tds
    """
    if ctx.pss_wide is None or ctx.crosswalk is None:
        return {}
    espn_id = ctx.espn_id_for(p)
    if espn_id is None:
        return {}
    seasons_df = ctx.pss_wide.filter(pl.col("espn_id") == espn_id).sort("season")
    if seasons_df.height < 2:
        return {}

    # Production scalar
    if p.position == Position.QB:
        seasons_df = seasons_df.with_columns(
            (
                pl.col("pass_yards").fill_null(0)
                + 9 * pl.col("pass_tds").fill_null(0)
                - 30 * pl.col("interceptions").fill_null(0)
            ).alias("prod")
        )
    elif p.position == Position.RB:
        seasons_df = seasons_df.with_columns(
            (
                pl.col("rush_yards").fill_null(0)
                + pl.col("rec_yards").fill_null(0)
                + 6 * (pl.col("rush_tds").fill_null(0) + pl.col("rec_tds").fill_null(0))
            ).alias("prod")
        )
    else:  # WR, TE
        seasons_df = seasons_df.with_columns(
            (
                pl.col("rec_yards").fill_null(0)
                + 6 * pl.col("rec_tds").fill_null(0)
            ).alias("prod")
        )

    seasons = seasons_df["season"].to_list()
    prods = seasons_df["prod"].to_list()
    teams = seasons_df["team"].to_list()
    n = len(prods)

    f: dict[str, float | None] = {}

    # career trend slope (linear regression)
    if n >= 2:
        x_mean = sum(seasons) / n
        y_mean = sum(prods) / n
        num = sum((seasons[i] - x_mean) * (prods[i] - y_mean) for i in range(n))
        den = sum((s - x_mean) ** 2 for s in seasons)
        f["career_trend_slope"] = round(num / den, 2) if den > 0 else None

    # final-year z within own career. Clip to ±5 to prevent explosions when
    # prior_std is tiny (e.g. transfer QBs with one prior near-zero year).
    if n >= 3 and statistics.pstdev(prods[:-1]) > 0:
        prior_mean = statistics.mean(prods[:-1])
        prior_std = statistics.pstdev(prods[:-1])
        z = (prods[-1] - prior_mean) / prior_std
        f["final_year_z"] = round(max(-5.0, min(5.0, z)), 2)

    # consistency: 1 / CV (coefficient of variation), capped
    if n >= 2:
        y_mean = sum(prods) / n
        if y_mean > 0:
            std = statistics.pstdev(prods)
            cv = std / y_mean
            f["consistency"] = round(min(1.0 / cv, 5.0) if cv > 0 else 5.0, 2)
            f["production_variance_ratio"] = round(min(cv, 3.0), 3)

    # late-career growth: final year prod - first year prod
    f["late_career_growth"] = float(prods[-1] - prods[0])

    # best season age & breakout age
    if p.bio.birth_date:
        # season "age" = age on Sep 1 of that season year
        ages = [
            (date(s, 9, 1) - p.bio.birth_date).days / 365.25 for s in seasons
        ]
        peak_idx = max(range(n), key=lambda i: prods[i])
        f["best_season_age"] = round(ages[peak_idx], 2)

        # breakout: first season where prod > 75th percentile of player's own seasons
        threshold = sorted(prods)[int(0.75 * (n - 1))] if n > 1 else prods[0]
        for i in range(n):
            if prods[i] >= threshold and prods[i] > 0:
                f["breakout_age"] = round(ages[i], 2)
                break

    # dominator_rating + age_adjusted_dominator (RB/WR/TE only)
    if p.position in (Position.RB, Position.WR, Position.TE):
        # Compute team total in each player season, then player's share
        shares = []
        for i in range(n):
            team = teams[i]
            season = seasons[i]
            if not team or season is None:
                continue
            team_total = (
                ctx.pss_wide
                .filter((pl.col("team") == team) & (pl.col("season") == season))
                .with_columns(
                    (
                        pl.col("rush_yards").fill_null(0)
                        + pl.col("rec_yards").fill_null(0)
                        + 6 * (pl.col("rush_tds").fill_null(0) + pl.col("rec_tds").fill_null(0))
                    ).alias("prod_team")
                )["prod_team"].sum()
            )
            if team_total and team_total > 0:
                shares.append(prods[i] / team_total)
        if shares:
            peak_share = max(shares)
            f["dominator_rating"] = round(peak_share, 3)
            # Age-adjusted: penalize late breakouts. Reference age = 22.
            if "breakout_age" in f:
                age_factor = 1.0 + 0.05 * (22.0 - f["breakout_age"])
                f["age_adjusted_dominator"] = round(peak_share * age_factor, 3)

    return {k: v for k, v in f.items() if v is not None}


def _context_features(p: PlayerProfile, ctx: CohortContext) -> dict[str, float]:
    """Team-quality features. Game-level splits deferred to follow-up."""
    if ctx.pss_wide is None or ctx.crosswalk is None or ctx.sp_ratings is None:
        return {}
    espn_id = ctx.espn_id_for(p)
    if espn_id is None:
        return {}
    seasons_df = ctx.pss_wide.filter(pl.col("espn_id") == espn_id).sort("season")
    if seasons_df.height == 0:
        return {}

    # Identify peak season by position-relevant production
    if p.position == Position.QB:
        seasons_df = seasons_df.with_columns(
            (
                pl.col("pass_yards").fill_null(0)
                + 9 * pl.col("pass_tds").fill_null(0)
                - 30 * pl.col("interceptions").fill_null(0)
            ).alias("prod")
        )
    elif p.position == Position.RB:
        seasons_df = seasons_df.with_columns(
            (
                pl.col("rush_yards").fill_null(0) + pl.col("rec_yards").fill_null(0)
            ).alias("prod")
        )
    else:
        seasons_df = seasons_df.with_columns(pl.col("rec_yards").fill_null(0).alias("prod"))

    peak = seasons_df.sort("prod", descending=True).head(1)
    if peak.height == 0:
        return {}
    peak_team = peak["team"][0]
    peak_year = peak["season"][0]
    if not peak_team or peak_year is None:
        return {}
    sp = ctx.sp_ratings.filter(
        (pl.col("year") == int(peak_year)) & (pl.col("team") == peak_team)
    )
    if sp.height == 0:
        return {}
    return {"team_quality_at_breakout": round(float(sp["sp_rating"][0]), 2)}


# ---------- top-level ----------


def compute(profile: PlayerProfile, ctx: CohortContext) -> dict[str, float]:
    """Compute every implementable universal feature for a single player."""
    feats: dict[str, float] = {}
    feats.update(_athletic_features(profile, ctx))
    feats.update(_age_draft_features(profile, ctx))
    feats.update(_recruit_features(profile, ctx))
    feats.update(_trajectory_features(profile, ctx))
    feats.update(_context_features(profile, ctx))
    return feats
