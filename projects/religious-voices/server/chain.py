"""LangChain orchestration for the religious-voices chat.

The chain is structured around an async generator so we can yield TWO
flavors of SSE events to the client:

  1. `meta`  — emitted once, immediately after retrieval, before the LLM
               has produced any tokens. Carries the deduped source list
               so the UI can render the attribution footer while the
               answer is still streaming.
  2. `text`  — emitted per LLM token delta.
  3. `done`  — emitted once at the end with usage stats (input tokens,
               output tokens, cache writes/reads).

LangChain ChatAnthropic gives us native streaming via .astream() and
native cache_control via the SystemMessage list-content format. Direct
Anthropic SDK is also visible underneath if you set ANTHROPIC_LOG=info.
"""

from __future__ import annotations

import os
from typing import Any, AsyncIterator

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from server.persona import build_system_content, build_user_message
from server.retrieval import dedupe_sources, retrieve_for_leader

# Claude Sonnet 4.6 is the strongest practical Sonnet for paraphrase work
# with strong instruction following. ANTHROPIC_API_KEY must be set.
MODEL_ID = os.environ.get("RELIGIOUS_VOICES_MODEL", "claude-sonnet-4-5")

_llm: ChatAnthropic | None = None


def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(
            model=MODEL_ID,
            max_tokens=600,
            temperature=0.7,
            streaming=True,
            # langchain_anthropic auto-includes the prompt-caching beta
            # header on recent versions, but explicit is safer.
            default_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
        )
    return _llm


async def chat_stream(
    query: str,
    leader: dict[str, Any],
    k: int = 8,
) -> AsyncIterator[dict[str, Any]]:
    """Stream chat events for a single user turn.

    Yields dicts that the FastAPI endpoint serializes to SSE.
    """
    # 1. Retrieve via Chroma
    retrieved = retrieve_for_leader(query, leader["leader_id"], k=k)
    yield {"type": "meta", "sources": dedupe_sources(retrieved)}

    # 2. Build messages — SystemMessage takes a list-of-blocks so
    # cache_control breakpoints land on the wire intact.
    messages = [
        SystemMessage(content=build_system_content(leader)),
        HumanMessage(content=build_user_message(query, retrieved)),
    ]

    # 3. Stream from the model
    llm = get_llm()
    usage: dict[str, Any] = {}
    async for chunk in llm.astream(messages):
        if isinstance(chunk.content, str) and chunk.content:
            yield {"type": "text", "content": chunk.content}
        elif isinstance(chunk.content, list):
            # Tool-use / multi-block messages would land here; for our
            # text-only persona prompts this shouldn't fire, but handle
            # defensively in case Anthropic emits stop-block events.
            for block in chunk.content:
                if isinstance(block, dict) and block.get("type") == "text":
                    yield {"type": "text", "content": block.get("text", "")}
        # The final chunk carries usage on response_metadata for
        # langchain_anthropic >= 0.3.
        if chunk.response_metadata.get("usage"):
            usage = dict(chunk.response_metadata["usage"])
        if chunk.usage_metadata:
            # newer langchain shape — fold both into one dict for the client
            um = chunk.usage_metadata
            usage = {
                "input_tokens": um.get("input_tokens"),
                "output_tokens": um.get("output_tokens"),
                "cache_read_input_tokens": um.get("input_token_details", {}).get("cache_read"),
                "cache_creation_input_tokens": um.get("input_token_details", {}).get("cache_creation"),
            }

    yield {"type": "done", "usage": usage}
