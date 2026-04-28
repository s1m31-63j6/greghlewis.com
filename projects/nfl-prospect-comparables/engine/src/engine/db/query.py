"""kNN comp queries via pgvector."""

from __future__ import annotations

from dataclasses import dataclass

from engine.db.client import connect
from engine.db.schema import FEATURE_DIM, HYBRID_DIM, TEXT_DIM


_VEC_COL = {
    "hybrid": "hybrid_vec",
    "feature": "feature_vec",
    "text": "text_vec",
}


@dataclass
class Comp:
    name: str
    position: str
    cohort: str
    similarity: float
    player_id: str
    outcome_class: str | None


def find_comps(
    query_name: str,
    *,
    top_k: int = 10,
    arm: str = "hybrid",
    same_position_only: bool = True,
) -> list[Comp]:
    """Top-K cosine-similarity comps for `query_name`. Same-position by default.

    Cosine distance is `<=>` in pgvector; similarity = 1 - distance.
    """
    if arm not in _VEC_COL:
        raise ValueError(f"arm must be one of {list(_VEC_COL)}")
    col = _VEC_COL[arm]

    with connect() as conn:
        with conn.cursor() as c:
            # Resolve query
            c.execute(
                "SELECT player_id, position FROM players WHERE name = %s LIMIT 1;",
                (query_name,),
            )
            row = c.fetchone()
            if row is None:
                return []
            q_pid, q_pos = row

            pos_filter = "AND p.position = %s" if same_position_only else ""
            sql = f"""
                WITH q AS (
                    SELECT {col} AS v FROM embeddings WHERE player_id = %s
                )
                SELECT
                    p.name, p.position, p.cohort, p.player_id, p.outcome_class,
                    1 - (e.{col} <=> q.v) AS similarity
                FROM embeddings e
                JOIN players p USING (player_id)
                CROSS JOIN q
                WHERE e.{col} IS NOT NULL
                  {pos_filter}
                  AND p.player_id != %s
                ORDER BY e.{col} <=> q.v
                LIMIT %s;
            """
            if same_position_only:
                c.execute(sql, (q_pid, q_pos, q_pid, top_k))
            else:
                c.execute(sql, (q_pid, q_pid, top_k))
            results = c.fetchall()

    return [
        Comp(
            name=r[0], position=r[1], cohort=r[2],
            player_id=r[3], outcome_class=r[4], similarity=float(r[5]),
        )
        for r in results
    ]
