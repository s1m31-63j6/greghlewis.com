"""Dump Python BM25 rankings so the TypeScript port can be checked against them.

Run this whenever retrieve.py's tokenizer, stopword list, or idf changes.
"""

from __future__ import annotations

import json

from common import BUILD
from retrieve import Index, tokenize

QUERIES = [
    "Does market dilution from competing AI-generated works defeat fair use?",
    "Are Westlaw headnotes protectable original expression?",
    "Is copying an entire work as an intermediate step to reach unprotected elements fair use?",
    "When is a service provider contributorily liable for user infringement?",
    "Does the existence of a licensing market count as market harm?",
    "transformative parody commercial purpose",
    "§ 1202 copyright management information standing",
]

ix = Index()
out = {
    "queries": [
        {
            "q": q,
            "tokens": tokenize(q),
            "bm25": [
                # float() because doc_len is a float32 array, so scores come back
                # as np.float32, which json can't serialize.
                {"chunk_id": ix.chunks[h.idx]["id"], "score": float(h.score)}
                for h in ix.bm25(q, k=15)
            ],
        }
        for q in QUERIES
    ]
}
path = BUILD / "parity_reference.json"
path.write_text(json.dumps(out, indent=1))
print(f"wrote {path} ({len(QUERIES)} queries)")
