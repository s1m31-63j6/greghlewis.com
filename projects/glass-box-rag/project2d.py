"""Project chunk vectors to 2D for the embedding-map tab.

Computed offline and shipped as static coordinates — no runtime dimensionality
reduction. t-SNE rather than UMAP because umap-learn pins an llvmlite that will
not build on Python 3.11.
"""
from __future__ import annotations

import json

import numpy as np
from sklearn.manifold import TSNE

from common import BUILD, write_json

chunks = json.loads((BUILD / "chunks.json").read_text())
meta = json.loads((BUILD / "vectors-titan.meta.json").read_text())
V = np.fromfile(BUILD / "vectors-titan.bin", dtype=np.float32).reshape(meta["count"], meta["dims"])

xy = TSNE(
    n_components=2, metric="cosine", init="pca",
    perplexity=30, random_state=0,
).fit_transform(V)

# Normalize to [-1, 1] so the frontend doesn't need to know the scale.
xy = xy - xy.mean(axis=0)
xy = xy / np.abs(xy).max()

write_json(
    BUILD / "projection.json",
    [
        {
            "id": c["id"], "case_id": c["case_id"], "case_name": c["case_name"],
            "layer": c["layer"], "court": c["court"], "year": c["year"],
            "x": round(float(x), 4), "y": round(float(y), 4),
        }
        for c, (x, y) in zip(chunks, xy)
    ],
)
print(f"projected {len(chunks)} chunks -> projection.json")
