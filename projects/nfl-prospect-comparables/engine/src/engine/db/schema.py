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


# ---------- Bedrock Knowledge Base storage table ----------
#
# Bedrock KB (RDS PostgreSQL backend) requires a specific table layout. We
# deliberately keep this in the SAME database as the comp-engine vectors —
# "one DB, two indexes" is the methodology-page right-sizing story.
#
# Required by Bedrock spec:
#   id                 uuid primary key
#   embedding          vector(1024) — Titan v2 dim
#   chunks             text         — chunk text content
#   metadata           json         — Bedrock-managed; includes source URI,
#                                     chunk position, custom metadata fields
# Plus an HNSW cosine index on `embedding` for retrieval performance.
#
# Bedrock writes to this table via the engine DB user (same Secrets Manager
# secret as comp-engine). The KB IAM role gets `secretsmanager:GetSecretValue`
# on that secret.
#
# Custom metadata columns (`source`, `player_id`, `draft_year`, `position`)
# are populated via `.metadata.json` sidecar files we ship alongside each
# corpus text file. They let consumers filter retrievals (e.g., "only Brugler
# 2024" or "only WR prospects").
# One statement per element. Data API rejects multi-statement strings,
# and psycopg can chain them in a single execute() so this list works for
# both backends (`KB_DDL_STATEMENTS` is the authoritative source).
KB_DDL_STATEMENTS = [
    "CREATE EXTENSION IF NOT EXISTS vector",
    """
    CREATE TABLE IF NOT EXISTS bedrock_kb_chunks (
        id              uuid PRIMARY KEY,
        embedding       vector(1024) NOT NULL,
        chunks          text NOT NULL,
        metadata        jsonb,
        custom_metadata jsonb
    )
    """,
    # Idempotent column adds for tables created before custom_metadata
    # was a separate JSONB column.
    "ALTER TABLE bedrock_kb_chunks ADD COLUMN IF NOT EXISTS custom_metadata jsonb",
    "ALTER TABLE bedrock_kb_chunks DROP COLUMN IF EXISTS source",
    "ALTER TABLE bedrock_kb_chunks DROP COLUMN IF EXISTS player_id",
    "ALTER TABLE bedrock_kb_chunks DROP COLUMN IF EXISTS draft_year",
    "ALTER TABLE bedrock_kb_chunks DROP COLUMN IF EXISTS position",
    """
    CREATE INDEX IF NOT EXISTS bedrock_kb_chunks_embedding_idx
        ON bedrock_kb_chunks USING hnsw (embedding vector_cosine_ops)
    """,
    # GIN tsvector index — required by Bedrock KB for hybrid search.
    # 'simple' avoids stemming + stop-word removal, which matters for
    # proper-noun-heavy NFL prospect text.
    """
    CREATE INDEX IF NOT EXISTS bedrock_kb_chunks_chunks_fts_idx
        ON bedrock_kb_chunks USING gin (to_tsvector('simple', chunks))
    """,
    # JSONB GIN index for filter pushdown on custom_metadata. Bedrock KB
    # requires the default `jsonb_ops` opclass (supports `?` key-existence
    # and `@>` containment); `jsonb_path_ops` is rejected at validation.
    """
    CREATE INDEX IF NOT EXISTS bedrock_kb_chunks_custom_metadata_idx
        ON bedrock_kb_chunks USING gin (custom_metadata)
    """,
    "DROP INDEX IF EXISTS bedrock_kb_chunks_custom_metadata_idx_pathops",
    "DROP INDEX IF EXISTS bedrock_kb_chunks_player_idx",
    "DROP INDEX IF EXISTS bedrock_kb_chunks_source_idx",
]

KB_SCHEMA_DDL = ";\n".join(KB_DDL_STATEMENTS) + ";"
KB_INDEX_DDL = KB_SCHEMA_DDL  # legacy alias; psycopg path runs all statements together


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


def bootstrap_kb_schema(
    *,
    secret_arn: str | None = None,
    database_name: str | None = None,
) -> None:
    """Set up the Bedrock-KB chunks table + hnsw cosine index.

    Targets Aurora when `secret_arn` + `database_name` point at the Aurora
    cluster from NflComparablesKb. Idempotent — safe to re-run.

    NOTE: requires direct TCP/5432 access. For Aurora SV2 with min ACU=0
    behind a default-empty SG, prefer `bootstrap_kb_schema_data_api()` —
    it goes through the RDS Data API HTTPS endpoint (no SG ingress, no
    auto-pause race).
    """
    with connect(secret_arn=secret_arn, database_name=database_name) as conn:
        with conn.cursor() as cur:
            cur.execute(KB_SCHEMA_DDL)
        conn.commit()


def bootstrap_kb_schema_data_api(
    *,
    cluster_arn: str,
    secret_arn: str,
    database_name: str,
    region: str = "us-east-1",
) -> None:
    """Same DDL via the RDS Data API (no SG ingress required).

    Aurora SV2 auto-resume is handled by retrying the first statement up
    to 6 times (covers the ~30s cold-start from min ACU=0).
    """
    import time
    import boto3

    client = boto3.client("rds-data", region_name=region)

    from botocore.exceptions import ClientError

    def _execute(sql: str, allow_resume_retry: bool = False) -> None:
        attempts = 6 if allow_resume_retry else 1
        last_err: Exception | None = None
        for i in range(attempts):
            try:
                client.execute_statement(
                    resourceArn=cluster_arn,
                    secretArn=secret_arn,
                    database=database_name,
                    sql=sql,
                )
                return
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                msg = str(e)
                if (
                    code == "DatabaseResumingException"
                    or "is resuming" in msg
                    or "is not currently available" in msg
                ):
                    last_err = e
                    time.sleep(15)
                    continue
                raise
        if last_err is not None:
            raise last_err

    for i, stmt in enumerate(KB_DDL_STATEMENTS):
        _execute(stmt.strip(), allow_resume_retry=(i == 0))
