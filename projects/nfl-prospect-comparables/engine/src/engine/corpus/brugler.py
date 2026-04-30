"""Brugler "The Beast" PDF parser + cohort matcher.

LICENSING: Brugler text is licensed via The Athletic. Embeddings are
fine to store; raw text is private-S3-only and never exposed by the
site. The narrative-synthesis layer paraphrases + cites — never quotes
>5 consecutive words. See project memory for the full constraint.

Format observation (2019-2026 PDFs are consistent):
  - Each detailed prospect profile ends with a "SUMMARY:" paragraph
    starting with the formula
        "A {N}-year starter at {SCHOOL}, {LASTNAME} ..."
  - This pattern matches ~73% of the prospects with full STRENGTHS /
    WEAKNESSES / SUMMARY blocks. The remaining ~27% follow a different
    SUMMARY style (often defenders or "best of the rest" quick-takes);
    we extract those by SUMMARY-paragraph fallback but match-rate is
    lower.
  - Profile content is roughly the text between two adjacent
    "SUMMARY:" markers — captures stats + measurables + STRENGTHS +
    WEAKNESSES + SUMMARY for each prospect.

Output: per-player private S3 prefix
    corpus/brugler/{year}/{player_id}.txt
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

import pdfplumber

from engine.schema import PlayerProfile


# ---------- text normalization ----------


def _normalize(s: str) -> str:
    """Lowercase, strip accents/punct, collapse whitespace."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s]", " ", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ---------- PDF extraction ----------


def extract_full_text(pdf_path: str) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


@dataclass
class BruglerProfile:
    """One profile block from the Beast PDF, plus its inferred name/school."""
    last_name: str | None
    school_text: str | None       # exact school string from "A N-year starter at SCHOOL"
    summary_first: str            # first sentence of the SUMMARY paragraph
    summary_paragraph: str        # the SUMMARY paragraph (~2000 chars after marker)
    full_text: str                # the full profile block (between two SUMMARYs)


_STARTER_RE = re.compile(
    # Last-name capture group accepts hyphens (Smith-Njigba), straight
    # apostrophes (O'Connell), and curly apostrophe U+2019 (O’Connell —
    # what pdfplumber actually emits from Brugler PDFs).
    r"A\s+(?:\w+|\w+-year)\s+(?:starter|backup|reserve)\s+at\s+([^,]+?),\s+([\w\-’']+(?:\s+(?:Jr\.?|Sr\.?|II|III|IV))?)\s",
    re.IGNORECASE,
)


_STRENGTHS_RE = re.compile(r"STRENGTHS:?\s+", re.IGNORECASE)
_WEAKNESSES_RE = re.compile(r"WEAKNESSES:?\s+", re.IGNORECASE)
# Stat-table chapter breaks Brugler inserts between prospect groups —
# always belong to NEITHER the prospect before nor the prospect after.
_CHAPTER_BREAK_RE = re.compile(
    r"\b(BEST\s+(?:OF\s+THE\s+)?REST|TIER\s+\d+\s+(?:QUARTERBACK|RUNNING|RECEIVER|TIGHT|OFFENSIVE|DEFENSIVE|EDGE)|BACK\s+TO\s+TABLE\s+OF\s+CONTENTS)\b",
    re.IGNORECASE,
)
# Cap on prospect's deep-dive content (stats + STRENGTHS + WEAKNESSES +
# SUMMARY paragraph). Empirically ~3500 chars is the typical prospect
# block; 5000 is a safe upper bound that still excludes adjacent prospects.
_MAX_BLOCK_CHARS = 5000
# SUMMARY paragraph soft cap.
_SUMMARY_PARAGRAPH_MAX = 2500


