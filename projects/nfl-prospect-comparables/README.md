# NFL Prospect Comparables Engine

**Project #1** for greghlewis.com. Embedding-based comparables engine that maps NFL draft prospects to historical players with similar profiles, grounded in engineered features computed from public play-by-play data.

## Pitch

Recreate Brugler-quality scouting comps using public data sources he's working against anyway. Engineered features from raw college play-by-play do the analytical heavy lifting; the LLM narrative layer paraphrases retrieved scouting text with citations.

## Scope

- **Positions:** QB, RB, WR, TE
- **Training cohort:** 2014–2020 draft classes (settled 5+ year outcomes)
- **Validation cohort:** 2021–2025 (partial outcomes)
- **Prediction cohort:** 2026 draft class (the headline output)
- **Ship target:** Friday Sept 4, 2026 (week before NFL Week 1)

## Layout

```
projects/nfl-prospect-comparables/
└── engine/                 ← Python workspace (uv-managed)
    ├── src/engine/
    │   ├── schema.py       ← PlayerProfile + outcome classifier
    │   ├── features/
    │   │   └── catalog.py  ← 131-feature canonical inventory
    │   ├── ingest/         ← nflverse + CFBD ingestion
    │   └── io/             ← S3 helpers
    └── scripts/            ← runnable jobs
```

Site routes for this project will live at `/projects/nfl-prospect-comparables/` once Phase 5 builds the public-facing pages.

## AWS resources

Provisioned by repo-root `infra/` CDK app, stack `NflComparablesData`:

- Raw bucket: `nflcomparablesdata-rawbucket0c3ee094-a5h19emeh3zc`
- Curated bucket: `nflcomparablesdata-curatedbucket6a59c97e-7doifyurcsxx`
- Engine policy: `arn:aws:iam::397483229232:policy/NflComparablesData-EngineDataAccessPolicy7EABAF16-poDjSFBZTPBb`

All in the `portfolio` AWS account (`397483229232`), region `us-east-1`.

## Data sources (all free + open)

- **nflverse** — pro play-by-play + outcomes, 1999+
- **CFBD** — college play-by-play + box scores + recruiting rankings, 2014+ usable
- **Pro Football Reference** — career AV, Pro Bowls, All-Pros
- **NFL Combine + RAS** — measurables, normalized percentiles
- **NFL.com / ESPN / Walter Football / Drafttek / Wikipedia** — supplementary scouting text
- **Brugler "The Beast" 2018–2025** — primary scouting RAG corpus, accessed via Athletic subscription. Private S3 only; never exposed publicly. LLM paraphrases with citation; never quotes >5 consecutive words.
