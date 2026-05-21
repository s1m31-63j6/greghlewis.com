"""Bedrock Cohere embed-english-v3 wrapper.

Cohere v3 is 1024-dim and supports input_type asymmetry — corpus chunks
get input_type=search_document, runtime queries get search_query. This
asymmetry materially improves retrieval when chat queries are short and
corpus passages are long.

Batches of 96 (Cohere v3's hard limit per request). With ~2000 chunks
total, this is ~21 API calls — pennies, runs in under a minute.
"""

from __future__ import annotations

import json
import os
from typing import Literal

import boto3
from rich.console import Console
from tenacity import retry, stop_after_attempt, wait_exponential

from common import Chunk

REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = "cohere.embed-english-v3"
BATCH = 96
# Cohere v3 enforces a 2048-char per-text cap at the Bedrock validation
# layer — the `truncate` field gets rejected before it can do its job.
# We truncate client-side and append an ellipsis so the chunk text passed
# to the LLM (in `corpus.json`, separate from what we embed) stays full
# while only the embedding-input text is clipped.
MAX_EMBED_CHARS = 2040

console = Console()


def _client():
    return boto3.client("bedrock-runtime", region_name=REGION)


@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=30))
def _embed_batch(
    texts: list[str],
    input_type: Literal["search_document", "search_query"],
) -> list[list[float]]:
    body = json.dumps({"texts": texts, "input_type": input_type})
    resp = _client().invoke_model(
        modelId=MODEL_ID,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    payload = json.loads(resp["body"].read())
    return payload["embeddings"]


def embed_chunks(chunks: list[Chunk]) -> list[Chunk]:
    """Embed chunks in batches; mutates each chunk's `embedding` in place."""
    for start in range(0, len(chunks), BATCH):
        batch = chunks[start : start + BATCH]
        console.log(f"embedding batch {start} - {start + len(batch)} of {len(chunks)}")
        # Truncate just the embedding input — the full chunk.text is what
        # the LLM sees at retrieval time, so the embedding can be of a
        # head-only slice without losing answer fidelity.
        inputs = [c.text[:MAX_EMBED_CHARS] for c in batch]
        vecs = _embed_batch(inputs, input_type="search_document")
        for c, v in zip(batch, vecs):
            c.embedding = v
    return chunks
