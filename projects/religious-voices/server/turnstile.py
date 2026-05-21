"""Cloudflare Turnstile verification — Python port of the TS turnstile.ts."""

from __future__ import annotations

import os

import httpx

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str | None, remote_ip: str | None) -> tuple[bool, str | None]:
    """Returns (ok, reason). Fails closed.

    In dev (TURNSTILE_SECRET_KEY unset and NODE_ENV != production),
    verification is skipped — local development is unblocked.
    """
    secret = os.environ.get("TURNSTILE_SECRET_KEY")
    if not secret:
        if os.environ.get("NODE_ENV") != "production":
            return True, "dev-skip"
        return False, "server-misconfigured"
    if not token:
        return False, "no-token"

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            VERIFY_URL,
            data={
                "secret": secret,
                "response": token,
                **({"remoteip": remote_ip} if remote_ip else {}),
            },
        )
        if r.status_code != 200:
            return False, f"siteverify-http-{r.status_code}"
        data = r.json()
    if not data.get("success"):
        return False, ",".join(data.get("error-codes", [])) or "denied"
    return True, None
