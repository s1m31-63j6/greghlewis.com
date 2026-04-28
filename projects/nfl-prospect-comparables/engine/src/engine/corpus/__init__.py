"""Phase 2.2 — scouting corpus from free public sources.

Per-source modules scrape per-player text and write to the curated bucket
under `corpus/<source>/<player_id>.txt`. Phase 2.5 reads these and embeds
them via Bedrock Titan v2. Brugler "The Beast" lives in a separate
ingestion path (Phase 2.4) under `corpus/brugler/...` with stricter
licensing handling — paraphrase + cite, never quote, raw text never
exposed by the site.
"""
