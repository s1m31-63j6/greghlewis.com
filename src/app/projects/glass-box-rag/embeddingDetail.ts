// Lazy loader for the embedding-inspector assets. Both files live in /public and
// are fetched (once, cached) only when a passage is first clicked — so they never
// weigh on the initial page load.

export interface Neighbor {
  id: string;
  case_name: string;
  section: string | null;
  sim: number;
  same_case: boolean;
}
export interface ChunkDetail {
  i: number;
  id: string;
  case_id: string;
  case_name: string;
  court: string;
  year: number;
  section: string | null;
  tokens?: number;
  text: string;
  neighbors: Neighbor[];
}
export interface EmbeddingData {
  byId: Map<string, ChunkDetail>;
  vectors: Int8Array;
  dims: number;
  maxabs: number;
}

let cache: Promise<EmbeddingData> | null = null;

export function loadEmbeddingDetail(): Promise<EmbeddingData> {
  if (!cache) {
    cache = (async () => {
      const [meta, buf] = await Promise.all([
        fetch("/glass-box-rag/embedding-detail.json").then((r) => r.json()),
        fetch("/glass-box-rag/embedding-vectors.i8").then((r) => r.arrayBuffer()),
      ]);
      const byId = new Map<string, ChunkDetail>();
      for (const c of meta.chunks as ChunkDetail[]) byId.set(c.id, c);
      return { byId, vectors: new Int8Array(buf), dims: meta.dims, maxabs: meta.maxabs };
    })();
  }
  return cache;
}

/** The int8 vector for a chunk, as a view into the shared buffer. */
export function vectorFor(data: EmbeddingData, i: number): Int8Array {
  return data.vectors.subarray(i * data.dims, (i + 1) * data.dims);
}
