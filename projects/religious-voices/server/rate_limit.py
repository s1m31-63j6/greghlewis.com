"""In-memory per-IP token bucket — Python port of the TS rate-limit.ts.

Ephemeral process-local state; resets on restart. Fine for a portfolio
site. Production-grade abuse prevention would back this with Redis.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

CAPACITY = 20  # max messages per window
REFILL_PER_SEC = CAPACITY / (60 * 60)  # 20 tokens per hour


@dataclass
class _Bucket:
    tokens: float
    last_refill: float


_buckets: dict[str, _Bucket] = {}


def check_rate_limit(ip: str) -> tuple[bool, int | None]:
    """Returns (allowed, retry_after_seconds)."""
    now = time.time()
    b = _buckets.get(ip)
    if b is None:
        b = _Bucket(tokens=CAPACITY, last_refill=now)
        _buckets[ip] = b
    else:
        elapsed = now - b.last_refill
        b.tokens = min(CAPACITY, b.tokens + elapsed * REFILL_PER_SEC)
        b.last_refill = now
    if b.tokens >= 1:
        b.tokens -= 1
        return True, None
    secs = max(1, int((1 - b.tokens) / REFILL_PER_SEC))
    return False, secs
