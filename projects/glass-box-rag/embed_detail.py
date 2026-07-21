"""Build the client-side embedding-inspector assets.

For each of the 850 chunks we emit:
  - metadata + a readable text excerpt + its top-K nearest neighbours (real cosine
    over the full 1024-d Titan vectors) -> public/glass-box-rag/embedding-detail.json
  - the chunk's vector, int8-quantized against a single global scale so the heatmap
    strip is comparable across chunks -> public/glass-box-rag/embedding-vectors.i8

These are lazy-loaded by the UI only when a passage is first clicked, so they never
weigh on the initial page load. Run: `uv run python embed_detail.py`.
"""

import json
from pathlib import Path

import numpy as np

BUILD = Path("data/build")
OUT = Path("../../public/glass-box-rag")
OUT.mkdir(parents=True, exist_ok=True)

K = 6  # neighbours per chunk
EXCERPT = 340  # chars of passage text to ship

V = np.fromfile(BUILD / "vectors-titan.bin", dtype=np.float32).reshape(-1, 1024)
chunks = json.load(open(BUILD / "chunks.json"))
assert len(chunks) == V.shape[0], f"{len(chunks)} chunks vs {V.shape[0]} vectors"

# cosine == dot (vectors are L2-normalized); mask the diagonal for neighbour search
S = V @ V.T
np.fill_diagonal(S, -2.0)

def excerpt(text: str) -> str:
    t = " ".join(text.split())
    return t if len(t) <= EXCERPT else t[:EXCERPT].rsplit(" ", 1)[0] + "…"

detail = []
for i, c in enumerate(chunks):
    order = np.argsort(-S[i])[:K]
    detail.append({
        "i": i,
        "id": c["id"],
        "case_id": c["case_id"],
        "case_name": c["case_name"],
        "court": c["court"],
        "year": c["year"],
        "section": c.get("section") or None,
        "tokens": c.get("token_count"),
        "text": excerpt(c.get("text", "")),
        "neighbors": [
            {
                "id": chunks[j]["id"],
                "case_name": chunks[j]["case_name"],
                "section": chunks[j].get("section") or None,
                "sim": round(float(S[i, j]), 3),
                "same_case": chunks[j]["case_id"] == c["case_id"],
            }
            for j in order
        ],
    })

# global symmetric int8 quantization for the heatmap
gmax = float(np.abs(V).max())
q = np.clip(np.round(V / gmax * 127.0), -127, 127).astype(np.int8)
q.tofile(OUT / "embedding-vectors.i8")

json.dump(
    {"count": len(detail), "dims": 1024, "maxabs": gmax, "k": K, "chunks": detail},
    open(OUT / "embedding-detail.json", "w"),
    separators=(",", ":"),
)

dj = (OUT / "embedding-detail.json").stat().st_size
db = (OUT / "embedding-vectors.i8").stat().st_size
print(f"wrote embedding-detail.json  {dj/1024:.0f} KB  ({len(detail)} chunks)")
print(f"wrote embedding-vectors.i8   {db/1024:.0f} KB  (int8, global scale {gmax:.4f})")
