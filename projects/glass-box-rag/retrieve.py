"""The retrieval core: BM25, dense, RRF fusion, diversification, cross-encoder rerank.

Every stage is a separate function returning ranked (chunk_index, score) pairs, so
the evaluation harness can switch any one off and measure what it was worth. That
ablation is the point of the project — the same functions get ported to TypeScript
for the Lambda once the numbers say which configuration wins.

BM25 is written out rather than imported. `rank_bm25` is kept as a dev dependency
purely to check this implementation agrees with a reference one.
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import cached_property

import boto3
import numpy as np

from common import BUILD

REGION = "us-east-1"
EMBED_MODEL = "amazon.titan-embed-text-v2:0"
RERANK_ARN = f"arn:aws:bedrock:{REGION}::foundation-model/cohere.rerank-v3-5:0"
RERANK_MAX_DOCS = 100  # hard Bedrock limit, and the pricing unit

_TOKEN = re.compile(r"[a-z0-9§]+")

# Legal boilerplate that appears in nearly every opinion and carries no signal.
STOP = {
    "the", "of", "to", "a", "in", "and", "that", "is", "for", "it", "as", "on", "with",
    "this", "be", "by", "not", "was", "are", "or", "at", "from", "an", "we", "its",
    "would", "has", "have", "had", "were", "which", "but", "their", "there", "than",
    "such", "may", "can", "will", "no", "any", "all", "if", "when", "does", "do",
    "court", "courts", "id", "see", "also", "supra", "cf", "e.g", "i.e",
}


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in STOP and len(t) > 1]


@dataclass
class Hit:
    idx: int
    score: float
    stage: str


class Index:
    """Corpus + vectors + a hand-rolled BM25 index."""

    def __init__(self, model_key: str = "titan"):
        self.chunks: list[dict] = json.loads((BUILD / "chunks.json").read_text())
        meta = json.loads((BUILD / f"vectors-{model_key}.meta.json").read_text())
        self.dims = meta["dims"]
        self.embed_model = meta["model"]
        self.vectors = np.fromfile(
            BUILD / f"vectors-{model_key}.bin", dtype=np.float32
        ).reshape(meta["count"], self.dims)
        if meta["chunk_ids"] != [c["id"] for c in self.chunks]:
            raise SystemExit("vector/chunk mismatch — re-run embed.py after chunk.py")
        self._build_bm25()

    # ---------- BM25 ----------

    def _build_bm25(self) -> None:
        self.docs = [tokenize(c["text"]) for c in self.chunks]
        self.doc_len = np.array([len(d) for d in self.docs], dtype=np.float32)
        self.avgdl = float(self.doc_len.mean())
        self.tf: list[Counter] = [Counter(d) for d in self.docs]
        df: Counter = Counter()
        for d in self.docs:
            df.update(set(d))
        n = len(self.docs)
        # Lucene's idf variant: the +1 inside the log keeps this non-negative for
        # every df, so no clamping is needed.
        #
        # Validated against rank_bm25's BM25Okapi. They agree to ~3 decimals on rare
        # terms (westlaw df=9: 4.3820 vs 4.3694) and diverge on common ones, because
        # BM25Okapi floors negative idf at epsilon*avg_idf — which collapses "fair"
        # (df=486) and "use" (df=628) to the SAME weight, 1.2635. This formula keeps
        # them ordered and distinct (0.4461 vs 0.1900), correctly treating "use" as
        # the less informative term. The divergence is a known idf-variant
        # difference, not a bug, and this side of it is the better behavior.
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}
        self.postings: dict[str, list[int]] = defaultdict(list)
        for i, tfs in enumerate(self.tf):
            for t in tfs:
                self.postings[t].append(i)

    def bm25(self, query: str, k: int = 30, k1: float = 1.5, b: float = 0.75) -> list[Hit]:
        q = tokenize(query)
        scores: dict[int, float] = defaultdict(float)
        for term in q:
            idf = self.idf.get(term)
            if idf is None:
                continue
            for i in self.postings[term]:
                f = self.tf[i][term]
                denom = f + k1 * (1 - b + b * self.doc_len[i] / self.avgdl)
                scores[i] += idf * (f * (k1 + 1)) / denom
        ranked = sorted(scores.items(), key=lambda kv: -kv[1])[:k]
        return [Hit(i, s, "bm25") for i, s in ranked]

    # ---------- dense ----------

    @cached_property
    def _bedrock(self):
        return boto3.client("bedrock-runtime", region_name=REGION)

    def embed_query(self, query: str) -> np.ndarray:
        body = json.dumps({"inputText": query, "dimensions": self.dims, "normalize": True})
        r = self._bedrock.invoke_model(modelId=EMBED_MODEL, body=body)
        v = np.asarray(json.loads(r["body"].read())["embedding"], dtype=np.float32)
        return v / np.linalg.norm(v)

    def dense(self, query: str, k: int = 30, qvec: np.ndarray | None = None) -> list[Hit]:
        v = self.embed_query(query) if qvec is None else qvec
        # vectors are pre-normalized, so a dot product IS cosine similarity
        s = self.vectors @ v
        idx = np.argpartition(-s, min(k, len(s) - 1))[:k]
        idx = idx[np.argsort(-s[idx])]
        return [Hit(int(i), float(s[i]), "dense") for i in idx]


# ---------- fusion ----------

def as_of_filter(index: Index, hits: list[Hit], year: int) -> list[Hit]:
    """Drop opinions that did not exist yet.

    Pure similarity has no notion of time, so asking "as of 2015, what was the
    controlling test?" retrieves Warhol (2023) — the most semantically similar
    answer, and legally impossible. Every retrieval config in the ablation fails
    this until the filter is applied. In the live pipeline the ANALYZE stage
    extracts the as-of year; here the golden set supplies it.
    """
    return [h for h in hits if index.chunks[h.idx]["year"] <= year]


def rrf(runs: list[list[Hit]], k: int = 60, top: int = 40) -> list[Hit]:
    """Reciprocal Rank Fusion.

    Uses RANK, not score, which is the whole point: BM25 scores and cosine
    similarities are on incomparable scales and normalizing them against each
    other is guesswork. k=60 is the value from the original Cormack et al. paper.
    """
    agg: dict[int, float] = defaultdict(float)
    for run in runs:
        for rank, hit in enumerate(run):
            agg[hit.idx] += 1.0 / (k + rank + 1)
    ranked = sorted(agg.items(), key=lambda kv: -kv[1])[:top]
    return [Hit(i, s, "rrf") for i, s in ranked]


# ---------- diversification ----------

def diversify(index: Index, hits: list[Hit], per_case: int = 2, top: int | None = None) -> list[Hit]:
    """Cap how many chunks any single case may contribute.

    Without this, retrieval collapses onto one opinion: "market dilution from
    competing AI works" returned six Kadrey chunks and zero Bartz, even though
    Bartz is the direct counterpoint decided two days earlier. Long opinions
    (Sony Betamax has 98 chunks) otherwise crowd out short ones purely by volume.
    """
    seen: Counter = Counter()
    out: list[Hit] = []
    for h in hits:
        cid = index.chunks[h.idx]["case_id"]
        if seen[cid] >= per_case:
            continue
        seen[cid] += 1
        out.append(Hit(h.idx, h.score, "diversified"))
        if top and len(out) >= top:
            break
    return out


# ---------- cross-encoder rerank ----------

def rerank(index: Index, query: str, hits: list[Hit], top: int = 10) -> list[Hit]:
    """Bedrock Cohere Rerank 3.5. A true cross-encoder: it reads query and document
    together, which bi-encoder cosine similarity cannot do."""
    if not hits:
        return []
    hits = hits[:RERANK_MAX_DOCS]
    client = boto3.client("bedrock-agent-runtime", region_name=REGION)
    sources = [
        {
            "type": "INLINE",
            "inlineDocumentSource": {
                "type": "TEXT",
                "textDocument": {"text": index.chunks[h.idx]["text"]},
            },
        }
        for h in hits
    ]
    r = client.rerank(
        queries=[{"type": "TEXT", "textQuery": {"text": query}}],
        sources=sources,
        rerankingConfiguration={
            "type": "BEDROCK_RERANKING_MODEL",
            "bedrockRerankingConfiguration": {
                "modelConfiguration": {"modelArn": RERANK_ARN},
                "numberOfResults": min(top, len(hits)),
            },
        },
    )
    return [Hit(hits[res["index"]].idx, res["relevanceScore"], "rerank") for res in r["results"]]


# ---------- the pipeline, with every stage switchable ----------

@dataclass
class Config:
    use_bm25: bool = True
    use_dense: bool = True
    use_rerank: bool = True
    per_case: int | None = 2
    candidates: int = 30
    top: int = 10
    # Where diversification runs relative to the cross-encoder. Reranking picks the
    # top-N *chunks*, which can re-concentrate onto a few opinions and silently undo
    # an earlier diversification pass — so the order is a measurable choice, not a
    # detail.
    diversify_after_rerank: bool = False
    # Honor a temporal constraint extracted from the question ("as of 2015...").
    use_as_of: bool = False
    # Prepend a HyDE passage / query variants to the retrieval probe. Measured, not
    # assumed — see the ablation table.
    use_hyde: bool = False

    @property
    def label(self) -> str:
        parts = []
        if self.use_bm25:
            parts.append("bm25")
        if self.use_dense:
            parts.append("dense")
        name = "+".join(parts) or "none"
        if self.use_bm25 and self.use_dense:
            name = "hybrid"
        if self.use_rerank:
            name += "+rerank"
        if self.per_case:
            name += f"+div{self.per_case}"
            if self.diversify_after_rerank and self.use_rerank:
                name += "-post"
        if self.use_as_of:
            name += "+asof"
        if self.use_hyde:
            name += "+hyde"
        return name


def search(
    index: Index,
    query: str,
    cfg: Config,
    trace: dict | None = None,
    as_of: int | None = None,
    hyde: str | None = None,
) -> list[Hit]:
    # The probe is what the retrievers see; `query` stays the human question so the
    # cross-encoder still scores against what was actually asked.
    probe = f"{query}\n{hyde}" if (cfg.use_hyde and hyde) else query

    runs: list[list[Hit]] = []
    if index and cfg.use_bm25:
        r = index.bm25(probe, k=cfg.candidates)
        runs.append(r)
        if trace is not None:
            trace["bm25"] = r
    if cfg.use_dense:
        r = index.dense(probe, k=cfg.candidates)
        runs.append(r)
        if trace is not None:
            trace["dense"] = r

    if not runs:
        return []
    fused = runs[0] if len(runs) == 1 else rrf(runs, top=cfg.candidates * 2)
    if trace is not None:
        trace["fused"] = fused

    if cfg.use_as_of and as_of:
        fused = as_of_filter(index, fused, as_of)
        if trace is not None:
            trace["as_of"] = fused

    post = cfg.diversify_after_rerank and cfg.use_rerank
    if cfg.per_case and not post:
        fused = diversify(index, fused, per_case=cfg.per_case)
        if trace is not None:
            trace["diversified"] = fused

    if not cfg.use_rerank:
        return fused[: cfg.top]

    # When diversifying after the cross-encoder, ask it for more than `top` so there
    # is something left to spread across cases once the per-case cap applies.
    want = cfg.top * 4 if post else cfg.top
    out = rerank(index, query, fused, top=min(want, len(fused)))
    if trace is not None:
        trace["rerank"] = out
    if cfg.per_case and post:
        out = diversify(index, out, per_case=cfg.per_case, top=cfg.top)
        if trace is not None:
            trace["diversified"] = out
    return out[: cfg.top]
