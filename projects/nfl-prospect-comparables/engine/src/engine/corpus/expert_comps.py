"""Expert pre-draft comp extraction for Phase 3.3 Jaccard eval.

For each cohort prospect, find the NFL players mentioned as comps by
pre-draft analysts (Brugler in The Beast, Walter Football's "Player
Comparison" section). The engine's top-5 kNN comps are then compared
to the expert-named comps via overlap / hit-rate metrics — a credibility
surface that translates to non-ML readers ("our engine agrees with the
expert consensus on X% of prospects").

Sources:
  - Brugler text in `corpus/brugler/<year>/<player_id>.txt` — extract via
    regex patterns ("in the mold of X", "reminds me of X", "similar to X",
    "reminiscent of X", "comparable to X").
  - Walter Football: re-scrape the per-prospect page and pull the
    "Player Comparison: ..." line. Stored separately in
    `corpus/walter_football_comps/<player_id>.txt` (one prose blob).

Output: `corpus/expert_comps/<player_id>.json`:
    {"brugler": ["Comp Name", ...],
     "walter_football": ["Comp Name", ...]}
Names are raw strings; the Jaccard eval resolves them to player_ids.
"""

from __future__ import annotations

import html as _html
import re
import unicodedata
from dataclasses import dataclass

import requests


UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    return s


# ---------- Brugler comp extraction ----------


# Patterns observed in Brugler text. Capture group is a noisy noun phrase
# spanning up to ~120 chars (allowing newlines — Brugler text often wraps mid-
# phrase). The actual NAME inside the capture is then resolved via _names_in.
_BRUGLER_PATTERNS = (
    r"\bin the mold of\s+([^.;]{2,120})",
    r"\b[Rr]eminds (?:me|us|one)? ?of\s+([^.;]{2,120})",
    r"\b[Ss]hades of\s+([^.;]{2,120})",
    r"\bsimilar to\s+([^.;]{2,120})",
    r"\b[Rr]eminiscent of\s+([^.;]{2,120})",
    r"\b[Cc]omparable to\s+([^.;]{2,120})",
    r"\b[Ee]vokes\s+(?:thoughts of\s+)?([^.;]{2,120})",
    r"\bcompares to\s+([^.;]{2,120})",
)

# Phrases that pad the captured text — strip these from the front.
_NAME_PREFIX_NOISE = (
    "the late",
    "former",
    "veteran",
    "Pro Bowler",
    "All-Pro",
    "Hall of Famer",
    "lesser version of",
    "a lesser version of",
    "a stronger version of",
    "a smaller version of",
    "a poor man's",
    "a poor man’s",
    "a younger",
    "a smaller",
    "a slightly better version of",
    "a slightly less",
)

# Common team prefixes that show up before names.
_TEAM_PREFIX_RE = re.compile(
    r"^(?:Seattle Seahawks’?|San Francisco 49ers’?|Buffalo Bills’?|Tennessee Titans’?|"
    r"Pittsburgh Steelers’?|New England Patriots’?|Kansas City Chiefs’?|Houston Texans’?|"
    r"Indianapolis Colts’?|Tampa Bay Buccaneers’?|New Orleans Saints’?|Atlanta Falcons’?|"
    r"Carolina Panthers’?|Detroit Lions’?|Green Bay Packers’?|Chicago Bears’?|"
    r"Minnesota Vikings’?|Dallas Cowboys’?|New York Giants’?|New York Jets’?|"
    r"Philadelphia Eagles’?|Washington Commanders’?|Los Angeles Rams’?|Los Angeles Chargers’?|"
    r"Las Vegas Raiders’?|Denver Broncos’?|Cleveland Browns’?|Cincinnati Bengals’?|"
    r"Baltimore Ravens’?|Miami Dolphins’?|Arizona Cardinals’?|Jacksonville Jaguars’?)\s+"
    r"(?:[A-Z]+\s+)?",  # optional position abbrev (RB, WR, etc.)
    re.IGNORECASE,
)

# Position abbrev prefixes (when team isn't named).
_POS_PREFIX_RE = re.compile(
    r"^(QB|RB|WR|TE|DL|DE|DT|LB|OLB|MLB|CB|S|FS|SS|OL|OT|OG|C|K|P)\s+",
)


