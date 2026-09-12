"""Shared plumbing for the start-sit fetchers.

Copied from projects/draft-sheet/common.py rather than imported: that module
binds its cache directory and User-Agent to the draft sheet, and a shared cache
would let one project's stale bytes answer the other's request.

Two rules carry over:

  1. Raw responses are cached to `data/raw/` and reused unless `--force`. The
     raw bytes on disk are what make a parser bug debuggable after the fact.
  2. Nothing is fetched without a real User-Agent and a timeout.

One rule is new: the SportsGameOdds key travels in a request header, never in
a query string, so it cannot end up in a cache filename, a log line or an
exception message.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import httpx

HERE = Path(__file__).parent
RAW = HERE / "data" / "raw"

# A local `.env` beside this file (gitignored) supplies the sportsbook key for
# hand runs; in CI the workflow passes it as a real environment variable.
_ENV = HERE / ".env"
if _ENV.exists():
    for _line in _ENV.read_text().splitlines():
        if "=" in _line and not _line.lstrip().startswith("#"):
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36 "
    "(+greghlewis.com/projects/start-sit)"
)

TIMEOUT = httpx.Timeout(60.0, connect=10.0)
ATTEMPTS = 3
RETRY_STATUS = {429, 500, 502, 503, 504}


def get_with_retry(client: httpx.Client, url: str, *, params: dict[str, Any] | None = None) -> httpx.Response:
    """GET with three attempts on the failures that pass on their own.

    Six unattended runs a week make a transient timeout the most likely failure
    by far, and each failure opens an issue. Connection errors, timeouts, 429
    and 5xx are retried with a short backoff; any other 4xx (a bad key, a
    renamed endpoint) fails at once, because retrying it would only delay the
    same answer.
    """
    last: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            r = client.get(url, params=params)
            if r.status_code in RETRY_STATUS:
                raise httpx.HTTPStatusError(f"{r.status_code} from {url}", request=r.request, response=r)
            r.raise_for_status()
            return r
        except (httpx.TransportError, httpx.HTTPStatusError) as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status is not None and status not in RETRY_STATUS:
                raise
            last = e
            if attempt < ATTEMPTS:
                wait = 2 * attempt
                print(f"  attempt {attempt} failed ({status or type(e).__name__}); retrying in {wait}s")
                time.sleep(wait)
    raise RuntimeError(f"gave up after {ATTEMPTS} attempts: {last}")


def previous_committed(rel_path: str) -> Any | None:
    """The last committed version of a repo file as JSON, or None (first run,
    detached history, missing file). Same trick the drift gate uses."""
    root = HERE.parent.parent
    try:
        out = subprocess.run(["git", "show", f"HEAD:{rel_path}"], cwd=root, check=True,
                             capture_output=True, text=True).stdout
        return json.loads(out)
    except (subprocess.CalledProcessError, json.JSONDecodeError, FileNotFoundError):
        return None


def raw_path(name: str) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    return RAW / name


def cached_text(
    name: str,
    url: str,
    *,
    force: bool = False,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    delay: float = 0.0,
) -> str:
    """Fetch `url` to `data/raw/<name>`, reusing the cache unless `force`.

    Response headers are written beside the body as `<name>.headers.json`, so a
    quota header can be read back without a second request.
    """
    p = raw_path(name)
    if p.exists() and not force:
        return p.read_text()
    if delay:
        time.sleep(delay)
    h = {"User-Agent": UA, **(headers or {})}
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers=h) as c:
        r = get_with_retry(c, url, params=params)
        p.write_text(r.text)
        raw_path(f"{name}.headers.json").write_text(json.dumps(dict(r.headers)))
        return r.text


def cached_json(name: str, url: str, **kw: Any) -> Any:
    return json.loads(cached_text(name, url, **kw))


def cached_headers(name: str) -> dict[str, str]:
    p = raw_path(f"{name}.headers.json")
    return json.loads(p.read_text()) if p.exists() else {}


def norm_name(name: str) -> str:
    """Normalize a player name for matching.

    Suffixes are most of the problem — `Marvin Harrison Jr.`, `James Cook III`,
    `Kyle Pitts Sr.` — and they account for most of the naive-match failures
    the draft sheet measured across its sources.
    """
    s = name.lower().strip()
    for ch in ".,'`’-":
        s = s.replace(ch, " " if ch == "-" else "")
    parts = [p for p in s.split() if p not in {"jr", "sr", "ii", "iii", "iv", "v"}]
    return " ".join(parts)


# ── team codes ───────────────────────────────────────────────────────────────

TEAM_FIX = {
    "WAS": "WSH", "JAC": "JAX", "LA": "LAR", "SD": "LAC", "OAK": "LV",
    "STL": "LAR", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU",
    "GNB": "GB", "KAN": "KC", "NWE": "NE", "NOR": "NO", "SFO": "SF",
    "TAM": "TB", "LVR": "LV", "NNO": "NO",
}


def norm_team(abbr: object) -> str | None:
    if abbr is None:
        return None
    s = str(abbr).strip().upper()
    if not s or s in {"NAN", "NONE", "FA"}:
        return None
    return TEAM_FIX.get(s, s)


def dump(path: Path, payload: Any) -> int:
    """Minified JSON, NaN forbidden. Returns the byte size."""
    blob = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(blob)
    return len(blob)
