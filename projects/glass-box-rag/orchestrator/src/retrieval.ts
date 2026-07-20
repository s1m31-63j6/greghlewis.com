/**
 * TypeScript port of the Python retrieval core (../retrieve.py).
 *
 * This is a deliberate re-implementation rather than a service call: the whole
 * premise of the project is that the pipeline runs live and streams its real
 * intermediate state. `npm run parity` checks this agrees with the Python
 * reference, because two implementations that silently drift would invalidate
 * every number the evaluation harness produced.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { BedrockAgentRuntimeClient, RerankCommand } from "@aws-sdk/client-bedrock-agent-runtime";

export const REGION = process.env.AWS_REGION ?? "us-east-1";
export const EMBED_MODEL = "amazon.titan-embed-text-v2:0";
export const RERANK_ARN = `arn:aws:bedrock:${REGION}::foundation-model/cohere.rerank-v3-5:0`;
const RERANK_MAX_DOCS = 100; // hard Bedrock limit, and the pricing unit

export interface Chunk {
  id: string;
  case_id: string;
  case_name: string;
  court: string;
  court_level: string;
  year: number;
  layer: string;
  section: string | null;
  text: string;
  token_count: number;
  citation: string | null;
  date: string | null;
  judge: string | null;
}

export interface Hit {
  idx: number;
  score: number;
  stage: string;
}

// Must stay identical to STOP in retrieve.py or BM25 scores diverge.
const STOP = new Set(
  ("the of to a in and that is for it as on with this be by not was are or at from an we its " +
    "would has have had were which but their there than such may can will no any all if when " +
    "does do court courts id see also supra cf e.g i.e").split(" "),
);

const TOKEN_RE = /[a-z0-9§]+/g;

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(TOKEN_RE)) {
    const t = m[0];
    if (t.length > 1 && !STOP.has(t)) out.push(t);
  }
  return out;
}

export class Index {
  chunks: Chunk[];
  dims: number;
  vectors: Float32Array;
  private docLen: Float32Array;
  private avgdl = 0;
  private tf: Map<string, number>[] = [];
  private idf = new Map<string, number>();
  private postings = new Map<string, number[]>();

  constructor(chunks: Chunk[], vectors: Float32Array, dims: number) {
    this.chunks = chunks;
    this.vectors = vectors;
    this.dims = dims;
    this.docLen = new Float32Array(chunks.length);
    this.buildBm25();
  }

  private buildBm25(): void {
    const df = new Map<string, number>();
    this.chunks.forEach((c, i) => {
      const toks = tokenize(c.text);
      this.docLen[i] = toks.length;
      const counts = new Map<string, number>();
      for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
      this.tf.push(counts);
      for (const t of counts.keys()) {
        df.set(t, (df.get(t) ?? 0) + 1);
        let p = this.postings.get(t);
        if (!p) this.postings.set(t, (p = []));
        p.push(i);
      }
    });
    let total = 0;
    for (const l of this.docLen) total += l;
    this.avgdl = total / this.chunks.length;

    // Lucene idf variant — see the long note in retrieve.py for why this and not
    // the rank_bm25 form (which clamps negative idf and collapses common terms).
    const n = this.chunks.length;
    for (const [t, c] of df) this.idf.set(t, Math.log(1 + (n - c + 0.5) / (c + 0.5)));
  }

  bm25(query: string, k = 30, k1 = 1.5, b = 0.75): Hit[] {
    const scores = new Map<number, number>();
    for (const term of tokenize(query)) {
      const idf = this.idf.get(term);
      if (idf === undefined) continue;
      for (const i of this.postings.get(term)!) {
        const f = this.tf[i].get(term)!;
        const denom = f + k1 * (1 - b + (b * this.docLen[i]) / this.avgdl);
        scores.set(i, (scores.get(i) ?? 0) + (idf * (f * (k1 + 1))) / denom);
      }
    }
    return [...scores.entries()]
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, k)
      .map(([idx, score]) => ({ idx, score, stage: "bm25" }));
  }

  dense(qvec: Float32Array, k = 30): Hit[] {
    const n = this.chunks.length;
    const scored = new Array<Hit>(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const off = i * this.dims;
      // vectors are pre-normalized, so a dot product IS cosine similarity
      for (let d = 0; d < this.dims; d++) s += this.vectors[off + d] * qvec[d];
      scored[i] = { idx: i, score: s, stage: "dense" };
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

let _br: BedrockRuntimeClient | undefined;
export async function embedQuery(query: string, dims: number): Promise<Float32Array> {
  _br ??= new BedrockRuntimeClient({ region: REGION });
  const r = await _br.send(
    new InvokeModelCommand({
      modelId: EMBED_MODEL,
      body: JSON.stringify({ inputText: query, dimensions: dims, normalize: true }),
    }),
  );
  const payload = JSON.parse(new TextDecoder().decode(r.body));
  const v = Float32Array.from(payload.embedding as number[]);
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

/**
 * Reciprocal Rank Fusion. Uses RANK, not score — BM25 scores and cosine
 * similarities live on incomparable scales. k=60 is the Cormack et al. value.
 */
