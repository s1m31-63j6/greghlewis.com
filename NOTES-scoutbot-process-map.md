# Pickup note — ScoutBot RAG process-map artifact

> Spec left for a future Claude Code session. Not built here. Goal: add a visual
> process map of the ScoutBot RAG pipeline to the site, surfaced as a small
> thumbnail in the corner that expands to the full diagram.

## Why
Greg is interviewing for RAG-heavy roles (LexisNexis Senior Manager, Data Science).
A clean, accurate pipeline diagram on the NFL Comparables project (a) makes the site
a better interview artifact and (b) is a study aid for narrating each component
fluently. The diagram should map to the *actual* implementation, not a generic
textbook RAG flow.

## What to build
A process/architecture diagram of the ScoutBot retrieval-augmented-generation
pipeline, end to end.

- **Placement:** small thumbnail pinned in a corner of the NFL Comparables project
  page (`src/app/projects/nfl-prospect-comparables/`) and/or the methodology page
  (`.../methodology/page.tsx`). Click/tap expands to a full-size, readable diagram
  (modal/lightbox). Thumbnail should read as a recognizable "pipeline" silhouette
  even when small; full detail only on expand.
- **Style:** match the site palette (primary navy `#1B4F7A`; accents claret
  `#7A1B4F`, ochre `#B8860B`, forest `#2F5233`). Geist font. Keep it legible.
- **Implementation options (builder's choice):** a hand-built SVG/React component,
  or Mermaid (already used elsewhere? confirm). Static SVG is simplest for a
  thumbnail-to-modal pattern. Avoid heavy deps.

## Content the diagram must depict (ground truth — verify against code before building)
Source of truth: `src/lib/nfl-comparables/rag.ts` and `infra/stacks/nfl_comparables_kb.py`.

**Ingestion (offline, IaC in `infra/`)**
- Sources on S3 under `corpus/` prefixes: Brugler ("The Beast", licensed —
  paraphrase-only), Walter Football (public), Wikipedia (chat-retrieval only),
  recency layer (Daniel Jeremiah / Rotoworld / Bleacher Report / ESPN / PFN,
  bundled under one `corpus/recency/` data source — Bedrock caps at 5 sources/KB).
- Sidecar `.metadata.json` per chunk tags: `source`, `player_id`, `draft_year`,
  `position`, `cohort`.
- Bedrock Knowledge Base ingestion: **hierarchical chunking** (parent 1500 tokens /
  leaf 300 tokens, 60-token overlap); **Titan Text Embeddings v2**, 1024-dim FLOAT32.

**Storage (two-tier, right-sized)**
- RAG vector store: **Aurora Serverless v2 Postgres + pgvector**, min ACU=0
  (scale-to-zero). ~30s cold-start handled by resume-retry in `rag.ts`.
- (Separate) comp-engine kNN store: RDS t4g.micro + pgvector (~10k cohort vectors).

**Retrieve + generate (online, `rag.ts`)**
1. Resolve player names from the query (+ pronoun carry-over for multi-turn).
2. **Intent routing** — branch before retrieval:
   - `regular` → RAG by player.
   - `find_style` ("next Saquon") → flip subjects to comp-engine matches, then RAG them.
   - `class` / `superlative` → **skip RAG**, answer deterministically from the data
     bundle (RAG can't aggregate). Worth showing as a branch — it's a key talking point.
3. **Retrieval:** one `Retrieve` call per subject player (numResults=14) with a
   metadata filter `equals player_id`; then **per-source cap = 2** diversification
   so verbose sources (Brugler/Wikipedia) don't crowd out shorter voices; sort by score.
4. **Generation:** Claude Sonnet via `InvokeModel` (cross-region inference profile),
   licensing-aware system prompt (paraphrase, never >4 consecutive words verbatim,
   ground every claim, refuse if no real match). **SSE streaming** to the UI.
5. **Second lens:** quantitative comp-engine context block blended into the prompt;
   bot surfaces tension when scouting view and comp distribution disagree.

Key design decisions to annotate (callouts/tooltips, optional): retrieve-then-generate
split (NOT managed RetrieveAndGenerate) for licensing control; hierarchical chunking;
metadata-filtered retrieval; source diversification + latency win (24 calls → 1);
Aurora scale-to-zero cost/cold-start tradeoff; intent routing around RAG for aggregation.

## Acceptance criteria
- Thumbnail visible + unobtrusive on the project page; expands to a readable diagram.
- Diagram matches current code (re-verify `rag.ts` constants before shipping — they
  drift: PER_PLAYER_RESULTS, PER_SOURCE_CAP, model id, chunk sizes).
- Responsive; no layout shift; respects site palette + font.

## Open questions for Greg
- Project page, methodology page, or both?
- Static SVG vs interactive (hover tooltips on each stage)?
- Show the comp-engine second lens, or keep the diagram RAG-only for clarity?

## Builder caution
This repo runs a **non-standard Next.js** — see `AGENTS.md`. Read the bundled guides
in `node_modules/next/dist/docs/` before writing components.
