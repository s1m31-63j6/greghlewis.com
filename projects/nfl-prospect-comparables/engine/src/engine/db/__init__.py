"""Phase 2.6 — RDS Postgres + pgvector client.

The DbStack provisions an empty Postgres 16 instance with the pgvector
extension available. This package handles:
  - connection from Secrets Manager (engine.db.client)
  - schema bootstrap — extension + tables + indexes (engine.db.schema)
  - bulk load of hybrid vectors from S3 (engine.db.load)
  - kNN query API matching engine.embedding.comps (engine.db.query)

Vector storage convention: feature vectors are padded to dim 64 (max across
positions: WR has 63 dims, others 56-62). Padded zeros don't affect cosine
similarity for L2-normalized vectors. hybrid_vec = vector(1088) = 64 + 1024.
"""