export function rrf(runs: Hit[][], k = 60, top = 40): Hit[] {
  const agg = new Map<number, number>();
  for (const run of runs) {
    run.forEach((hit, rank) => {
      agg.set(hit.idx, (agg.get(hit.idx) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...agg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([idx, score]) => ({ idx, score, stage: "rrf" }));
}

/**
 * Cap how many chunks any one case may contribute. Measured as the single biggest
 * win in the ablation (critical recall 0.868 -> 0.921): without it, retrieval
 * collapses onto one opinion and the Bartz/Kadrey counterpoint never surfaces.
 */
export function diversify(index: Index, hits: Hit[], perCase = 2, top?: number): Hit[] {
  const seen = new Map<string, number>();
  const out: Hit[] = [];
  for (const h of hits) {
    const cid = index.chunks[h.idx].case_id;
    const n = seen.get(cid) ?? 0;
    if (n >= perCase) continue;
    seen.set(cid, n + 1);
    out.push({ ...h, stage: "diversified" });
    if (top && out.length >= top) break;
  }
  return out;
}

/** Drop opinions that did not exist yet. The only stage that fixes anachronism. */
export function asOfFilter(index: Index, hits: Hit[], year: number): Hit[] {
  return hits.filter((h) => index.chunks[h.idx].year <= year);
}

let _bar: BedrockAgentRuntimeClient | undefined;
export async function rerank(index: Index, query: string, hits: Hit[], top = 10): Promise<Hit[]> {
  if (hits.length === 0) return [];
  const slice = hits.slice(0, RERANK_MAX_DOCS);
  _bar ??= new BedrockAgentRuntimeClient({ region: REGION });
  const r = await _bar.send(
    new RerankCommand({
      queries: [{ type: "TEXT", textQuery: { text: query } }],
      sources: slice.map((h) => ({
        type: "INLINE",
        inlineDocumentSource: {
          type: "TEXT",
          textDocument: { text: index.chunks[h.idx].text },
        },
      })),
      rerankingConfiguration: {
        type: "BEDROCK_RERANKING_MODEL",
        bedrockRerankingConfiguration: {
          modelConfiguration: { modelArn: RERANK_ARN },
          numberOfResults: Math.min(top, slice.length),
        },
      },
    }),
  );
  return (r.results ?? []).map((res) => ({
    idx: slice[res.index!].idx,
    score: res.relevanceScore!,
    stage: "rerank",
  }));
}

export interface RetrieveOptions {
  candidates?: number;
  top?: number;
  perCase?: number | null;
  useRerank?: boolean;
  asOf?: number | null;
}

export interface RetrieveTrace {
  bm25?: Hit[];
  dense?: Hit[];
  fused?: Hit[];
  asOf?: Hit[];
  reranked?: Hit[];
  diversified?: Hit[];
}

/**
 * The winning configuration from the ablation: hybrid + rerank + diversify-AFTER-rerank
 * + as-of filter (critical recall 0.921, MRR 0.855, zero anachronisms).
 *
 * Diversification runs after the cross-encoder on purpose. Reranking selects the top-N
 * *chunks*, which re-concentrates onto a few opinions and silently undoes an earlier
 * diversify pass — measured as 0.895 vs 0.921 critical recall.
 */
export async function retrieve(
  index: Index,
  query: string,
  opts: RetrieveOptions = {},
  trace: RetrieveTrace = {},
): Promise<Hit[]> {
  const { candidates = 30, top = 10, perCase = 2, useRerank = true, asOf = null } = opts;

  const bm = index.bm25(query, candidates);
  trace.bm25 = bm;
  const qvec = await embedQuery(query, index.dims);
  const dn = index.dense(qvec, candidates);
  trace.dense = dn;

  let fused = rrf([bm, dn], 60, candidates * 2);
  trace.fused = fused;

  if (asOf) {
    fused = asOfFilter(index, fused, asOf);
    trace.asOf = fused;
  }
  if (!useRerank) {
    const out = perCase ? diversify(index, fused, perCase, top) : fused.slice(0, top);
    trace.diversified = out;
    return out;
  }

  // Ask for more than `top` so diversification has something to spread across cases.
  const want = perCase ? top * 4 : top;
  const ranked = await rerank(index, query, fused, Math.min(want, fused.length));
  trace.reranked = ranked;

  const out = perCase ? diversify(index, ranked, perCase, top) : ranked.slice(0, top);
  trace.diversified = out;
  return out;
}
