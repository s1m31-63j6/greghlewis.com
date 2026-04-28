"""Schema bootstrap — extension + tables + indexes."""

from __future__ import annotations

from engine.db.client import connect


# Vector dimensions:
#   feature_vec — per-position varies 56-63. Padded to 64 for fixed-width
#                 storage. Padded zeros don't affect cosine similarity for
#                 L2-normalized vectors.
#   text_vec    — Bedrock Titan v2 fixed dim 1024
#   hybrid_vec  — 64 + 1024 = 1088
FEATURE_DIM = 64
TEXT_DIM = 1024
HYBRID_DIM = FEATURE_DIM + TEXT_DIM


SCHEMA_DDL = f"""
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS players (
    player_id      TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    position       TEXT NOT NULL,
    cohort         TEXT NOT NULL,
    has_brugler    BOOLEAN,
    has_wikipedia  BOOLEAN,
    outcome_class  TEXT
);
CREATE INDEX IF NOT EXISTS players_position_idx ON players (position);
CREATE INDEX IF NOT EXISTS players_cohort_idx ON players (cohort);

CREATE TABLE IF NOT EXISTS embeddings (
    player_id   TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
    feature_vec vector({FEATURE_DIM}),
    text_vec    vector({TEXT_DIM}),
    hybrid_vec  vector({HYBRID_DIM})
);
"""


# ivfflat index for kNN. Built AFTER bulk load (faster + better-quality
# centroids when data is present). lists ~ sqrt(N) is a common heuristic;
# we use 32 for our ~1k-vector cohort.
INDEX_DDL = """
CREATE INDEX IF NOT EXISTS embeddings_hybrid_cos_idx
    ON embeddings USING ivfflat (hybrid_vec vector_cosine_ops) WITH (lists = 32);
CREATE INDEX IF NOT EXISTS embeddings_feature_cos_idx
    ON embeddings USING ivfflat (feature_vec vector_cosine_ops) WITH (lists = 32);
CREATE INDEX IF NOT EXISTS embeddings_text_cos_idx
    ON embeddings USING ivfflat (text_vec vector_cosine_ops) WITH (lists = 32);
"""


def bootstrap_schema() -> None:
    """Idempotent — safe to re-run."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_DDL)
        conn.commit()


def build_indexes() -> None:
    """Run after bulk load. Idempotent."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(INDEX_DDL)
        conn.commit()
