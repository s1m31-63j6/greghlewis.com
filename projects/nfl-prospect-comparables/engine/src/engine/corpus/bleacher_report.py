"""Bleacher Report scraper — per-prospect scouting articles + position rankings.

B/R publishes two complementary content types:

  1. Per-prospect scouting articles, one player per article. URL pattern:
     `bleacherreport.com/articles/<id>-<slug>-2026-nfl-draft-scouting-report-...`
     Each article carries a multi-paragraph scouting writeup from the B/R
     Scouting Dept (Brandon Thorn, Dame Parson, etc.), often with bulleted
     strengths and a bottom-line summary.
  2. Position-group rankings articles ("2026 NFL Draft QB Rankings and
     Grades", same for RB/WR/TE) — multiple prospects per article, each
     with their own prose section.

Both render as static HTML in the article body; we extract <p> nodes
under the article container and scan each for cohort-prospect last names,
attaching the body part to the first match.

Output: per-player public S3 prefix
    corpus/recency/bleacher_report/<player_id>__<slug>.txt
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


@dataclass(frozen=True)
class CohortHit:
    profile: PlayerProfile
    text: str


def _text(node: Tag) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


# B/R wraps articles in a container that includes nav / "TOP NEWS" sidebars
# we want to skip. The actual scouting prose lives in the main slide
# elements; rather than match the BR-specific class names (which churn), we
# walk all <p> tags in document order, filter to long-prose ones, and rely
# on the cohort-name match to pick out the actually-relevant body parts.
def parse_article(html: str) -> list[BodyPart]:
    soup = BeautifulSoup(html, "lxml")
    parts: list[BodyPart] = []
    for el in soup.find_all("p"):
        text = _text(el)
        if not text or len(text) < 60:
            continue
        # Drop obvious sidebar / navigation lines
        if "TOP NEWS" in text or "Coaches Hype" in text:
            continue
        parts.append(BodyPart(text=text))
    return parts


def fetch_article(url: str, session: requests.Session) -> str:
    resp = session.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


# ---------- cohort matching ----------


def build_cohort_pattern(
    cohort: list[PlayerProfile],
) -> tuple[re.Pattern[str], dict[str, list[PlayerProfile]]]:
    by_last: dict[str, list[PlayerProfile]] = {}
    for p in cohort:
        last = _last_token(p.name)
        by_last.setdefault(last, []).append(p)
    last_names = sorted(by_last.keys(), key=lambda s: -len(s))
    escaped = [re.escape(ln) for ln in last_names if ln]
    pattern = re.compile(r"\b(" + "|".join(escaped) + r")\b")
    return pattern, by_last


def match_body_parts(
    parts: list[BodyPart],
    cohort: list[PlayerProfile],
) -> list[CohortHit]:
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
            blurb_n = _normalize(bp.text)
            by_first = [
                p for p in candidates
                if _normalize(p.name.split()[0]) in blurb_n
            ]
            if len(by_first) == 1:
                chosen = by_first[0]
            else:
                continue
        hits.append(CohortHit(profile=chosen, text=bp.text))
    return hits


def url_slug(url: str) -> str:
    m = re.search(r"/articles/(\d+)(?:-([^/?#]+))?", url)
    if not m:
        return "article"
    parts = [p for p in (m.group(1), m.group(2)) if p]
    return "-".join(parts)[:80]


def render_text(article_url: str, hit: CohortHit) -> str:
    header = f"# Bleacher Report ({article_url}) — {hit.profile.name}"
    return f"{header}\n\n{hit.text.strip()}\n"
