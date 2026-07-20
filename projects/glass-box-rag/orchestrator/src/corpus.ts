/**
 * Corpus loading.
 *
 * The artifacts total ~6 MB (2.9 MB chunks + 3.0 MB vectors), which fits
 * comfortably in a Lambda deployment package — so they are bundled rather than
 * pulled from S3 on cold start. That removes an S3 round trip, an IAM policy,
 * and a failure mode, for a corpus this size.
 *
 * Loaded once per cold start and cached in module scope.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Index, type Chunk } from "./retrieval.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// Resolved relative to the bundle so it works both in the Lambda and locally.
const DATA = process.env.GBRAG_DATA_DIR ?? join(HERE, "..", "..", "data", "build");

export interface CitationEdge {
  source: string;
  target: string;
  weight: number;
}

let _index: Index | undefined;
let _edges: CitationEdge[] | undefined;

export function loadIndex(): Index {
  if (_index) return _index;
  const chunks = JSON.parse(readFileSync(join(DATA, "chunks.json"), "utf8")) as Chunk[];
  const meta = JSON.parse(
    readFileSync(join(DATA, "vectors-titan.meta.json"), "utf8"),
  ) as { dims: number; count: number };
  const buf = readFileSync(join(DATA, "vectors-titan.bin"));
  const vectors = new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  if (vectors.length !== meta.count * meta.dims) {
    throw new Error(
      `vector file is ${vectors.length} floats, expected ${meta.count * meta.dims}`,
    );
  }
  if (chunks.length !== meta.count) {
    throw new Error(`chunks (${chunks.length}) and vectors (${meta.count}) disagree`);
  }
  _index = new Index(chunks, vectors, meta.dims);
  return _index;
}

export function loadEdges(): CitationEdge[] {
  if (!_edges) {
    _edges = JSON.parse(readFileSync(join(DATA, "citation_edges.json"), "utf8")) as CitationEdge[];
  }
  return _edges;
}

/** Cases cited by any of `caseIds`, heaviest edge first, excluding ones already seen. */
export function citedBy(caseIds: string[], exclude: Set<string>): CitationEdge[] {
  const src = new Set(caseIds);
  return loadEdges()
    .filter((e) => src.has(e.source) && !exclude.has(e.target))
    .sort((a, b) => b.weight - a.weight);
}
