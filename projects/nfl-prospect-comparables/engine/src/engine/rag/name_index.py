"""Resolve prospect names from a free-text query to player_ids.

Why this matters: Bedrock KB's hybrid retrieval surfaces text-similar
chunks, but a query like "Tell me about Carnell Tate" can rank Tate's
own scouting report below other prospects whose chunks happen to share
generic football vocabulary. Filtering by `player_id` at retrieve time
guarantees the right document — at the cost of needing a name → id map.

Resolution tiers (return as much as possible — never silently None for a
query that mentions a real player):
  1. Full-name substring match (e.g. "Carnell Tate" → cfb-4871023).
  2. Last-name substring match (e.g. "Love" → all three Loves; pick the
     newest cohort as the primary, surface the others as alternatives).
  3. Fuzzy first/last token match (e.g. "Mendza" → Mendoza). Single
     edit-distance error tolerated.
  4. None only when the query truly has no name-like token.

The index is cached in-process; first call costs ~3 S3 GetObject calls.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Iterable

import boto3


# Cohort priority — most recent first. Used to break ties when a name
# matches multiple cohorts (e.g. two players named "Mike Williams").
_COHORT_PRIORITY = {
    "prediction_2026": 0,
    "validation_2021_2025": 1,
    "training_2014_2020": 2,
}

DEFAULT_BUCKET = os.environ.get(
    "NFLCOMPARABLES_CURATED_BUCKET",
    "nflcomparablesdata-curatedbucket6a59c97e-7doifyurcsxx",
)

# Tokens too generic to anchor a name match on. Includes common
# sentence-starters that get capitalized but aren't proper nouns
# ("Best 2026 RB?" → "Best" is capitalized but not a name).
_STOPWORDS = {
    "the", "a", "an", "of", "and", "or", "is", "tell", "me", "about",
    "what", "who", "how", "why", "where", "when", "his", "her", "their",
    "show", "give", "can", "you", "from", "for", "as", "to", "with",
    "qb", "rb", "wr", "te", "quarterback", "running", "back", "wide",
    "receiver", "tight", "end", "draft", "prospect", "profile", "report",
    "scouting", "comp", "comps", "comparable", "compare", "comparison",
    # capitalizable sentence-starters / generic adjectives that aren't names
    "best", "top", "find", "list", "good", "bad", "describe", "summary",
    "summarize", "explain", "look", "looks", "looking", "rank", "rate",
    "rated", "year", "years", "season", "seasons", "class", "classes",
}


@dataclass
class PlayerEntry:
    player_id: str
    name: str
    position: str
    cohort: str
    draft_year: int | None

    @property
    def first_name(self) -> str:
        return self.name.split()[0] if self.name else ""

    @property
    def last_name(self) -> str:
        parts = self.name.split()
        return parts[-1] if parts else ""


@dataclass
class ResolveResult:
    """What `resolve_name` returns. `primary` is None only if no name-like
    token was found in the query at all — never because we couldn't pick
    among ambiguous matches."""
    primary: PlayerEntry | None
    candidates: list[PlayerEntry] = field(default_factory=list)
    tier: str = "none"  # "exact" | "ambiguous_full" | "last_name" | "fuzzy" | "none"
    notes: list[str] = field(default_factory=list)


@lru_cache(maxsize=1)
def _load_index() -> tuple[PlayerEntry, ...]:
    """All players sorted longest-name-first for greedy substring match."""
    s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    entries: list[PlayerEntry] = []
    for cohort in (
        "prediction_2026",
        "validation_2021_2025",
        "training_2014_2020",
    ):
        try:
            body = s3.get_object(
                Bucket=DEFAULT_BUCKET,
                Key=f"profiles/{cohort}/data.jsonl",
            )["Body"].read().decode("utf-8")
        except Exception:
            continue
        for line in body.splitlines():
            if not line.strip():
                continue
            p = json.loads(line)
            pid = p.get("player_id")
            if not pid:
                continue
            bio = p.get("bio") or {}
            draft = p.get("draft") or {}
            name = bio.get("full_name") or p.get("name") or ""
            if not name:
                continue
            entries.append(
                PlayerEntry(
                    player_id=pid,
                    name=name,
                    position=bio.get("position") or p.get("position") or "",
                    cohort=cohort,
                    draft_year=draft.get("year"),
                )
            )
    entries.sort(
        key=lambda e: (-len(e.name), _COHORT_PRIORITY.get(e.cohort, 99))
    )
    return tuple(entries)


def _query_tokens(query: str) -> list[str]:
    """All meaningful tokens, lowercased (for substring/last-name match)."""
    return [
        t for t in re.findall(r"[A-Za-z][A-Za-z'\-]+", query.lower())
        if t not in _STOPWORDS and len(t) >= 3
    ]


def _capitalized_tokens(query: str) -> list[str]:
    """Tokens that look like proper nouns (capitalized in original casing).

    Used to gate fuzzy matching — we only fuzzy-match against tokens that
    *look* like names in the original query, so "Mendza" (capitalized
    typo) matches "Mendoza" but "best" doesn't fuzzy to "West".
    """
    return [
        t.lower()
        for t in re.findall(r"[A-Z][A-Za-z'\-]+", query)
        if t.lower() not in _STOPWORDS and len(t) >= 4
    ]


def _levenshtein_le(a: str, b: str, max_dist: int) -> bool:
    """True iff Levenshtein(a, b) <= max_dist. Lightweight DP for short strings."""
    if abs(len(a) - len(b)) > max_dist:
        return False
    if a == b:
        return True
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i] + [0] * len(b)
        min_in_row = curr[0]
        for j, cb in enumerate(b, start=1):
            curr[j] = min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + (0 if ca == cb else 1),
            )
            if curr[j] < min_in_row:
                min_in_row = curr[j]
        if min_in_row > max_dist:
            return False
        prev = curr
    return prev[-1] <= max_dist


def _by_priority(entries: Iterable[PlayerEntry]) -> list[PlayerEntry]:
    return sorted(
        entries,
        key=lambda e: (_COHORT_PRIORITY.get(e.cohort, 99), -len(e.name)),
    )


def resolve_name(query: str) -> ResolveResult:
    """Tiered resolution. Always returns a `ResolveResult`; `tier` says how.

    Caller can use `primary` for a single-player filter, or `candidates`
    for an OR-filter across all matches (preferred when `tier` is
    "ambiguous_full" or "last_name").
    """
    q = query.lower()
    index = _load_index()

    # Tier 1: full-name substring match.
    full_hits = [e for e in index if e.name.lower() in q]
    if len(full_hits) == 1:
        return ResolveResult(primary=full_hits[0], candidates=full_hits, tier="exact")
    if len(full_hits) > 1:
        ranked = _by_priority(full_hits)
        return ResolveResult(
            primary=ranked[0],
            candidates=ranked,
            tier="ambiguous_full",
            notes=[f"{len(ranked)} prospects share that full name across cohorts"],
        )

    # Tier 2: last-name substring match (token-level, len ≥ 3).
    qtokens = _query_tokens(query)
    if qtokens:
        # Match if any query token equals an entry's last name (case-insensitive).
        last_hits = [
            e for e in index
            if e.last_name and e.last_name.lower() in qtokens
        ]
        # Also match first name when distinctive (≥ 5 chars to avoid
        # generic "Will", "Ben"-style noise).
        first_hits = [
            e for e in index
            if e.first_name and len(e.first_name) >= 5
            and e.first_name.lower() in qtokens
        ]
        # Intersect when both exist for same player; union otherwise.
        first_ids = {e.player_id for e in first_hits}
        if first_hits and last_hits:
            both = [e for e in last_hits if e.player_id in first_ids]
            if both:
                ranked = _by_priority(both)
                return ResolveResult(
                    primary=ranked[0],
                    candidates=ranked,
                    tier="exact" if len(ranked) == 1 else "ambiguous_full",
                )
        hits = last_hits or first_hits
        if hits:
            ranked = _by_priority(hits)
            kind = "last_name" if last_hits else "first_name"
            return ResolveResult(
                primary=ranked[0],
                candidates=ranked,
                tier=kind,
                notes=[
                    f"{len(ranked)} prospect(s) match by "
                    f"{'last' if last_hits else 'first'} name"
                ],
            )

    # Tier 3: fuzzy. One edit-distance error allowed, but only against
    # *capitalized* tokens in the original query (proper-noun signal).
    # Without this guard, generic words like "best" fuzzy-match to "West".
    cap_tokens = _capitalized_tokens(query)
    if cap_tokens:
        fuzzy_hits: dict[str, PlayerEntry] = {}
        for e in index:
            for token in (e.first_name.lower(), e.last_name.lower()):
                if not token or len(token) < 4:
                    continue
                for qt in cap_tokens:
                    if _levenshtein_le(qt, token, max_dist=1):
                        fuzzy_hits[e.player_id] = e
                        break
                else:
                    continue
                break
        if fuzzy_hits:
            ranked = _by_priority(fuzzy_hits.values())[:5]
            return ResolveResult(
                primary=ranked[0],
                candidates=ranked,
                tier="fuzzy",
                notes=["matched via fuzzy spelling — verify the prospect"],
            )

    # Tier 4: nothing. Caller should fall through to unfiltered retrieval.
    return ResolveResult(primary=None, candidates=[], tier="none")


def candidates(query: str, *, limit: int = 5) -> list[PlayerEntry]:
    """Convenience accessor for the candidate list."""
    return resolve_name(query).candidates[:limit]
