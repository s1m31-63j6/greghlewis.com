"""Pro Football Network prospect-profile scraper.

PFN exposes per-prospect pages under a slug-only URL:
    https://www.profootballnetwork.com/nfl-draft-hq/prospects/<slug>

where <slug> is the prospect's name lowercased and hyphenated. Each page
carries Jacob Infante's analyst writeup (strengths / weaknesses / projection)
plus combine measurables. We pull the article body as plain text.

Output: per-player public S3 prefix
    corpus/pfn/{player_id}.txt
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

import requests
from bs4 import BeautifulSoup

from engine.schema import PlayerProfile


BASE = "https://www.profootballnetwork.com"
PROSPECT_URL_FMT = f"{BASE}/nfl-draft-hq/prospects/{{slug}}"

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
    return s.lower()


def name_to_slug(name: str) -> str:
    """Convert 'Caleb Downs' → 'caleb-downs'.

    Drops suffixes (Jr./Sr./II/III), strips apostrophes and periods,
    keeps alphanumerics, joins with single hyphens.
    """
    n = _normalize(name)
    parts = [p for p in re.split(r"[\s\-_.]+", n) if p]
    parts = [p for p in parts if p not in {"jr", "sr", "ii", "iii", "iv"}]
    parts = [re.sub(r"[^a-z0-9]", "", p) for p in parts]
    parts = [p for p in parts if p]
    return "-".join(parts)


@dataclass(frozen=True)
class PfnPage:
    slug: str
    text: str


_BAD_PHRASES = (
    "Subscribe to our newsletter",
    "Cookie",
    "© Pro Football",
    "Industry Consensus Big Board",
    "Build Your Own Big Board",
)


def _extract_main_text(html: str) -> str | None:
    """Pull the main article body text. Falls back to <main> or longest <article>."""
    soup = BeautifulSoup(html, "lxml")
    article = soup.find("article") or soup.find("main")
    if not article:
        # Some pages use a div with class 'entry-content' / 'post-content'
        article = soup.find(class_=re.compile(r"(entry|post)-content", re.I))
    if not article:
        return None
    # Strip nav / footer / aside blocks
    for selector in ["nav", "footer", "aside", "header", "form", "script", "style"]:
        for el in article.find_all(selector):
            el.decompose()
    text = article.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Drop any line containing one of the noise phrases
    text = "\n".join(
        ln for ln in text.splitlines()
        if not any(bp in ln for bp in _BAD_PHRASES)
    )
    return text.strip() if len(text) > 200 else None


def fetch_prospect(slug: str, session: requests.Session) -> PfnPage | None:
    url = PROSPECT_URL_FMT.format(slug=slug)
    resp = session.get(url, timeout=20)
    if resp.status_code == 404:
        return None
    if resp.status_code >= 400:
        return None
    text = _extract_main_text(resp.text)
    if not text:
        return None
    return PfnPage(slug=slug, text=text)


def fetch_for_profile(profile: PlayerProfile, session: requests.Session) -> PfnPage | None:
    """Try the slug for this profile's name. PFN uses a single slug pattern,
    so name-disambiguation collisions surface as no-content matches."""
    return fetch_prospect(name_to_slug(profile.name), session)