def _strip_noise(name: str) -> str:
    """Pull a clean 'First Last' name out of noisy prefixed prose."""
    name = name.strip(" \t\n\r:;,—-.").strip()
    # Strip team prefix
    name = _TEAM_PREFIX_RE.sub("", name)
    # Strip position prefix
    name = _POS_PREFIX_RE.sub("", name)
    # Strip noise phrases (case-insensitive prefix)
    while True:
        original = name
        for noise in _NAME_PREFIX_NOISE:
            if name.lower().startswith(noise.lower()):
                name = name[len(noise):].strip(" \t\n\r:;,—-.").strip()
                break
        if name == original:
            break
    # Trim trailing parentheses, qualifiers like "(juh-TAY-vee-on)"
    name = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
    # Trim trailing prose like "in his prime" / "during his career"
    name = re.sub(
        r"\s+(?:in his prime|during his career|in college|out of \w+|of the \w+)$",
        "", name, flags=re.IGNORECASE,
    ).strip()
    return name


def _looks_like_name(name: str) -> bool:
    """Heuristic — does this look like a person's name? At least two
    capitalized tokens. Tolerates Mc/Mac, hyphens, apostrophes, dots."""
    if len(name) < 4 or len(name) > 60:
        return False
    tokens = name.split()
    if len(tokens) < 2 or len(tokens) > 5:
        return False
    if not all(t[0].isupper() for t in tokens):
        return False
    return True


# Pattern for "First Last", "First Last Jr.", "First M. Last", etc. The first
# token starts uppercase; subsequent name tokens may include lowercase prefixes
# like "de", "von", "Mc..", and may have apostrophes / hyphens.
_NAME_TOKEN = r"[A-Z][a-zA-Z'’\-.]+"
_NAME_RE = re.compile(
    rf"\b{_NAME_TOKEN}(?:\s+(?:Jr\.?|Sr\.?|II|III|IV|{_NAME_TOKEN})){{1,3}}\b"
)


def _names_in(span: str) -> list[str]:
    """Find every 'First Last' (and First Middle Last, etc.) name in a text span.
    Collapses internal whitespace (including newlines) to single space and
    strips trailing -type / -style modifiers."""
    # Collapse all whitespace so "Jake\nFerguson" parses as "Jake Ferguson"
    span = re.sub(r"\s+", " ", span)
    out: list[str] = []
    seen: set[str] = set()
    for m in _NAME_RE.finditer(span):
        name = m.group(0).strip()
        # Strip trailing "-type" / "-style" / "-esque" / "-like"
        name = re.sub(r"-(?:type|style|esque|like)$", "", name).strip()
        # Strip stray period-only or single-letter trailing tokens
        name = re.sub(r"\s+[A-Z]\.?\s*$", "", name).strip()
        if name not in seen and len(name.split()) >= 2:
            seen.add(name)
            out.append(name)
    return out


def extract_brugler_comps(text: str) -> list[str]:
    """Extract comp names from a Brugler scouting text. Returns deduped list
    in mention order. Strategy: regex hits a comp-introduction phrase ('in the
    mold of', 'similar to', etc.); we then extract the FIRST proper-name
    pattern in the captured span — tolerates noisy prefixes like 'a juiced-up
    Jakobi Meyers', 'that of Kyren Williams', team possessives, etc."""
    seen: set[str] = set()
    out: list[str] = []
    for pat in _BRUGLER_PATTERNS:
        for m in re.finditer(pat, text):
            span = m.group(1)
            for name in _names_in(span):
                # Filter out school/place names that match the name pattern —
                # require that no token is a known non-person word.
                if _is_clearly_not_person(name):
                    continue
                if name not in seen:
                    seen.add(name)
                    out.append(name)
                # Only take the first 1-2 names per pattern hit. Brugler
                # sometimes mentions 'reminds me of X and Y' which is fine,
                # but past 2 names the captured span is usually drift.
                if len([n for n in out if n in seen]) > 0:
                    break
    return out


# Hand-picked stop-words that look like Title Case names but aren't people:
# scheme/team words, conferences, awards, etc.
_NON_PERSON_TOKENS = frozenset({
    "Big", "ACC", "SEC", "PAC", "Big Ten", "Big 12", "AAC",
    "All-American", "All-Pro", "Pro Bowl", "Pro Bowler",
    "Hall of Fame", "Hall of Famer",
    "NFL", "NCAA", "Heisman", "Power",
    "Senior Bowl", "East", "West", "North", "South",
    "Day", "Round", "Combine", "Draft", "Bowl",
    "Cover", "Mike", "Will",  # ("Mike" / "Will" are LB position roles in Brugler text)
    "Y", "F", "Z", "X",  # Brugler's slot/position labels
})


