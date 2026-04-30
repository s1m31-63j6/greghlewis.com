"""WR scouting-archetype traits.

Dimensions chosen to match the WR analytics consensus (Reception Perception,
Hayden Winks, JJ Zachariason, RotoViz Workout Explorer, PlayerProfiler):
separation, contested catch, route tree, YAC, hands, speed, versatility.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from engine.embedding.trait_schemas.qb import TraitWithQuote


class WRTraits(BaseModel):
    separation_quickness: TraitWithQuote = Field(
        description="Releases off the line + short-area separation at break points."
    )
    contested_catch: TraitWithQuote = Field(
        description="High-pointing the ball, body control through contact, 50/50 ball success."
    )
    route_tree_breadth: TraitWithQuote = Field(
        description="Mastery of the full route tree (vs slot-only or X-only specialist)."
    )
    yac_ability: TraitWithQuote = Field(
        description="Yards-after-catch elusiveness, breaking tackles after the catch."
    )
    hands_consistency: TraitWithQuote = Field(
        description="Reliable hands, low drop rate, secure catch radius."
    )
    vertical_speed: TraitWithQuote = Field(
        description="Long speed for vertical routes, deep threat element."
    )
    slot_outside_versatility: TraitWithQuote = Field(
        description="Plays both slot and outside; alignment-flexible vs single-role."
    )
    physicality_blocking: TraitWithQuote = Field(
        description="Run-game blocking effort and effectiveness; willingness in the dirty work."
    )
    ceiling: TraitWithQuote = Field(
        description="Best-case NFL outcome (1=WR4/return, 5=All-Pro WR1)."
    )
    floor: TraitWithQuote = Field(
        description="Worst-case downside risk (1=high bust, 5=safe rotational WR3)."
    )


WR_TRAIT_NAMES: tuple[str, ...] = (
    "ceiling",
    "contested_catch",
    "floor",
    "hands_consistency",
    "physicality_blocking",
    "route_tree_breadth",
    "separation_quickness",
    "slot_outside_versatility",
    "vertical_speed",
    "yac_ability",
)
