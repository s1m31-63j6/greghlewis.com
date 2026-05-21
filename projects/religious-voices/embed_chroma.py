"""Embed chunks with sentence-transformers and write to Chroma.

Replaces the old Bedrock Cohere embed_chunks() path. The win:

  - Embedding model is local, free, and visible — you can swap it,
    fine-tune it, or train your own. No managed-service dependency.
  - The model is a documented HuggingFace artifact; future you can
    point at the exact weights used.
  - Chroma is a real vector DB. Faster than linear scans at our size,
    and grows gracefully if the corpus 10×s.

Model: BAAI/bge-base-en-v1.5 (768-dim, ~440 MB, current SOTA among
open-weights at this size class on MTEB retrieval benchmarks).

Run:
  AWS_PROFILE=portfolio is no longer needed.
  uv run python build.py
"""

from __future__ import annotations

from pathlib import Path

import chromadb
from chromadb.config import Settings
from rich.console import Console
from sentence_transformers import SentenceTransformer

from common import Chunk

console = Console()

PROJECT_ROOT = Path(__file__).resolve().parent
CHROMA_DIR = PROJECT_ROOT / "chroma_db"
COLLECTION = "religious_voices"
EMBED_MODEL = "BAAI/bge-base-en-v1.5"
BATCH = 32

# First call downloads ~440 MB to ~/.cache/huggingface. Cached on
# subsequent runs.
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        console.log(f"loading {EMBED_MODEL} (first run downloads ~440 MB)…")
        _model = SentenceTransformer(EMBED_MODEL, device="cpu")
    return _model


def _get_collection():
    """Get or recreate the Chroma collection (fresh build each time)."""
    client = chromadb.PersistentClient(
        path=str(CHROMA_DIR),
        settings=Settings(anonymized_telemetry=False),
    )
    # Wipe and recreate so a build is a clean replacement, not an append.
    try:
        client.delete_collection(COLLECTION)
    except Exception:
        pass
    # No embedding_function on the collection — we pass embeddings ourselves
    # at add() time so the model lives in this script, not in Chroma's
    # internal state.
    return client.create_collection(COLLECTION, metadata={"hnsw:space": "cosine"})


def embed_to_chroma(chunks: list[Chunk]) -> None:
    """Encode every chunk with sentence-transformers, write to Chroma."""
    model = _get_model()
    collection = _get_collection()

    texts = [c.text for c in chunks]
    console.log(f"encoding {len(texts)} chunks with {EMBED_MODEL}…")
    # normalize_embeddings=True so cosine = dot product, matches BGE's
    # recommended retrieval configuration.
    embeddings = model.encode(
        texts,
        batch_size=BATCH,
        normalize_embeddings=True,
        show_progress_bar=True,
        convert_to_numpy=True,
    )

    # Chroma wants ids unique, metadatas a list of dicts, documents the
    # raw text. Year may be None — Chroma metadata can't hold None values,
    # so we store -1 as a sentinel and re-translate on read.
    ids = [c.id for c in chunks]
    metadatas: list[dict] = []
    for c in chunks:
        metadatas.append(
            {
                "id": c.id,
                "leader_id": c.leader_id,
                "religion": c.religion,
                "year": c.year if c.year is not None else -1,
                "work_title": c.work_title,
                "source_url": c.source_url,
            }
        )

    console.log("writing to Chroma…")
    # Chroma's max batch size for `add` is ~5K; we're well under that but
    # batch anyway so we can see progress.
    for start in range(0, len(ids), 256):
        end = min(start + 256, len(ids))
        collection.add(
            ids=ids[start:end],
            embeddings=[e.tolist() for e in embeddings[start:end]],
            metadatas=metadatas[start:end],
            documents=texts[start:end],
        )

    console.log(f"wrote {len(ids)} chunks to Chroma at {CHROMA_DIR}")