def _is_clearly_not_person(name: str) -> bool:
    tokens = name.split()
    # Single non-person token disqualifies if it's the first token and the
    # rest of the name is short
    if len(tokens) <= 2 and tokens[0] in _NON_PERSON_TOKENS:
        return True
    # Names that look like school+role: "Texas Tech Red", "Bowling Green" etc.
    # Heuristic: if all tokens are common school/place words, reject.
    if all(t in _NON_PERSON_TOKENS for t in tokens):
        return True
    return False


# ---------- Walter Football comp section scraping ----------


def _strip_tags(html: str) -> str:
    html = re.sub(r"<(script|style)[^>]*>[\s\S]*?</\1>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<\s*/(p|div|li|h[1-6]|tr|br)\s*>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"<\s*br[^>]*/?\s*>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    html = _html.unescape(html)
    html = re.sub(r"[ \t]+", " ", html)
    html = re.sub(r"\s*\n\s*", "\n", html)
    return html.strip()


_WF_COMP_END_MARKERS = (
    "Player Projection",
    "Forty Time",
    "Position Rank",
    "Class Rank",
    "Projected Round",
    "Five-Year",
    "Five Year",
    "WalterFootball.com",
    "Other 20",  # "Other 2017 NFL Draft Scouting Reports"
    "AddThis",
)


def extract_walter_comp_section(page_html: str) -> str | None:
    """Pull the prose between 'Player Comparison' / 'NFL Comparison' and the
    next section marker. Returns None if no comparison section found."""
    body_match = re.search(r"<body[^>]*>([\s\S]+)</body>", page_html, re.IGNORECASE)
    body_html = body_match.group(1) if body_match else page_html
    text = _strip_tags(body_html)

    starts = (
        re.search(r"\bPlayer Comparison\b", text),
        re.search(r"\bNFL Comparison\b", text),
        re.search(r"\bBest Player Comp\b", text),
    )
    starts = [m for m in starts if m]
    if not starts:
        return None
    start = min(m.start() for m in starts)

    end = len(text)
    for marker in _WF_COMP_END_MARKERS:
        i = text.find(marker, start + 1)
        if i > 0 and i < end:
            end = i
    body = text[start:end].strip()
    return body if len(body) > 20 else None


_WF_COMP_HEAD_RE = re.compile(
    r"(?:Player Comparison|NFL Comparison|Best Player Comp)[^:\n]*:\s*([^\n.]{2,200})",
    re.IGNORECASE,
)


def extract_walter_comp_names(comp_section: str) -> list[str]:
    """From a Walter Football comp section, extract the comp NAMES from the
    leading 'Player Comparison: NAMES' line. Names are split on slashes,
    commas, and 'and'/'or'. Subsequent prose paragraphs may name additional
    comps but those are noisier — caller can use prose for justification
    text but only the head line for comp-set membership."""
    seen: set[str] = set()
    out: list[str] = []
    head = _WF_COMP_HEAD_RE.search(comp_section)
    if head:
        names_line = head.group(1).strip()
        # Split on /, comma, "and", "or"
        for raw in re.split(r"\s*[/,]\s*|\s+(?:and|or)\s+", names_line):
            cand = _strip_noise(raw)
            if _looks_like_name(cand) and cand not in seen:
                seen.add(cand)
                out.append(cand)
    return out


def fetch_walter_comp(url: str, session: requests.Session) -> tuple[str | None, list[str]]:
    """Fetch + parse a Walter Football scouting report URL. Returns
    (comp_section_prose_or_None, list_of_comp_names_from_head_line)."""
    resp = session.get(url, timeout=20)
    if resp.status_code == 404:
        return None, []
    resp.raise_for_status()
    section = extract_walter_comp_section(resp.text)
    if section is None:
        return None, []
    return section, extract_walter_comp_names(section)


# ---------- name normalization for matching ----------


def normalize_name_for_match(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s]", "", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    # Strip suffixes
    for suf in (" jr", " sr", " ii", " iii", " iv"):
        if s.endswith(suf):
            s = s[:-len(suf)]
    return s
