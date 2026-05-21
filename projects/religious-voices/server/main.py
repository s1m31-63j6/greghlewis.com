"""FastAPI app for the Religious Voices chatbot.

Endpoints:
  GET  /health          — liveness probe
  GET  /leaders         — leader manifest (for the dropdown)
  POST /chat            — SSE-streaming chat

Run locally:
  cd projects/religious-voices
  uv run uvicorn server.main:app --reload --port 8000

Configuration (env vars):
  ANTHROPIC_API_KEY      — required (the LLM)
  TURNSTILE_SECRET_KEY   — required in production, optional in dev
  RELIGIOUS_VOICES_CORS_ORIGIN — comma-separated origins (default: localhost:3000)
  RELIGIOUS_VOICES_MODEL — Claude model id (default: claude-sonnet-4-5)
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Load .env from the project root before any other module reads env vars
# (so ANTHROPIC_API_KEY, TURNSTILE_SECRET_KEY, etc. are available to the
# chain module on first import).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from server.chain import chat_stream  # noqa: E402
from server.rate_limit import check_rate_limit  # noqa: E402
from server.turnstile import verify_turnstile  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LEADERS_YAML = PROJECT_ROOT / "leaders.yaml"


def load_leaders() -> list[dict[str, Any]]:
    with LEADERS_YAML.open() as f:
        raw = yaml.safe_load(f)
    return [
        {
            "leader_id": l["leader_id"],
            "religion": l["religion"],
            "full_name": l["full_name"],
            "role": l["role"],
            "dates": l["dates"],
            "era_start": l["era_start"],
            "themes": l.get("themes", []),
        }
        for l in raw["leaders"]
    ]


def load_available_leader_ids() -> set[str]:
    """Which leaders actually have chunks in the Chroma DB."""
    try:
        from server.retrieval import get_store

        store = get_store()
        # Chroma's get() with no IDs returns all docs; pull metadatas only
        result = store.get(include=["metadatas"])
        return {m["leader_id"] for m in result.get("metadatas", []) if m.get("leader_id")}
    except Exception:
        return set()


_LEADERS = load_leaders()
_LEADERS_BY_ID = {l["leader_id"]: l for l in _LEADERS}

app = FastAPI(title="Religious Voices", version="0.2.0")

cors_origins = os.environ.get(
    "RELIGIOUS_VOICES_CORS_ORIGIN",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    query: str
    leader_id: str = Field(..., alias="leaderId")
    history: list[ChatTurn] = Field(default_factory=list)
    turnstile_token: str | None = Field(None, alias="turnstileToken")

    class Config:
        populate_by_name = True


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/leaders")
def leaders() -> dict[str, Any]:
    """Leaders with chunks in the corpus, ordered by era_start within tradition."""
    available = load_available_leader_ids()
    out = [l for l in _LEADERS if l["leader_id"] in available]
    out.sort(key=lambda l: (l["religion"], l["era_start"]))
    return {"leaders": out, "total": len(out)}


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


@app.post("/chat")
async def chat(request: Request, body: ChatRequest):
    query = body.query.strip()
    if not query:
        raise HTTPException(400, "query is required")

    leader = _LEADERS_BY_ID.get(body.leader_id)
    if leader is None:
        raise HTTPException(404, f"Unknown leader: {body.leader_id}")

    ip = client_ip(request)

    allowed, retry_after = check_rate_limit(ip)
    if not allowed:
        headers = {"Retry-After": str(retry_after)} if retry_after else {}
        raise HTTPException(429, detail="Rate limit exceeded. Try again later.", headers=headers)

    ok, reason = await verify_turnstile(body.turnstile_token, ip)
    if not ok:
        raise HTTPException(403, f"Verification failed: {reason}")

    async def event_stream():
        try:
            async for event in chat_stream(query, leader):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
