"""Walter Football pre-draft scouting report scraper + cohort matcher.

Walter Football publishes per-prospect scouting reports during draft season
in the format Strengths / Weaknesses / Summary — same structure as Brugler.
URL pattern: walterfootball.com/scoutingreport<year><slug>.php where <slug>
is one of:
  - <firstInitial><lastname>           e.g. pmahomes  (Patrick Mahomes)
  - <allInitials><lastname>            e.g. ojhoward  (O.J. Howard)
  - <fullFirstName><lastname>          e.g. marcuswilliams (Marcus Williams,
                                       used to disambiguate from Mike Williams)

Discovery: walterfootball.com/scoutingreports.php is the master archive.
~1013 reports across 2014-2024 (no 2025/2026 yet on master archive).

Output: per-player public S3 prefix
    corpus/walter_football/{player_id}.txt
"""

from __future__ import annotations

import html as _html
import re
import unicodedata
from dataclasses import dataclass

import requests

from engine.schema import PlayerProfile


BASE = "https://walterfootball.com"
ARCHIVE_URL = f"{BASE}/scoutingreports.php"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    return s


# ---------- text normalization ----------


def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s]", " ", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _alpha_only(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


# ---------- index discovery ----------


_INDEX_URL_RE = re.compile(r"scoutingreport(\d{4})([a-z]+)\.php", re.IGNORECASE)


@dataclass(frozen=True)
class IndexEntry:
    year: int
    slug: str       # everything after the year in the URL filename
    url: str


def fetch_archive(session: requests.Session) -> list[IndexEntry]:
    """Fetch the master archive (scoutingreports.php) and parse all
    per-prospect URLs. Returns one IndexEntry per unique URL."""
    resp = session.get(ARCHIVE_URL, timeout=30)
    resp.raise_for_status()
    seen: set[str] = set()
    out: list[IndexEntry] = []
    for m in _INDEX_URL_RE.finditer(resp.text):
        fname = m.group(0)
        if fname in seen:
            continue
        seen.add(fname)
        out.append(IndexEntry(
            year=int(m.group(1)),
            slug=m.group(2).lower(),
            url=f"{BASE}/{fname}",
        ))
    return out


# ---------- per-player extraction ----------


_STOP_MARKERS = (
    "Player Comparison",
    "Player Projection",
    "NFL Comparison",
    "NFL Match",
    "Best Player Comp",
    "Five-Year Outlook",
    "Five Year Outlook",
    "Forty Time",
    "Position Rank",
    "Class Rank",
    "Projected Round",
    "WalterFootball.com",
    "Click for Full Mock Draft",
    "AddThis Sharing",
    "Other 2014 NFL Draft Scouting Reports",
    "Other 2015 NFL Draft Scouting Reports",
    "Other 2016 NFL Draft Scouting Reports",
    "Other 2017 NFL Draft Scouting Reports",
    "Other 2018 NFL Draft Scouting Reports",
    "Other 2019 NFL Draft Scouting Reports",
    "Other 2020 NFL Draft Scouting Reports",
    "Other 2021 NFL Draft Scouting Reports",
    "Other 2022 NFL Draft Scouting Reports",
    "Other 2023 NFL Draft Scouting Reports",
    "Other 2024 NFL Draft Scouting Reports",
)

_BODY_START_RE = re.compile(r"\b(Strengths|Bottom Line|Synopsis)\s*[:\-]?", re.IGNORECASE)


def _strip_tags(html: str) -> str:
    """Render HTML to plain text, preserving paragraph breaks."""
    html = re.sub(r"<(script|style)[^>]*>[\s\S]*?</\1>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<\s*/(p|div|li|h[1-6]|tr|br)\s*>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"<\s*br[^>]*/?\s*>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    html = _html.unescape(html)
    html = re.sub(r"[ \t]+", " ", html)
    html = re.sub(r"\s*\n\s*", "\n", html)
    return html.strip()


def extract_scouting_text(page_html: str) -> str | None:
    body_match = re.search(r"<body[^>]*>([\s\S]+)</body>", page_html, re.IGNORECASE)
    body_html = body_match.group(1) if body_match else page_html
    text = _strip_tags(body_html)

    start_m = _BODY_START_RE.search(text)
    if not start_m:
        return None
    start = start_m.start()

    end = len(text)
    for marker in _STOP_MARKERS:
        i = text.find(marker, start)
        if i > 0 and i < end:
            end = i
    body = text[start:end].strip()
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body if len(body) > 200 else None


def fetch_scouting_report(url: str, session: requests.Session) -> str | None:
    resp = session.get(url, timeout=20)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return extract_scouting_text(resp.text)


# ---------- cohort matching ----------


def _last_name_of(profile: PlayerProfile) -> str:
    parts = profile.name.replace(".", " ").split()
    while parts and parts[-1].rstrip(".") in {"Jr", "Sr", "II", "III", "IV"}:
        parts.pop()
    return parts[-1] if parts else profile.name


def _first_part_of(profile: PlayerProfile) -> str:
    parts = profile.name.split()
    return parts[0] if parts else ""


def _candidate_slugs(profile: PlayerProfile) -> list[str]:
    """Generate candidate URL slugs Walter Football might use for this player.

    Pattern variants observed:
      - <firstInitial><lastname>            (most common)
      - <allInitialsConcatenated><lastname> (multi-initial firsts: O.J. Howard → ojhoward)
      - <fullFirstName><lastname>           (disambiguator: Marcus Williams → marcuswilliams)
    """
    last = _alpha_only(_last_name_of(profile))
    first = _first_part_of(profile)
    slugs: list[str] = []
    if not last or not first:
        return slugs

    # Split first part on dots/spaces — handles "O.J.", "T.J.", "C.J." etc.
    initials = "".join(p[0] for p in re.split(r"[.\s]+", first) if p).lower()
    first_alpha = _alpha_only(first)

    if initials:
        # single first letter
        slugs.append(f"{initials[0]}{last}")
        # all initials concatenated (only if more than one initial)
        if len(initials) > 1:
            slugs.append(f"{initials}{last}")
    if first_alpha and first_alpha != initials:
        slugs.append(f"{first_alpha}{last}")
    # de-dupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for s in slugs:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def build_cohort_slug_index(
    cohort: list[PlayerProfile],
) -> dict[tuple[int, str], list[PlayerProfile]]:
    """Build (draft_year, slug) → list of cohort players whose name could
    produce that slug. Multi-cohort use: pass the union of cohorts as the
    list and call once."""
    out: dict[tuple[int, str], list[PlayerProfile]] = {}
    for cp in cohort:
        if not cp.draft or cp.draft.draft_year is None:
            continue
        year = cp.draft.draft_year
        for slug in _candidate_slugs(cp):
            key = (year, slug)
            out.setdefault(key, []).append(cp)
    return out


def match_entry_to_cohort(
    entry: IndexEntry,
    slug_index: dict[tuple[int, str], list[PlayerProfile]],
) -> PlayerProfile | None:
    """Match one Walter Football URL slug to a cohort player via the
    pre-built (year, slug) index. Returns None on zero or multiple
    candidates (multiple = ambiguous, skip rather than guess)."""
    candidates = slug_index.get((entry.year, entry.slug), [])
    if len(candidates) == 1:
        return candidates[0]
    return None