def split_profiles(full_text: str) -> list[BruglerProfile]:
    """Split the full PDF text into prospect profiles, anchored on each
    prospect's own STRENGTHS marker rather than the previous prospect's
    SUMMARY end.

    Why this matters: between two adjacent SUMMARY: keywords, the PDF
    flow is `[prev SUMMARY paragraph] + [transition stat tables / "BEST
    OF THE REST"] + [stats] + [STRENGTHS:] + [WEAKNESSES:] + [SUMMARY:]
    + [this SUMMARY paragraph]`. The naive prev-SUMMARY-to-next-SUMMARY
    block bleeds in adjacent prospects' content (worst case: 25k chars
    of bleed for Carnell Tate, where a position-leader stat table sat
    between him and the previous prospect).

    Anchored layout (this version): for each SUMMARY: marker
        - back-anchor: the most recent STRENGTHS: marker before SUMMARY
          (this prospect's own deep-dive section start). Falls back to a
          small window if STRENGTHS isn't found.
        - forward-anchor: the SUMMARY paragraph end (next paragraph
          break, capped at _SUMMARY_PARAGRAPH_MAX, hard-stopped before
          a chapter-break marker).
        - reject the profile if the back-anchor isn't on the same
          chapter side as the SUMMARY (a chapter-break between
          STRENGTHS and SUMMARY means we crossed prospects).
    """
    profiles: list[BruglerProfile] = []
    summary_marks = list(re.finditer(r"SUMMARY:?\s+", full_text))
    strengths_marks = list(_STRENGTHS_RE.finditer(full_text))
    weaknesses_marks = list(_WEAKNESSES_RE.finditer(full_text))
    chapter_breaks = list(_CHAPTER_BREAK_RE.finditer(full_text))

    def _last_before(marks: list[re.Match], pos: int) -> re.Match | None:
        prev: re.Match | None = None
        for m in marks:
            if m.start() < pos:
                prev = m
            else:
                break
        return prev

    def _first_after(marks: list[re.Match], pos: int) -> re.Match | None:
        for m in marks:
            if m.start() > pos:
                return m
        return None

    def _is_crossed(start: int, end: int) -> bool:
        """True if a chapter-break marker sits between start and end —
        means we'd be stitching across a prospect-group boundary."""
        return any(start < cb.start() < end for cb in chapter_breaks)

    for i, m in enumerate(summary_marks):
        sp_start = m.end()

        # Forward: SUMMARY paragraph end. Cap at next prospect signal
        # (next STRENGTHS, next chapter break, or next SUMMARY).
        sp_end_cap = sp_start + _SUMMARY_PARAGRAPH_MAX
        next_strengths = _first_after(strengths_marks, sp_start)
        if next_strengths:
            sp_end_cap = min(sp_end_cap, next_strengths.start())
        next_break = _first_after(chapter_breaks, sp_start)
        if next_break:
            sp_end_cap = min(sp_end_cap, next_break.start())
        if i + 1 < len(summary_marks):
            sp_end_cap = min(sp_end_cap, summary_marks[i + 1].start())
        sp_end = min(sp_start + _SUMMARY_PARAGRAPH_MAX, sp_end_cap, len(full_text))
        # Prefer a clean paragraph break terminator if present.
        para_break = re.search(r"\n\s*\n", full_text[sp_start:sp_end])
        if para_break:
            sp_end = sp_start + para_break.start()
        summary_text = full_text[sp_start:sp_end]

        # Back-anchor: this prospect's own STRENGTHS (or fallback).
        my_strengths = _last_before(strengths_marks, m.start())
        # The most recent SUMMARY-end marks the absolute earliest start
        # any prospect's own content can begin (anything earlier is
        # someone else's territory).
        prev_summary_floor = (
            summary_marks[i - 1].end() if i > 0 else 0
        )

        if (
            my_strengths
            and my_strengths.start() > prev_summary_floor
            and (m.start() - my_strengths.start()) < _MAX_BLOCK_CHARS
            and not _is_crossed(my_strengths.start(), m.start())
        ):
            # Anchor on STRENGTHS; back up further to capture stats /
            # measurables that precede it (typically 1.5-3k chars).
            content_start = max(
                prev_summary_floor,
                my_strengths.start() - 3000,
            )
        else:
            # Best-of-the-rest quick takes have no STRENGTHS section.
            # Use a small fixed window so we don't drag in neighbors.
            content_start = max(prev_summary_floor, m.start() - 1500)

        # If a chapter-break sits between content_start and SUMMARY,
        # advance content_start past it (the chapter-break belongs to
        # the previous chapter).
        crossing = [
            cb for cb in chapter_breaks
            if content_start < cb.start() < m.start()
        ]
        if crossing:
            content_start = max(content_start, crossing[-1].end())

        block = full_text[content_start:sp_end]
        last_name = None
        school_text = None
        starter_m = _STARTER_RE.search(summary_text)
        if starter_m:
            school_text = starter_m.group(1).strip()
            last_name = starter_m.group(2).strip()
        first_sentence = re.split(r"(?<=[.!?])\s+(?=[A-Z])", summary_text)[0]
        profiles.append(BruglerProfile(
            last_name=last_name,
            school_text=school_text,
            summary_first=first_sentence,
            summary_paragraph=summary_text,
            full_text=block,
        ))
    return profiles


# ---------- cohort matching ----------


def _last_name_of(profile: PlayerProfile) -> str:
    """Best-effort last name from the cohort profile's full name."""
    parts = profile.name.replace(".", " ").split()
    # Strip Jr/Sr/II/III/IV suffixes
    while parts and parts[-1].rstrip(".") in {"Jr", "Sr", "II", "III", "IV"}:
        parts.pop()
    return parts[-1] if parts else profile.name


