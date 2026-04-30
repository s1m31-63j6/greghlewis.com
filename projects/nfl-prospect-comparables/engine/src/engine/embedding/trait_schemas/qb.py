"""QB scouting-archetype traits.

Dimensions chosen to match the QBASE 2.0 / Football Outsiders / Campus2Canton
expert framework: arm strength, accuracy at depth, processing, mobility,
pocket presence, decision-making. Plus ceiling/floor as range estimators.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class TraitWithQuote(BaseModel):
    """Scored trait with a supporting quote from the scouting text.

    `quote` MUST be a near-verbatim excerpt from the source — never a
    summary or paraphrase. If the scouting reports don't address the trait,
    both `score` and `quote` are null.
    """
    score: int | None = Field(default=None, ge=1, le=5)
    quote: str | None = Field(default=None, max_length=200)


class QBTraits(BaseModel):
    arm_strength: TraitWithQuote = Field(
        description="Raw velocity, deep-ball drive, ability to drive throws into tight windows."
    )
    accuracy_short: TraitWithQuote = Field(
        description="Ball placement on 0-9 yard throws (slants, hooks, flats)."
    )
    accuracy_intermediate: TraitWithQuote = Field(
        description="Ball placement on 10-19 yard throws (digs, comebacks, seams)."
    )
    accuracy_deep: TraitWithQuote = Field(
        description="Ball placement on 20+ yard throws (go routes, posts, deep crossers)."
    )
    processing_speed: TraitWithQuote = Field(
        description="Pre-snap reads + post-snap recognition. Speed of progressions, anticipation throws."
    )
    pocket_presence: TraitWithQuote = Field(
        description="Feel for pressure, ability to slide/climb in the pocket and keep eyes downfield."
    )
    mobility: TraitWithQuote = Field(
        description="Designed-run threat + scrambling ability + extending plays with feet."
    )
    decision_making: TraitWithQuote = Field(
        description="Turnover-worthy-throw avoidance, when to take checkdowns, INT risk."
    )
    toughness: TraitWithQuote = Field(
        description="Durability, plays through pain, takes hits, leadership in adversity."
    )
    mechanics: TraitWithQuote = Field(
        description="Footwork, throwing motion, base, repeatable release."
    )
    ceiling: TraitWithQuote = Field(
        description="Best-case NFL outcome the scouting suggests (1=backup-only, 5=All-Pro/HOF)."
    )
    floor: TraitWithQuote = Field(
        description="Worst-case downside risk (1=high bust risk, 5=safe long-time starter floor)."
    )


# Stable alphabetical order for vectorization. MUST match the field names above.
QB_TRAIT_NAMES: tuple[str, ...] = (
    "accuracy_deep",
    "accuracy_intermediate",
    "accuracy_short",
    "arm_strength",
    "ceiling",
    "decision_making",
    "floor",
    "mechanics",
    "mobility",
    "pocket_presence",
    "processing_speed",
    "toughness",
)
