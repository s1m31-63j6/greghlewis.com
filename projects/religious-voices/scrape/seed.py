"""Seed passages — small, hand-curated public-domain excerpts.

Used by `build.py --seed` to generate a minimal corpus suitable for
testing the full stack end-to-end before the proper scrapers are wired
in. The text here should be cross-checked against the canonical source
URL before any production deploy.
"""

from __future__ import annotations

import yaml

from chunk import SourceText
from common import SEED_PASSAGES_YAML, Leader


def load_seed_passages(leaders: list[Leader]) -> list[SourceText]:
    """Load the seed passages YAML if present; return empty list otherwise."""
    if not SEED_PASSAGES_YAML.exists():
        return []
    leader_lookup = {l.leader_id: l for l in leaders}
    with SEED_PASSAGES_YAML.open() as f:
        raw = yaml.safe_load(f) or {}
    out: list[SourceText] = []
    for entry in raw.get("passages", []):
        lid = entry["leader_id"]
        if lid not in leader_lookup:
            continue
        out.append(
            SourceText(
                leader_id=lid,
                religion=leader_lookup[lid].religion,
                work_title=entry["work_title"],
                source_url=entry["source_url"],
                text=entry["text"],
                year=entry.get("year"),
            )
        )
    return out