def match_profiles_to_cohort(
    profiles: list[BruglerProfile],
    cohort: list[PlayerProfile],
    draft_year: int,
) -> tuple[dict[str, BruglerProfile], list[BruglerProfile]]:
    """Match Brugler profiles to cohort player_ids by (last_name, school)
    where the cohort player's draft_year matches `draft_year`.

    Returns:
        matched: player_id → BruglerProfile
        unmatched: list of BruglerProfile with no cohort player found
    """
    candidates = [
        p for p in cohort if p.draft and p.draft.draft_year == draft_year
    ]
    # Index cohort by normalized last name → list of (player, school_norm)
    by_lastname: dict[str, list[tuple[PlayerProfile, str]]] = {}
    for cp in candidates:
        ln = _normalize(_last_name_of(cp))
        school_norm = _normalize(cp.bio.college or "")
        by_lastname.setdefault(ln, []).append((cp, school_norm))

    matched: dict[str, BruglerProfile] = {}
    unmatched: list[BruglerProfile] = []

    def _school_overlap(cp_school: str, bp_school: str) -> bool:
        if not cp_school or not bp_school:
            return False
        # Token overlap handles "USC; Oklahoma" (transfers) vs "USC".
        return bool(set(cp_school.split()) & set(bp_school.split()))

    # ---- pass 1: regex (last_name + school from "A N-year starter at SCHOOL,")
    for bp in profiles:
        if not bp.last_name:
            unmatched.append(bp)
            continue
        ln_norm = _normalize(bp.last_name)
        cands = by_lastname.get(ln_norm, [])
        if not cands:
            unmatched.append(bp)
            continue
        bp_school = _normalize(bp.school_text or "")
        # Verify school overlap even with a single same-last-name candidate —
        # multiple Brugler prospects can share a last name in the same draft
        # year (5 "Williams" profiles in 2024 across positions).
        school_hits = [cp for cp, sn in cands if _school_overlap(sn, bp_school)]
        if len(school_hits) == 1:
            cp = school_hits[0]
            if cp.player_id not in matched:
                matched[cp.player_id] = bp
            else:
                unmatched.append(bp)
        else:
            unmatched.append(bp)

    # ---- pass 2: name-search in SUMMARY paragraph
    # Catches non-standard SUMMARY formats (biographical openers, role-first
    # phrasing without "at SCHOOL"). Searches the SUMMARY paragraph (last
    # ~2000 chars of the profile block, which is where SUMMARY is) for any
    # unmatched cohort player's full name OR last name. Last-name fallback
    # only fires when the last name is unique among unmatched cohort players.
    unmatched_after_p1 = unmatched
    unmatched = []

    remaining_by_fullname: dict[str, PlayerProfile] = {}
    remaining_by_lastname: dict[str, list[PlayerProfile]] = {}
    for cp in candidates:
        if cp.player_id in matched:
            continue
        remaining_by_fullname[_normalize(cp.name)] = cp
        ln = _normalize(_last_name_of(cp))
        remaining_by_lastname.setdefault(ln, []).append(cp)

    def _claim(cp: PlayerProfile, bp: BruglerProfile) -> None:
        matched[cp.player_id] = bp
        remaining_by_fullname.pop(_normalize(cp.name), None)
        ln = _normalize(_last_name_of(cp))
        if ln in remaining_by_lastname:
            remaining_by_lastname[ln] = [
                x for x in remaining_by_lastname[ln] if x.player_id != cp.player_id
            ]
            if not remaining_by_lastname[ln]:
                del remaining_by_lastname[ln]

    # Restrict pass-2 search to the first ~200 chars of the SUMMARY paragraph —
    # the protagonist's name appears in the opening clause. Searching the full
    # paragraph causes false positives from teammate / comp mentions.
    def _summary_window(bp: BruglerProfile) -> str:
        return " " + _normalize(bp.summary_paragraph[:200]) + " "

    # ---- pass 2a: full-name matches first (higher precision than last-name)
    # Iterate twice so a profile that mentions a cohort player by last name
    # doesn't steal the assignment from that player's own profile.
    pass_2a_unmatched = []
    for bp in unmatched_after_p1:
        summary_norm = _summary_window(bp)
        hit_full = next(
            (cp for fn, cp in remaining_by_fullname.items()
             if fn and f" {fn} " in summary_norm),
            None,
        )
        if hit_full is not None:
            _claim(hit_full, bp)
        else:
            pass_2a_unmatched.append(bp)

    # ---- pass 2b: unique last-name match, with school-name guard
    # Skip if the last-name candidate is also the school name in this profile
    # (handles "starter at Washington, Johnson..." where Washington the SCHOOL
    # would otherwise match cohort player "Casey Washington" by last name).
    for bp in pass_2a_unmatched:
        summary_norm = _summary_window(bp)
        bp_school_tokens = set(_normalize(bp.school_text or "").split())
        ln_hits = [
            cps[0] for ln, cps in remaining_by_lastname.items()
            if len(cps) == 1 and ln
            and ln not in bp_school_tokens
            and f" {ln} " in summary_norm
        ]
        if len(ln_hits) == 1:
            _claim(ln_hits[0], bp)
        else:
            unmatched.append(bp)

    return matched, unmatched
