"""Canonical PlayerProfile schema and outcome classification.

A PlayerProfile is a snapshot of a draft-eligible skill-position player
*at the time of the draft*, including pre-draft features and (where settled)
post-draft career outcomes. It's the unit of record the comparables engine
embeds, retrieves, and reasons over.

Comprehensive over complete: this schema accommodates fields we may not
fill in v1. Coverage will grow over time without breaking changes.
"""

from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "0.1.0"


class Position(str, Enum):
    QB = "QB"
    RB = "RB"
    WR = "WR"
    TE = "TE"


SKILL_POSITIONS: tuple[Position, ...] = (Position.QB, Position.RB, Position.WR, Position.TE)


class OutcomeClass(str, Enum):
    """Five-tier career outcome label. Defined precisely in classify_outcome()."""

    BUST = "Bust"
    ROLE = "Role Player"
    STARTER = "Starter"
    PRO_BOWL = "Pro Bowl"
    HOF_TRACK = "HOF-track"


# --- nested record types ---


class Bio(BaseModel):
    model_config = ConfigDict(extra="forbid")

    birth_date: date | None = None
    height_inches: float | None = None
    weight_lbs: float | None = None
    hand_size_inches: float | None = None
    arm_length_inches: float | None = None
    college: str | None = None
    college_conference: str | None = None
    hometown_state: str | None = None
    hometown_country: str | None = "USA"


class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_year: int = Field(..., ge=1999, le=2100)
    draft_round: int | None = Field(None, ge=1, le=7)  # null for UDFA
    draft_pick: int | None = Field(None, ge=1, le=300)
    draft_team: str | None = None  # team abbreviation
    age_at_draft: float | None = None  # decimal years
    days_since_birthday_at_draft: int | None = None


class Athletic(BaseModel):
    """Combine + Pro Day measurables. Each percentile is z-scored within
    the player's position cohort across the historical dataset."""

    model_config = ConfigDict(extra="forbid")

    forty_yard: float | None = None
    vertical_inches: float | None = None
    broad_jump_inches: float | None = None
    three_cone: float | None = None
    shuttle: float | None = None
    bench_press_reps: int | None = None
    ras_score: float | None = None  # Relative Athletic Score, 0-10

    # percentile vs position cohort (0-100)
    forty_pct: float | None = None
    vertical_pct: float | None = None
    broad_jump_pct: float | None = None
    three_cone_pct: float | None = None
    shuttle_pct: float | None = None
    bench_pct: float | None = None
    height_pct: float | None = None
    weight_pct: float | None = None

    # composite athletic indices
    speed_score: float | None = None  # weight × 200 / 40^4 (RB-classic)
    burst_score: float | None = None  # vertical + broad
    agility_score: float | None = None  # 3cone + shuttle
    catch_radius: float | None = None  # height + arm length, for receivers


class CollegeCounting(BaseModel):
    """Career-aggregate counting stats. Position-specific fields will be
    null where they don't apply (a QB has no rec_yards; a WR has no
    pass_attempts in the typical case)."""

    model_config = ConfigDict(extra="forbid")

    seasons: int | None = None
    games: int | None = None

    # passing
    pass_attempts: int | None = None
    pass_completions: int | None = None
    pass_yards: int | None = None
    pass_tds: int | None = None
    interceptions: int | None = None
    sacks_taken: int | None = None
    sack_yards_lost: int | None = None

    # rushing
    rush_attempts: int | None = None
    rush_yards: int | None = None
    rush_tds: int | None = None

    # receiving
    receptions: int | None = None
    rec_yards: int | None = None
    rec_tds: int | None = None
    targets: int | None = None  # often unavailable in college box scores

    # accolades
    all_americans: int | None = None  # # of seasons named to AA team
    all_conference: int | None = None  # # of seasons all-conf
    heisman_finalist: bool | None = None


class CareerOutcome(BaseModel):
    """Settled-as-of-X NFL career outcome. Filled in for the training cohort
    (2014-2020 draft classes once 5+ seasons are in the books). Null for
    the prediction cohort."""

    model_config = ConfigDict(extra="forbid")

    settled_through_season: int | None = None  # the most recent NFL season included
    nfl_seasons_played: int | None = None
    games_played: int | None = None
    games_started: int | None = None
    starting_seasons: int | None = None  # # seasons where started >50% games
    career_snaps: int | None = None
    career_av: int | None = None  # Pro Football Reference Approximate Value
    peak_av: int | None = None  # single-season peak AV
    pro_bowls: int | None = None
    first_team_all_pros: int | None = None
    second_team_all_pros: int | None = None
    in_hof: bool | None = None  # already inducted (rare for our cohort)


class PlayerProfile(BaseModel):
    """The atomic record the comparables engine embeds and retrieves."""

    model_config = ConfigDict(extra="forbid")

    # --- identity ---
    player_id: str  # canonical: PFR id (e.g., "AlleJo01")
    name: str
    position: Position
    aliases: list[str] = Field(default_factory=list)

    # --- nested ---
    bio: Bio
    draft: Draft
    athletic: Athletic = Field(default_factory=Athletic)
    college_counting: CollegeCounting = Field(default_factory=CollegeCounting)

    # --- engineered features ---
    # Sparse map: feature names from features.catalog.CATALOG. Values are
    # always floats for embedding compatibility (booleans → 0.0/1.0).
    features: dict[str, float] = Field(default_factory=dict)

    # --- scouting text references (RAG corpus) ---
    # URIs into S3 — actual text is embedded separately and stored in pgvector,
    # never directly in this profile.
    scouting_text_refs: dict[str, str] = Field(default_factory=dict)

    # --- outcome (training cohort only) ---
    outcome: CareerOutcome | None = None
    outcome_class: OutcomeClass | None = None  # cached classification

    # --- provenance ---
    schema_version: str = SCHEMA_VERSION
    data_sources: list[str] = Field(default_factory=list)


# --- outcome classification ---

# Threshold constants — tweak with care; all references to outcome class must
# flow through classify_outcome().
HOF_TRACK_PRO_BOWLS = 3
HOF_TRACK_REQUIRES_ALL_PRO = 1  # at least one All-Pro nod (1st or 2nd team)
PRO_BOWL_MIN = 1
STARTER_MIN_SNAPS = 3000
STARTER_MIN_STARTING_SEASONS = 2
ROLE_MIN_SNAPS = 500


def classify_outcome(career: CareerOutcome) -> OutcomeClass:
    """Apply tier rules in priority order (highest first).

    See project memory for the canonical rationale. Position-specific
    calibration may layer on top of this in v1.1+.
    """
    pro_bowls = career.pro_bowls or 0
    all_pros = (career.first_team_all_pros or 0) + (career.second_team_all_pros or 0)
    snaps = career.career_snaps or 0
    starting_seasons = career.starting_seasons or 0

    if pro_bowls >= HOF_TRACK_PRO_BOWLS and all_pros >= HOF_TRACK_REQUIRES_ALL_PRO:
        return OutcomeClass.HOF_TRACK
    if pro_bowls >= PRO_BOWL_MIN:
        return OutcomeClass.PRO_BOWL
    if snaps >= STARTER_MIN_SNAPS and starting_seasons >= STARTER_MIN_STARTING_SEASONS:
        return OutcomeClass.STARTER
    if snaps >= ROLE_MIN_SNAPS:
        return OutcomeClass.ROLE
    return OutcomeClass.BUST
