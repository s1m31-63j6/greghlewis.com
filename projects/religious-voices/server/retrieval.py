"""Chroma vector store + sentence-transformers embeddings.

This module replaces the Bedrock Cohere embeddings + in-process cosine
similarity that the TS implementation used. The win: zero managed-service
dependency for retrieval, the embedding model is run locally and visible
(you can swap it, fine-tune it, or even train one from scratch), and
Chroma is a real vector DB with metadata filtering instead of a Float32
array linear scan.

Embedding model: BAAI/bge-base-en-v1.5
  - 768-dim, ~440 MB on disk, CPU-friendly
  - SOTA on MTEB retrieval benchmarks among free open-weight models
  - BGE expects an instruction prefix on QUERIES (not on documents).
    HuggingFaceEmbeddings handles this asymmetry for us when we pass
    query_instruction.

Chroma is run in "persistent client" mode — the index lives at
projects/religious-voices/chroma_db/ on disk and is committed (or rebuilt
fresh via build.py). Loaded once per process and cached.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

# Project root = parent of server/
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHROMA_DIR = PROJECT_ROOT / "chroma_db"
COLLECTION = "religious_voices"

EMBED_MODEL = "BAAI/bge-base-en-v1.5"
# BGE retrieval-search instruction; per the model card, prepending this on
# queries (NOT on documents) improves retrieval quality measurably.
BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


_embeddings: HuggingFaceEmbeddings | None = None
_store: Chroma | None = None


def get_embeddings() -> HuggingFaceEmbeddings:
    """Lazy-load the sentence-transformers model.

    First call downloads model weights (~440MB) from HuggingFace Hub if
    they're not in the local cache. Subsequent calls reuse the singleton.
    """
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(
            model_name=EMBED_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
            query_encode_kwargs={"normalize_embeddings": True, "prompt": BGE_QUERY_INSTRUCTION},
        )
    return _embeddings


def get_store() -> Chroma:
    """Lazy-load the persistent Chroma collection."""
    global _store
    if _store is None:
        _store = Chroma(
            collection_name=COLLECTION,
            embedding_function=get_embeddings(),
            persist_directory=str(CHROMA_DIR),
        )
    return _store


def retrieve_for_leader(query: str, leader_id: str, k: int = 8) -> list[dict[str, Any]]:
    """Top-K passages for a leader, ordered by similarity.

    Uses Chroma's `where` metadata filter so only the selected leader's
    chunks are considered — no need to scan the full corpus per query.

    Returns list of dicts so the result is JSON-serializable and easy to
    feed into the prompt template.
    """
    docs = get_store().similarity_search(query, k=k, filter={"leader_id": leader_id})
    return [
        {
            "id": d.metadata.get("id", ""),
            "leader_id": d.metadata["leader_id"],
            "religion": d.metadata.get("religion", ""),
            "year": d.metadata.get("year"),
            "work_title": d.metadata.get("work_title", ""),
            "source_url": d.metadata.get("source_url", ""),
            "text": d.page_content,
        }
        for d in docs
    ]


def dedupe_sources(retrieved: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse retrieved passages into a unique sources list for the UI."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in retrieved:
        key = f"{r['work_title']}::{r.get('year') or ''}::{r['source_url']}"
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "work_title": r["work_title"],
                "year": r.get("year"),
                "source_url": r["source_url"],
            }
        )
    return out
