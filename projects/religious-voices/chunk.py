"""Chunk long-form religious texts into retrieval-sized passages.

Targets 350-500 tokens per chunk, split on paragraph breaks first and
sentence boundaries within paragraphs only if a single paragraph is too
long. Every chunk preserves its source URL and work title — those travel
through to the UI for attribution.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

import tiktoken

from common import Chunk, Religion

TARGET_TOKENS = 420
MAX_TOKENS = 520
MIN_TOKENS = 120

# Cohere doesn't expose its tokenizer publicly; cl100k (OpenAI) is a
# reasonable proxy for English prose and we only need approximate counts
# to enforce chunk-size bounds.
_enc = tiktoken.get_encoding("cl100k_base")


def _tokens(text: str) -> int:
    return len(_enc.encode(text))


_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'])")
_PARAGRAPH_RE = re.compile(r"\n\s*\n")


def _split_paragraph(paragraph: str) -> list[str]:
    """Split an oversize paragraph at sentence boundaries."""
    sentences = _SENTENCE_RE.split(paragraph.strip())
    out: list[str] = []
    cur: list[str] = []
    cur_tokens = 0
    for s in sentences:
        st = _tokens(s)
        if cur and cur_tokens + st > MAX_TOKENS:
            out.append(" ".join(cur))
            cur = [s]
            cur_tokens = st
        else:
            cur.append(s)
            cur_tokens += st
    if cur:
        out.append(" ".join(cur))
    return out


@dataclass
class SourceText:
    """A single source document — one sermon, encyclical, address, etc."""

    leader_id: str
    religion: Religion
    work_title: str
    source_url: str
    text: str
    year: int | None = None


def chunk_source(src: SourceText) -> list[Chunk]:
    """Split a source document into retrieval chunks."""
    paragraphs = [p.strip() for p in _PARAGRAPH_RE.split(src.text) if p.strip()]
    blocks: list[str] = []
    for p in paragraphs:
        pt = _tokens(p)
        if pt > MAX_TOKENS:
            blocks.extend(_split_paragraph(p))
        else:
            blocks.append(p)

    # Merge consecutive small blocks up toward TARGET_TOKENS so single-
    # sentence paragraphs don't become standalone chunks.
    merged: list[str] = []
    cur: list[str] = []
    cur_tokens = 0
    for b in blocks:
        bt = _tokens(b)
        if cur and cur_tokens + bt > TARGET_TOKENS:
            merged.append("\n\n".join(cur))
            cur = [b]
            cur_tokens = bt
        else:
            cur.append(b)
            cur_tokens += bt
    if cur:
        # Avoid a trailing micro-chunk: if the tail is < MIN_TOKENS, fold
        # it into the previous chunk (if any).
        tail_text = "\n\n".join(cur)
        if merged and _tokens(tail_text) < MIN_TOKENS:
            merged[-1] = merged[-1] + "\n\n" + tail_text
        else:
            merged.append(tail_text)

    chunks: list[Chunk] = []
    for text in merged:
        chunks.append(
            Chunk(
                id=str(uuid.uuid4()),
                leader_id=src.leader_id,
                religion=src.religion,
                year=src.year,
                work_title=src.work_title,
                source_url=src.source_url,
                text=text,
            )
        )
    return chunks


def cap_per_leader(chunks: list[Chunk], cap: int = 80) -> list[Chunk]:
    """Limit chunks per leader to keep corpus balanced.

    Mormon coverage will otherwise be ~10x denser than Buddhist; capping
    here prevents the dense traditions from dominating the index size.
    Keeps the first `cap` chunks per leader (typically the earlier
    discourses in the source ordering, which we can shuffle per source
    type later if it matters).
    """
    counts: dict[str, int] = {}
    out: list[Chunk] = []
    for c in chunks:
        n = counts.get(c.leader_id, 0)
        if n >= cap:
            continue
        out.append(c)
        counts[c.leader_id] = n + 1
    return out
