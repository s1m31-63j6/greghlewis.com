"""Embed chunks with Bedrock Cohere and write corpus.json + leaders.json.

Replaces the old sentence-transformers + Chroma path. The win:

  - Embedding lives in AWS (managed, no local model weights, no PyTorch
    runtime in production). The site's SSR Lambda calls the same model
    at query time, so corpus and query share the embedding space.
  - Output is a flat JSON file the Next.js SSR Lambda imports directly
    — no separate vector DB, no Aurora cost, no cross-account auth.

Model: cohere.embed-english-v3 (1024-dim, supports asymmetric retrieval
via input_type). Corpus embeds use input_type="search_document".

Run:
  AWS_PROFILE=portfolio uv run python build.py
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import boto3
from rich.console import Console

from common import Chunk, OUTPUT_DIR, load_leaders

console = Console()

MODEL_ID = "cohere.embed-english-v3"
REGION = "us-east-1"
# Cohere on Bedrock accepts up to 96 texts per invoke_model call.
BATCH = 96
# Bedrock pre-validates Cohere v3 inputs at 2048 CHARS (not tokens) and
# rejects the entire batch if any text exceeds it. The `truncate` param
# Cohere's own API accepts is rejected by Bedrock. Truncate ourselves —
# only the embedding sees the truncated text; the stored chunk.text
# (which the LLM eventually quotes back) keeps the full passage.
MAX_EMBED_CHARS = 2000


def _client():
    profile = os.environ.get("AWS_PROFILE")
    session = boto3.Session(profile_name=profile) if profile else boto3.Session()
    return session.client("bedrock-runtime", region_name=REGION)


def _embed_batch(client, texts: list[str]) -> list[list[float]]:
    body = json.dumps({"texts": texts, "input_type": "search_document"})
    resp = client.invoke_model(modelId=MODEL_ID, body=body, contentType="application/json")
    payload = json.loads(resp["body"].read())
    return payload["embeddings"]


def embed_chunks(chunks: list[Chunk]) -> list[Chunk]:
    """In-place embed every chunk via Bedrock Cohere. Returns the same list."""
    client = _client()
    console.log(f"embedding {len(chunks)} chunks via {MODEL_ID}…")
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i : i + BATCH]
        embeddings = _embed_batch(client, [c.text[:MAX_EMBED_CHARS] for c in batch])
        for chunk, emb in zip(batch, embeddings):
            chunk.embedding = emb
        console.log(f"  {min(i + BATCH, len(chunks))}/{len(chunks)}")
    return chunks


def _round_embedding(emb: list[float]) -> list[float]:
    # Cosine similarity over Cohere v3 vectors (magnitudes ~10-20) is
    # invariant past ~1e-5 precision. Rounding to 6 decimals cuts JSON
    # size by ~40% versus float64 default repr without measurable
    # impact on retrieval ranking.
    return [round(x, 6) for x in emb]


def write_corpus(chunks: list[Chunk]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "corpus.json"
    payload = {
        "chunks": [
            {**c.model_dump(exclude={"embedding"}), "embedding": _round_embedding(c.embedding)}
            for c in chunks
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    with out_path.open("w") as f:
        json.dump(payload, f, separators=(",", ":"))
    size_mb = out_path.stat().st_size / 1024 / 1024
    console.log(f"wrote {len(chunks)} chunks to {out_path} ({size_mb:.1f} MB)")


def write_leaders(present_leader_ids: set[str]) -> None:
    """Emit leaders.json with only leaders that ended up with chunks."""
    leaders = load_leaders()
    out = [l for l in leaders if l.leader_id in present_leader_ids]
    out.sort(key=lambda l: (l.religion, l.era_start))
    out_path = OUTPUT_DIR / "leaders.json"
    payload = {
        "leaders": [l.model_dump(exclude={"sources"}) for l in out],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    with out_path.open("w") as f:
        json.dump(payload, f, indent=2)
    console.log(f"wrote {len(out)} leaders to {out_path}")
