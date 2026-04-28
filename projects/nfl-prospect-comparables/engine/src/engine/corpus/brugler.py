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
    r"A\s+(?:\w+|\w+-year)\s+(?:starter|backup|reserve)\s+at\s+([^,]+?),\s+(\w+(?:\s+(?:Jr\.?|Sr\.?|II|III|IV))?)\s",
    re.IGNORECASE,
)


def split_profiles(full_text: str) -> list[BruglerProfile]:
    """Split the full PDF text into prospect profiles by SUMMARY: markers.

    Each profile is the chunk of text from the previous "SUMMARY:" (or
    document start for the first) to the next "SUMMARY:" — so the SUMMARY
    paragraph itself is the END of its block, with stats + STRENGTHS +
    WEAKNESSES preceding it. The last profile extends to the next major
    section header or end of doc.
    """
    profiles: list[BruglerProfile] = []
    # 2018-2024 use "SUMMARY: " (colon + space). 2026 dropped the colon and
    # switched to bullet-point STRENGTHS / WEAKNESSES sections — SUMMARY in
    # 2026 is followed by a newline. Accept either format.
    matches = list(re.finditer(r"SUMMARY:?\s+", full_text))
    for i, m in enumerate(matches):
        # Block content runs from the previous SUMMARY-end (or doc start) up
        # to the END of this SUMMARY paragraph (next "SUMMARY:" or +5000 chars
        # for the very last profile).
        start = matches[i - 1].end() if i > 0 else 0
        end = matches[i + 1].start() if i + 1 < len(matches) else min(m.end() + 5000, len(full_text))
        block = full_text[start:end]
        # SUMMARY paragraph: the text right after the "SUMMARY: " marker.
        # ~2000 chars covers the typical 1-2 paragraph summary; bounded above
        # by the next profile's start.
        summary_text = full_text[m.end(): min(m.end() + 2000, end)]
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
