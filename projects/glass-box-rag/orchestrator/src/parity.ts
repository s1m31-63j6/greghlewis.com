/**
 * Parity check: does the TypeScript retrieval core agree with the Python reference?
 *
 * The evaluation harness measured the Python implementation. If the TS port drifts,
 * every published number becomes a claim about code that isn't running. This compares
 * BM25 rankings (the part most likely to diverge — tokenization, idf, tie-breaks)
 * against `../parity_reference.json`, produced by `uv run python parity_dump.py`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadIndex } from "./corpus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = join(HERE, "..", "..", "data", "build", "parity_reference.json");

interface Ref {
  queries: {
    q: string;
    bm25: { chunk_id: string; score: number }[];
    tokens: string[];
  }[];
}

const ref = JSON.parse(readFileSync(REF, "utf8")) as Ref;
const index = loadIndex();

let failures = 0;
for (const item of ref.queries) {
  const mine = index.bm25(item.q, item.bm25.length);
  const mineIds = mine.map((h) => index.chunks[h.idx].id);
  const refIds = item.bm25.map((r) => r.chunk_id);

  const sameOrder = mineIds.join("|") === refIds.join("|");
  const overlap = mineIds.filter((id) => refIds.includes(id)).length;
  const maxDelta = Math.max(
    ...mine.map((h, i) => Math.abs(h.score - (item.bm25[i]?.score ?? 0))),
  );

  const ok = sameOrder && maxDelta < 1e-4;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${item.q.slice(0, 46).padEnd(48)} ` +
      `order=${sameOrder} overlap=${overlap}/${refIds.length} maxΔscore=${maxDelta.toExponential(2)}`,
  );
  if (!sameOrder) {
    console.log(`      ts : ${mineIds.slice(0, 5).join(", ")}`);
    console.log(`      py : ${refIds.slice(0, 5).join(", ")}`);
  }
}

console.log(failures === 0 ? "\nparity OK" : `\n${failures} queries diverged`);
process.exit(failures === 0 ? 0 : 1);
