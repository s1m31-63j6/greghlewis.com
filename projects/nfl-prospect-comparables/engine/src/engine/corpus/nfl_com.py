"""Generic NFL.com article scraper.

NFL.com publishes draft analyst content as long-form articles with a
shared HTML structure: each article body is a `<div class="nfl-c-article__body">`
container holding a sequence of `nfl-c-body-part--text` divs (one paragraph
each). Daniel Jeremiah, Lance Zierlein, and Bucky Brooks all use this layout
across mock drafts, big boards, and position rankings.

Strategy: for each body part, scan its prose for any cohort prospect's
last name. Assign the body part to the FIRST cohort name that appears
(stable, simple, handles both "Mendoza is..." DJ-style and "The Jets
go with the here-and-now pass rusher over Arvell Reese . Bailey
attacks..." LZ-mock-style equally well). Multiple-name body parts get
attached to the first match — losing some signal but keeping the
parser tractable.

Output (one per matched prospect per article):
    corpus/recency/<source>/<player_id>__<article_slug>.txt
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

import requests
from bs4 import BeautifulSoup, Tag

from engine.schema import PlayerProfile


UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    return s


def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s]", " ", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _last_token(name: str) -> str:
    parts = name.replace(".", " ").split()
    while parts and parts[-1].rstrip(".") in {"Jr", "Sr", "II", "III", "IV"}:
        parts.pop()
    return parts[-1] if parts else name


@dataclass(frozen=True)
class BodyPart:
    text: str


def _text(node: Tag) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def parse_article(html: str) -> list[BodyPart]:
    """Extract per-paragraph body parts from an NFL.com article."""
    soup = BeautifulSoup(html, "lxml")
    body = (
        soup.find("div", class_="nfl-c-article__body")
        or soup.find("article")
        or soup
    )
    parts: list[BodyPart] = []
    for el in body.find_all(class_="nfl-c-body-part--text"):
        text = _text(el)
        if text and len(text) > 80:
            parts.append(BodyPart(text=text))
    return parts


def parse_paragraphs(html: str, min_chars: int = 120) -> list[BodyPart]:
    """Generic paragraph-scan for non-NFL.com articles. Returns each <p>
    tag's text as a body part (filtered by length to drop nav / sidebar)."""
    soup = BeautifulSoup(html, "lxml")
    parts: list[BodyPart] = []
    for el in soup.find_all("p"):
        text = _text(el)
        if text and len(text) >= min_chars:
            parts.append(BodyPart(text=text))
    return parts


def fetch_article(url: str, session: requests.Session) -> str:
    resp = session.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


def url_slug(url: str) -> str:
    """Derive a short article slug for filename disambiguation."""
    m = re.search(r"/news/([^/?#]+)", url)
    if not m:
        return "article"
    slug = m.group(1)
    # Trim to a sensible length and strip the ".php"-style trailing fluff
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:80]


# ---------- cohort matching ----------


@dataclass(frozen=True)
class CohortHit:
    """A body part that mentions exactly one (or first) cohort prospect."""
    profile: PlayerProfile
    text: str


def build_cohort_pattern(
    cohort: list[PlayerProfile],
) -> tuple[re.Pattern[str], dict[str, list[PlayerProfile]]]:
    """Return a single regex matching any cohort player's last name and a
    last-name → list-of-profiles lookup. Word-boundary matching on the
    raw last name avoids mid-word collisions ('Hall' inside 'Hallmark').
    """
    by_last: dict[str, list[PlayerProfile]] = {}
    for p in cohort:
        last = _last_token(p.name)
        by_last.setdefault(last, []).append(p)
    # Sort length-desc so longer last names (McNeil-Warren) match before
    # shorter ones (Warren) when the regex alternation is evaluated.
    last_names = sorted(by_last.keys(), key=lambda s: -len(s))
    escaped = [re.escape(ln) for ln in last_names if ln]
    pattern = re.compile(r"\b(" + "|".join(escaped) + r")\b")
    return pattern, by_last


def match_body_parts(
    parts: list[BodyPart],
    cohort: list[PlayerProfile],
) -> list[CohortHit]:
    """For each body part, attach to the FIRST cohort prospect whose last
    name appears. Disambiguates last-name collisions by checking which
    candidate's first name also appears in the body part text.
    """
    pattern, by_last = build_cohort_pattern(cohort)
    hits: list[CohortHit] = []
    for bp in parts:
        m = pattern.search(bp.text)
        if not m:
            continue
        last = m.group(1)
        candidates = by_last.get(last, [])
        if len(candidates) == 1:
            chosen = candidates[0]
        else:
            # Collision — try to disambiguate by first name presence
            blurb_n = _normalize(bp.text)
            by_first = [
                p for p in candidates
                if _normalize(p.name.split()[0]) in blurb_n
            ]
            if len(by_first) == 1:
                chosen = by_first[0]
            else:
                # Skip ambiguous body parts rather than misattribute
                continue
        hits.append(CohortHit(profile=chosen, text=bp.text))
    return hits


def render_text(source_label: str, article_url: str, hit: CohortHit) -> str:
    header = f"# {source_label} ({article_url}) — {hit.profile.name}"
    return f"{header}\n\n{hit.text.strip()}\n"
