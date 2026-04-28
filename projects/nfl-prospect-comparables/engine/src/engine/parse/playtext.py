"""Parse CFBD `playText` into structured per-play fields.

CFBD plays carry a `playType` tag (Rush, Pass Reception, Pass Incompletion,
Pass Interception Return, Sack, Passing Touchdown, Rushing Touchdown, …)
plus a free-text `playText`. Format is consistent across 2014-2024 — see
fixtures below for canonical examples.

Output of `parse_play()` is a dict (not a Pydantic model — millions of plays
and we want zero-allocation hot paths). Attribution to espn_id happens
downstream via `engine.parse.resolver`.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# ---- play type buckets ----

PASS_PLAY_TYPES = frozenset({
    "Pass Reception",
    "Pass Incompletion",
    "Pass Interception Return",
    "Interception Return Touchdown",
    "Interception",
    "Pass Interception",
    "Passing Touchdown",
    "Sack",
    "Two Point Pass",
})

RUSH_PLAY_TYPES = frozenset({
    "Rush",
    "Rushing Touchdown",
    "Two Point Rush",
})


# ---- compiled patterns ----

# "Pat Mahomes pass complete to Keke Coutee for 12 yds to the TT 35 for a 1ST down"
# Trailing content (penalties, fumble notes) is allowed — anchor on prefix only.
_PASS_COMPLETE_RE = re.compile(
    r"^(?P<passer>.+?)\s+pass complete to\s+(?P<receiver>.+?)"
    r"\s+for\s+(?:(?P<yards>-?\d+)\s+yds?|no gain|a\s+loss\s+of\s+(?P<loss>\d+)\s+yards?)"
    r"(?:\s+to the\s+\S+\s+\d+)?"
    r"(?P<first_down>\s+for a 1ST down)?",
    re.IGNORECASE,
)

# Pass complete that ended in a TD (no "to the N yard line", instead "for a TD" or similar)
_PASS_TD_RE = re.compile(
    r"^(?P<passer>.+?)\s+pass complete to\s+(?P<receiver>.+?)"
    r"\s+for\s+(?:(?P<yards>-?\d+)\s+yds?|no gain)"
    r"\s+for a (?:TD|TOUCHDOWN)",
    re.IGNORECASE,
)

# Box-score TD format (alternative): "Receiver N Yd pass from Passer (Kicker Kick)"
_BOX_PASS_TD_RE = re.compile(
    r"^(?P<receiver>.+?)\s+\d+\s+Yd\s+pass\s+from\s+(?P<passer>[^()]+?)\s*\(",
    re.IGNORECASE,
)

# Box-score TD format: "Rusher N Yd Run (Kicker Kick)"
_BOX_RUSH_TD_RE = re.compile(
    r"^(?P<rusher>.+?)\s+\d+\s+Yd\s+Run\s*\(",
    re.IGNORECASE,
)

# "Drew Allar pass incomplete to Omari Evans"
# "Riley Leonard pass incomplete to Mitchell Evans, broken up by Amin Vanover"
# "Tucker Kilcrease pass incomplete"
# Penalty trailers are stripped upstream by `_strip_penalty()`.
_PASS_INCOMPLETE_RE = re.compile(
    r"^(?P<passer>.+?)\s+pass incomplete"
    r"(?:\s+to\s+(?P<receiver>[^,]+?))?"
    r"(?:,\s*broken up by\s+(?P<defender>.+?))?"
    r"\s*$",
    re.IGNORECASE,
)

# "Jake Waters pass intercepted Trovon Reed return for no gain to the KanSt 47"
# "Michael Brewer pass intercepted D.J. White return for no gain to the VTech 40"
# Defender pattern allows periods (initials), apostrophes, hyphens, accents.
_PASS_INT_RE = re.compile(
    r"^(?P<passer>.+?)\s+pass intercepted"
    r"(?:,\s*touchback\.?)?"
    r"(?:\s+(?P<defender>[A-Z][\w'\-\.\s]*?))?"
    r"(?:\s+return for\s+(?:(?P<ret_yards>-?\d+)\s+yds?|no gain))?"
    r"(?:\s+to the\s+\S+\s+\d+)?"
    r"\s*$",
    re.IGNORECASE,
)

# Interception Return TD box-score format: "Defender N Yd Interception Return (Kicker Kick)"
# Passer attribution is structurally absent — needs prior-play lookup downstream.
_INT_TD_BOX_RE = re.compile(
    r"^(?P<defender>.+?)\s+\d+\s+Yd\s+Interception\s+Return\s*\(",
    re.IGNORECASE,
)

# INT with explicit "for a TD" phrasing — both passer and defender named:
# "Mike White pass intercepted for a TD Byron Jones return for 70 yds for a TD, (Bobby Puyol KICK)"
# "Cam Ward pass intercepted Nohl Williams return for 40 yds for a TD (Ryan Coe KICK)"
_PASS_INT_TD_RE = re.compile(
    r"^(?P<passer>.+?)\s+pass intercepted"
    r"(?:\s+for a TD)?"
    r"\s+(?P<defender>[A-Z][\w'\-\.\s]*?)"
    r"\s+return for\s+(?P<ret_yards>-?\d+)\s+yds?"
    r"\s+for a TD",
    re.IGNORECASE,
)

# Kneel-downs and other clock-management plays come through as Rush. Classify
# them so they don't become noise in QB rushing aggregates.
_KNEEL_RE = re.compile(r"\bkneel\s+down\b", re.IGNORECASE)

# "Jake Waters sacked by DaVonte Lambert for a loss of 2 yards to the KanSt 19"
# "Cooper Rush sacked by Zach Smierciak for 0 yards to the CMich 21"  (no "loss of" wording)
# "Kurtis Rourke sacked for a loss of 4 yards to the Toled 42"  (no defender)
_SACK_RE = re.compile(
    r"^(?P<passer>.+?)\s+sacked"
    r"(?:\s+by\s+(?P<defender>[^,]+?))?"
    r"\s+for\s+(?:a loss of\s+)?(?P<loss>\d+)\s+yards?",
    re.IGNORECASE,
)

# "Nick Marshall run for 3 yds to the KanSt 47"
# "Bryant Koback run for no gain to the Toled 35"
# "Justice Hansen run for 10 yds to the GeoSt 33 for a 1ST down"
_RUSH_RE = re.compile(
    r"^(?P<rusher>.+?)\s+run for\s+"
    r"(?:(?P<yards>-?\d+)\s+yds?|no gain|a\s+loss\s+of\s+(?P<loss>\d+)\s+yards?)"
    r"(?:\s+to the\s+\S+\s+\d+)?"
    r"(?P<first_down>\s+for a 1ST down)?",
    re.IGNORECASE,
)

# Detect QB-style scramble within a Rush (no reliable marker; placeholder for future heuristic)
_FUMBLE_RE = re.compile(r"\bfumble[ds]?\b", re.IGNORECASE)
_FORCED_FUMBLE_RE = re.compile(r"forced by\s+(?P<forcer>[^,]+?)(?:,|$)", re.IGNORECASE)

# Penalty annotations come after the actual play description. Strip them so
# our trailing-anchor patterns match. Format: " TEAMNAME Penalty, ..."
_PENALTY_TRAILER_RE = re.compile(
    r"\s+[A-Z][A-Z\s]{2,}\s+Penalty,.*$",
    re.IGNORECASE,
)


def _strip_penalty(text: str) -> str:
    return _PENALTY_TRAILER_RE.sub("", text).strip()


# ---- name normalization ----

_NAME_SUFFIX_RE = re.compile(r"\s+(?:Jr\.?|Sr\.?|II|III|IV|V)$", re.IGNORECASE)


def normalize_name(s: str | None) -> str | None:
    """Strip accents/suffixes/extra whitespace; lowercase. Returns None for empty."""
    if not s:
        return None
    s = s.strip()
    if not s:
        return None
    # ASCII fold
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = _NAME_SUFFIX_RE.sub("", s)
    s = re.sub(r"\s+", " ", s)
    return s.lower().strip()


# ---- top-level parse ----


@dataclass(slots=True)
class ParsedPlay:
    parsed_type: str = "other"  # pass_complete, pass_incomplete, pass_int, sack, rush, pass_td, rush_td, kneel, other
    passer: str | None = None
    receiver: str | None = None
    rusher: str | None = None
    defender: str | None = None  # sack-taker, INT-er, or pass-defender
    is_first_down: bool = False
    is_broken_up: bool = False
    is_touchdown: bool = False
    is_fumble: bool = False
    is_two_point: bool = False  # Two Point Pass / Two Point Rush — exclude from box-total reconciliation
    sack_loss_yards: int | None = None
    interception_return_yards: int | None = None


def parse_play(play_type: str | None, play_text: str | None) -> ParsedPlay:
    """Parse a single play into structured fields. Always returns a ParsedPlay."""
    p = ParsedPlay()
    if not play_text or not play_type:
        return p

    text = _strip_penalty(play_text.strip())
    is_td = "Touchdown" in (play_type or "")
    p.is_touchdown = is_td
    p.is_fumble = bool(_FUMBLE_RE.search(text))
    p.is_two_point = play_type in ("Two Point Pass", "Two Point Rush")

    if play_type in PASS_PLAY_TYPES:
        # 0) Box-score TD format (no "pass complete to" phrasing)
        if play_type == "Passing Touchdown" and "pass complete to" not in text:
            m = _BOX_PASS_TD_RE.match(text)
            if m:
                p.parsed_type = "pass_td"
                p.passer = normalize_name(m.group("passer"))
                p.receiver = normalize_name(m.group("receiver"))
                p.is_touchdown = True
                return p

        # 1) Sack first (specific phrase)
        if play_type == "Sack" or " sacked " in text:
            m = _SACK_RE.match(text)
            if m:
                p.parsed_type = "sack"
                p.passer = normalize_name(m.group("passer"))
                p.defender = normalize_name(m.group("defender"))
                p.sack_loss_yards = int(m.group("loss"))
                return p

        # 2) Pass complete (covers Pass Reception + Passing Touchdown)
        if "pass complete to" in text:
            m_td = _PASS_TD_RE.match(text)
            if m_td:
                p.parsed_type = "pass_td"
                p.passer = normalize_name(m_td.group("passer"))
                p.receiver = normalize_name(m_td.group("receiver"))
                p.is_touchdown = True
                return p
            m = _PASS_COMPLETE_RE.match(text)
            if m:
                p.parsed_type = "pass_td" if is_td else "pass_complete"
                p.passer = normalize_name(m.group("passer"))
                p.receiver = normalize_name(m.group("receiver"))
                p.is_first_down = m.group("first_down") is not None
                return p

        # 3) Pass incomplete
        if "pass incomplete" in text:
            m = _PASS_INCOMPLETE_RE.match(text)
            if m:
                p.parsed_type = "pass_incomplete"
                p.passer = normalize_name(m.group("passer"))
                p.receiver = normalize_name(m.group("receiver"))
                p.defender = normalize_name(m.group("defender"))
                p.is_broken_up = m.group("defender") is not None
                return p

        # 4) Pass intercepted — try the TD-with-passer variant first
        if "pass intercepted" in text:
            m = _PASS_INT_TD_RE.match(text)
            if m:
                p.parsed_type = "pass_int"
                p.passer = normalize_name(m.group("passer"))
                p.defender = normalize_name(m.group("defender"))
                p.interception_return_yards = int(m.group("ret_yards"))
                p.is_touchdown = True
                return p
            m = _PASS_INT_RE.match(text)
            if m:
                p.parsed_type = "pass_int"
                p.passer = normalize_name(m.group("passer"))
                p.defender = normalize_name(m.group("defender"))
                if m.group("ret_yards"):
                    p.interception_return_yards = int(m.group("ret_yards"))
                return p

        # 5) Interception Return TD box-score format (no passer named)
        if play_type == "Interception Return Touchdown":
            m = _INT_TD_BOX_RE.match(text)
            if m:
                p.parsed_type = "pass_int"
                p.defender = normalize_name(m.group("defender"))
                p.is_touchdown = True
                # passer stays None — caller can resolve via prior play if needed
                return p

    if play_type in RUSH_PLAY_TYPES:
        # Kneel-downs come through as "Rush" but are clock-management — classify
        # separately so they're excluded from QB rushing aggregates.
        if _KNEEL_RE.search(text):
            p.parsed_type = "kneel"
            return p
        m = _RUSH_RE.match(text)
        if m:
            p.parsed_type = "rush_td" if is_td else "rush"
            p.rusher = normalize_name(m.group("rusher"))
            p.is_first_down = m.group("first_down") is not None
            return p
        # Box-score TD format ("Rusher N Yd Run (...)")
        if play_type == "Rushing Touchdown":
            m = _BOX_RUSH_TD_RE.match(text)
            if m:
                p.parsed_type = "rush_td"
                p.rusher = normalize_name(m.group("rusher"))
                p.is_touchdown = True
                return p

    return p
