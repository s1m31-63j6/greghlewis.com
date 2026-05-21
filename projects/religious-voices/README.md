# Religious Voices — corpus pipeline

Offline Python pipeline that scrapes, chunks, and embeds source texts for
each religious leader, then emits two JSON files that the Next.js app
consumes:

- `../../src/lib/religious-voices/corpus.json` — chunks with 1024-dim Cohere
  embeddings (~30 MB at 4-decimal precision; 9 MB gzipped).
- `../../src/lib/religious-voices/leaders.json` — leader manifest (only
  leaders with chunks), seeds the SSR dropdown.

## Architecture in one sentence

A static corpus + in-process cosine similarity replaces the managed
vector DB that the NFL chat uses — zero infrastructure cost at idle.

## Workflow

1. **Edit `leaders.yaml`** to add/remove leaders. The frontend renders any
   leader listed here who also has chunks in `corpus.json`. Leaders with
   no chunks are silently skipped.

2. **Add source text** by one of two paths:

   - **Quick path (`seed_passages.yaml`)** — hand-paste short verified
     passages from canonical URLs. Useful for getting the UI running
     before the proper scrapers exist.
   - **Production path (`scrape/<source>.py`)** — write a scraper module
     for a publisher (e.g. `scrape/journal_of_discourses.py`) that yields
     `SourceText` objects.

3. **Build the corpus**:

   ```bash
   cd projects/religious-voices
   uv sync
   uv run python build.py --seed           # seed-only (fast, no scrape)
   uv run python build.py                   # full scrape
   uv run python build.py --seed --no-embed # fastest iteration; embeddings empty
   ```

   AWS credentials must be configured (env vars, `~/.aws/credentials`, or
   `AWS_PROFILE=portfolio`). Bedrock Cohere `embed-english-v3` runs in
   `us-east-1`.

4. **Commit the output**: `corpus.json` and `leaders.json` are
   checked into the repo. The Next.js build picks them up automatically.

## Chunk shape

Each chunk targets 350–500 tokens, split on paragraph boundaries first
and sentence boundaries within oversize paragraphs. Per-leader cap of
~80 chunks (configurable via `--cap`) keeps the corpus balanced — Mormon
sources will otherwise be ~10× denser than Buddhist.

## Cost shape

- Embed step: ~2000 chunks × Cohere v3 at $0.0001/1K tokens = a few cents
  for a full rebuild. Takes under a minute.
- Per-query cost (runtime, not build-time): one Cohere v3 query embed
  per chat turn — fractions of a penny.

## Source license posture

Each entry in `leaders.yaml` lists its source license:

- `public-domain` — pre-1929 US works (Spurgeon, Vivekananda's Complete
  Works, Journal of Discourses, etc.). Safe to chunk freely.
- `public` — material the source publisher releases freely (vatican.va,
  rabbisacks.org, plumvillage.org).
- `fair-use` — modern copyrighted material relied on under transformative
  use. Keep chunks ≤ 500 tokens, retain source URLs in every chunk,
  surface attribution in the UI.

If in doubt, omit. The site is a chatbot, not a republication.

## Re-running

The full pipeline is idempotent — re-running overwrites the two output
files. The frontend lazy-loads `corpus.json` once per process; a new
deploy picks up the new corpus automatically.
