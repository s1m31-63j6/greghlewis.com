// In-process vector retrieval for the religious-voices chatbot.
//
// The whole point of this module — and the reason this project's
// architecture diverges from the NFL chat — is to avoid a managed vector
// DB. The corpus is small (~2K chunks); cosine similarity over Float32Array
// vectors in Node is sub-10ms. We pay $0 at idle vs. ~$45/mo for Bedrock
// Knowledge Base's underlying Aurora SV2.
//
// Corpus is loaded once per process from disk (not /public/) and cached.

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni, fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Chunk, Corpus } from "./types";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const EMBED_MODEL_ID = "cohere.embed-english-v3";

function credentials() {
  return process.env.AWS_PROFILE
    ? fromIni({ profile: process.env.AWS_PROFILE })
    : fromNodeProviderChain();
}

let _runtimeClient: BedrockRuntimeClient | null = null;
function runtimeClient(): BedrockRuntimeClient {
  if (!_runtimeClient) {
    _runtimeClient = new BedrockRuntimeClient({
      region: REGION,
      credentials: credentials(),
    });
  }
  return _runtimeClient;
}

interface CachedCorpus {
  chunks: Chunk[];
  // Parallel array of Float32 embeddings — we allocate once at load time so
  // the per-query cosine loop touches contiguous memory and doesn't realloc.
  vectors: Float32Array[];
  // Pre-computed L2 norm per chunk so cosine = dot / (qnorm * cnorm) avoids
  // re-summing squares on every query.
  norms: Float32Array;
}

let _corpusPromise: Promise<CachedCorpus> | null = null;

async function loadCorpus(): Promise<CachedCorpus> {
  const corpusPath = path.join(process.cwd(), "src/lib/religious-voices/corpus.json");
  const raw = await fs.readFile(corpusPath, "utf8");
  const parsed = JSON.parse(raw) as Corpus;
  const chunks = parsed.chunks;
  const vectors: Float32Array[] = new Array(chunks.length);
  const norms = new Float32Array(chunks.length);
  for (let i = 0; i < chunks.length; i++) {
    const e = chunks[i].embedding;
    const v = new Float32Array(e.length);
    let n = 0;
    for (let j = 0; j < e.length; j++) {
      v[j] = e[j];
      n += e[j] * e[j];
    }
    vectors[i] = v;
    norms[i] = Math.sqrt(n);
  }
  return { chunks, vectors, norms };
}

function getCorpus(): Promise<CachedCorpus> {
  if (!_corpusPromise) _corpusPromise = loadCorpus();
  return _corpusPromise;
}

// Cohere returns float embeddings keyed by input_type. "search_query" for
// short user queries, "search_document" for the long corpus passages — the
// two registers produce different vectors for better retrieval asymmetry.
async function embedQuery(query: string): Promise<Float32Array> {
  const cmd = new InvokeModelCommand({
    modelId: EMBED_MODEL_ID,
    body: JSON.stringify({
      texts: [query],
      input_type: "search_query",
    }),
    contentType: "application/json",
    accept: "application/json",
  });
  const resp = await runtimeClient().send(cmd);
  const payload = JSON.parse(new TextDecoder().decode(resp.body)) as {
    embeddings: number[][];
  };
  const e = payload.embeddings[0];
  const out = new Float32Array(e.length);
  for (let i = 0; i < e.length; i++) out[i] = e[i];
  return out;
}

function cosine(q: Float32Array, qNorm: number, c: Float32Array, cNorm: number): number {
  const denom = qNorm * cNorm;
  if (denom === 0) return 0;
  let dot = 0;
  // Cohere v3 is 1024-dim; this loop runs ~1024 multiplies per chunk × ~2K
  // chunks = ~2M ops per query, which is sub-10ms in V8.
  for (let i = 0; i < q.length; i++) dot += q[i] * c[i];
  return dot / denom;
}

export interface RetrievedChunk {
  chunk: Chunk;
  score: number;
}

export async function retrieveForLeader(
  query: string,
  leaderId: string,
  k = 8,
): Promise<RetrievedChunk[]> {
  const [corpus, qVec] = await Promise.all([getCorpus(), embedQuery(query)]);
  let qNorm = 0;
  for (let i = 0; i < qVec.length; i++) qNorm += qVec[i] * qVec[i];
  qNorm = Math.sqrt(qNorm);

  // Min-heap-ish via fixed-size top-K. With ~80 chunks per leader the array
  // is small enough that a full sort is simpler and not measurably slower
  // than a real heap.
  const scored: RetrievedChunk[] = [];
  for (let i = 0; i < corpus.chunks.length; i++) {
    if (corpus.chunks[i].leader_id !== leaderId) continue;
    const score = cosine(qVec, qNorm, corpus.vectors[i], corpus.norms[i]);
    scored.push({ chunk: corpus.chunks[i], score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
