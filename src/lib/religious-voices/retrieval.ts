// In-memory retrieval over the bundled corpus.json.
//
// Architecture:
//   1. corpus.json (3,656 chunks × 1024-dim Cohere embeddings) is bundled
//      with the SSR Lambda via a direct JSON import. Lazy-loaded once per
//      cold start, cached for the life of the warm container.
//   2. Per-query: embed the query via Bedrock cohere.embed-english-v3
//      with input_type="search_query" (asymmetric retrieval — corpus was
//      embedded as "search_document").
//   3. Filter chunks by leader_id (cheap pre-filter), then cosine top-K.
//
// No Chroma, no Aurora, no Knowledge Base — the corpus is small enough
// (~3.7M floats to dot-product) that linear scan in JS is sub-100ms.

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import corpusJson from "./corpus.json";
import type { RetrievedPassage } from "./persona";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const EMBED_MODEL = "cohere.embed-english-v3";

interface RawChunk {
  id: string;
  leader_id: string;
  religion: string;
  year: number | null;
  work_title: string;
  source_url: string;
  text: string;
  embedding: number[];
}

interface IndexedChunk extends RawChunk {
  // Pre-computed L2 norm so cosine reduces to dot / (qNorm * cNorm).
  norm: number;
}

let _corpus: IndexedChunk[] | null = null;
let _byLeader: Map<string, IndexedChunk[]> | null = null;

function loadCorpus(): { all: IndexedChunk[]; byLeader: Map<string, IndexedChunk[]> } {
  if (_corpus && _byLeader) return { all: _corpus, byLeader: _byLeader };
  const raw = (corpusJson as { chunks: RawChunk[] }).chunks;
  _corpus = raw.map((c) => ({ ...c, norm: l2(c.embedding) }));
  _byLeader = new Map();
  for (const c of _corpus) {
    const arr = _byLeader.get(c.leader_id) ?? [];
    arr.push(c);
    _byLeader.set(c.leader_id, arr);
  }
  return { all: _corpus, byLeader: _byLeader };
}

function l2(v: number[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

let _client: BedrockRuntimeClient | null = null;

function client(): BedrockRuntimeClient {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: REGION,
      credentials: process.env.AWS_PROFILE
        ? fromIni({ profile: process.env.AWS_PROFILE })
        : fromNodeProviderChain(),
    });
  }
  return _client;
}

async function embedQuery(query: string): Promise<number[]> {
  // Bedrock pre-validates Cohere v3 inputs at 2048 chars; truncate to be safe.
  const body = JSON.stringify({
    texts: [query.slice(0, 2000)],
    input_type: "search_query",
  });
  const resp = await client().send(
    new InvokeModelCommand({
      modelId: EMBED_MODEL,
      body,
      contentType: "application/json",
    }),
  );
  const payload = JSON.parse(new TextDecoder().decode(resp.body)) as {
    embeddings: number[][];
  };
  return payload.embeddings[0];
}

export async function retrieveForLeader(
  query: string,
  leaderId: string,
  k = 8,
): Promise<RetrievedPassage[]> {
  const { byLeader } = loadCorpus();
  const candidates = byLeader.get(leaderId);
  if (!candidates || candidates.length === 0) return [];

  const qVec = await embedQuery(query);
  const qNorm = l2(qVec);
  if (qNorm === 0) return [];

  // Cosine via dot / (qNorm * cNorm). We compute qNorm once and reuse
  // per-chunk norm from the index.
  const scored = candidates.map((c) => ({
    chunk: c,
    score: dot(qVec, c.embedding) / (qNorm * c.norm),
  }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map(({ chunk }) => ({
    text: chunk.text,
    work_title: chunk.work_title,
    year: chunk.year,
    source_url: chunk.source_url,
  }));
}

// Strip the full passage text and dedupe by (work, year, url) — the
// meta event carries source attribution for the UI footer, not corpus.
export function dedupeSources(
  passages: RetrievedPassage[],
): Array<{ work_title: string; year: number | null; source_url: string }> {
  const seen = new Set<string>();
  const out: Array<{ work_title: string; year: number | null; source_url: string }> = [];
  for (const p of passages) {
    const key = `${p.work_title}::${p.year ?? ""}::${p.source_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ work_title: p.work_title, year: p.year, source_url: p.source_url });
  }
  return out;
}
