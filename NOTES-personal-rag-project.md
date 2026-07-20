# Pickup note — personal RAG project ("a more holistic me")

> Brainstorm + scope left for a future Claude Code session. Not built here.
> Direction: a personal RAG assistant grounded in Greg's own corpus — career
> materials plus the 52 books he read last year — something more holistic than a
> pure "chat with my resume" bot.

## Why (two goals at once)
1. **Interview fluency.** Deliberately exercise the RAG components ScoutBot's managed
   Bedrock KB *hid*, so Greg can speak to them firsthand: **hybrid search (BM25 +
   dense), a real cross-encoder re-ranker, query transformation (HyDE / multi-query),
   and an evaluation harness (faithfulness, context precision/recall).** Prefer an
   **open/local stack** (pgvector or FAISS + open embeddings + a reranker model) so
   every piece is visible — the opposite of Bedrock abstracting it away.
2. **Useful artifact.** A genuinely interesting personal project / portfolio piece.

## The corpus question (the crux — and a great design constraint to talk about)
Greg wants to fold in the 52 books. **Do NOT ingest full copyrighted book text** —
legally and ethically off-limits to embed and serve generated text from. This is the
*same* constraint ScoutBot solved with Brugler ("paraphrase-only, never >4 words
verbatim"), so it's on-brand and an interview-worthy story. Options, cleanest first:

- **Greg's own notes/highlights/reflections** on each book (Kindle highlights export,
  Goodreads notes, Readwise, personal journal entries). These are *his* words → no
  licensing problem, and richer signal about how he thinks.
- **Short factual metadata** per book (title, author, themes, his rating, a 2–3
  sentence personal takeaway he writes). Light but clean.
- **Public summaries / his own blog-style write-ups** authored by Greg.
- If full text is ever wanted: keep it **private/local-only** (never served publicly)
  and treat as a separate, clearly-fenced data source — but default to the above.

Career-side source material (all Greg-owned, no licensing issue):
- Resume variants + project write-ups (Job Hunt folder has many).
- ScoutBot / Elevator CV / AdventureWorks design notes (good "how I built X" answers).
- Daily reports / reflections, EMBA work, sports projects.

## Candidate framing
A holistic "ask me anything about Greg" assistant: career history *and* intellectual
life (what he's read, how it shaped his thinking). Could power an interactive panel on
greghlewis.com ("interview me") and double as live RAG evidence in actual interviews.

## Suggested scoped v1 (keep it small, hit every component once)
1. Ingest two source types: career docs + book notes/highlights (Greg's words only).
2. Chunking: start simple (recursive, ~300–500 tokens, overlap), leave room to compare
   against hierarchical later — chunking comparison is itself an interview talking point.
3. Embeddings: an open model (e.g. BGE / E5 family) → pgvector or FAISS.
4. Retrieval: **hybrid** (BM25 + dense) with a fusion step, then a **cross-encoder
   re-ranker** (e.g. bge-reranker). Metadata filter by source type / book vs career.
5. Query transformation: add multi-query or HyDE and measure whether it helps.
6. Generation: grounded prompt, cite-or-refuse, paraphrase-only for any book-derived text.
7. **Evaluation harness (do not skip — highest interview leverage):** a small golden
   Q&A set; score context precision/recall + faithfulness; log retrieval hit-rate.
   Being able to say "I measured it" is the seniority signal.

## Open questions for Greg
- Where do the book notes live today (Kindle / Goodreads / Readwise / notebook)? Need a
  source to export from before this is buildable.
- Public on greghlewis.com, or private/local tool? (Affects what corpus is allowed.)
- Holistic "all of me" scope, or two separate indexes (career vs reading) with a router?
- Reuse the AdventureWorks model-toggle + Turnstile + rate-limit plumbing if it ships public.

## Builder caution
Non-standard Next.js if any UI lands on this site — see `AGENTS.md`, read
`node_modules/next/dist/docs/` first. Backend RAG work can live wherever Greg prefers
(the AdventureWorks pattern used a separate Azure Functions service).
