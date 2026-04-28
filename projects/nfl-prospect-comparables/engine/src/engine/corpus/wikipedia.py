"""Wikipedia per-player text extraction via the MediaWiki API.

Returns plain-text extracts (lead + biographical sections) for cohort
players. Strategy: try direct title match first (fast path), fall back
to opensearch with "American football" disambiguation hint. Verify the
result is a football player by checking for football keywords in the
extract — guards against name-collision pages.

Wikipedia coverage skews toward drafted players who have NFL careers.
UDFAs and pre-CFBD-era prospects often have no Wikipedia article.
"""

from __future__ import annotations

import requests

from engine.schema import PlayerProfile


WIKI_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "NFLProspectComparables/0.1 (https://greghlewis.com)"
HEADERS = {"User-Agent": USER_AGENT}

_FOOTBALL_KEYWORDS = (
    "nfl",
    "national football league",
    "football",
    "drafted",
    "quarterback",
    "running back",
    "wide receiver",
    "tight end",
    "offensive tackle",
    "linebacker",
    "cornerback",
    "safety",
)


def _looks_like_football_player(text: str) -> bool:
    """Verify the extract is about a football player (not a name collision)."""
    if not text or len(text) < 200:
        return False
    lower = text[:2000].lower()
    return any(k in lower for k in _FOOTBALL_KEYWORDS)


def fetch_extract(title: str, *, max_chars: int = 5000) -> str | None:
    """Fetch a plain-text Wikipedia extract for `title`. Follows redirects.
    Returns the truncated extract or None if missing."""
    try:
        r = requests.get(
            WIKI_API,
            params={
                "action": "query",
                "format": "json",
                "titles": title,
                "prop": "extracts",
                "explaintext": 1,
                "redirects": 1,
            },
            headers=HEADERS,
            timeout=15,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    pages = r.json().get("query", {}).get("pages", {})
    if not pages:
        return None
    page = next(iter(pages.values()))
    if "missing" in page:
        return None
    extract = page.get("extract", "")
    if not extract:
        return None
    return extract[:max_chars]


def search_title(name: str, hint: str = "American football") -> str | None:
    """Open-search to find the best matching title for a player name."""
    try:
        r = requests.get(
            WIKI_API,
            params={
                "action": "opensearch",
                "format": "json",
                "search": f"{name} {hint}",
                "limit": 5,
            },
            headers=HEADERS,
            timeout=15,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    data = r.json()
    titles = data[1] if len(data) > 1 else []
    return titles[0] if titles else None


def fetch_player_text(
    profile: PlayerProfile, *, max_chars: int = 5000
) -> tuple[str | None, str | None]:
    """Resolve a profile to a Wikipedia extract.

    Returns `(extract, resolved_title)`. Tries direct title match first,
    falls back to opensearch with football hint. Verifies the result
    looks like a football player.
    """
    name = profile.name
    # Fast path — exact name as title
    extract = fetch_extract(name, max_chars=max_chars)
    if extract and _looks_like_football_player(extract):
        return extract, name
    # Try with disambiguation suffix
    for suffix in ("(American football)", f"({profile.position.name.lower()})"):
        title = f"{name} {suffix}"
        extract = fetch_extract(title, max_chars=max_chars)
        if extract and _looks_like_football_player(extract):
            return extract, title
    # Fall back to opensearch
    title = search_title(name)
    if title and title.lower() != name.lower():
        extract = fetch_extract(title, max_chars=max_chars)
        if extract and _looks_like_football_player(extract):
            return extract, title
    return None, None
