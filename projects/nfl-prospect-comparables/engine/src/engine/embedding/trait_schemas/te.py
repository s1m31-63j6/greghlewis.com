"""TE scouting-archetype traits.

Dimensions chosen to capture the TE archetype spectrum (in-line blocker
vs receiving "move" TE) per scout consensus. CFBD has no formation /
blocking data so the public-data feature catalog can't separate Engram
from Kittle archetype directly — these traits do that work.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from engine.embedding.trait_schemas.qb import TraitWithQuote


class TETraits(BaseModel):
    receiving_radius: TraitWithQuote = Field(
        description="Length, catch radius, ability to high-point and extend the catch zone."
    )
    separation: TraitWithQuote = Field(
        description="Getting open vs LBs and safeties, route quickness despite TE size."
    )
    blocking_inline: TraitWithQuote = Field(
        description="In-line / Y-blocking ability, anchor in the run game."
    )
    blocking_in_space: TraitWithQuote = Field(
        description="Pulling, lead-blocking, downfield blocks in space."
    )
    formation_versatility: TraitWithQuote = Field(
        description="Used in-line, flexed, in slot, as H-back; alignment versatility."
    )
    yac_ability: TraitWithQuote = Field(
        description="Run-after-catch ability, finishing plays after receiving."
    )
    hands_consistency: TraitWithQuote = Field(
        description="Reliable hands, low drops, secures the catch."
    )
    speed: TraitWithQuote = Field(
        description="Functional speed in pads — vertical seam threat capability."
    )
    ceiling: TraitWithQuote = Field(
        description="Best-case NFL outcome (1=blocking specialist, 5=All-Pro receiving TE)."
    )
    floor: TraitWithQuote = Field(
        description="Worst-case downside risk (1=high bust, 5=safe rotational TE2)."
    )


TE_TRAIT_NAMES: tuple[str, ...] = (
    "blocking_in_space",
    "blocking_inline",
    "ceiling",
    "floor",
    "formation_versatility",
    "hands_consistency",
    "receiving_radius",
    "separation",
    "speed",
    "yac_ability",
)
