// Leader metadata loader. corpus.meta.json is the small (no-embeddings)
// companion to corpus.json — safe to import from server components for
// SSR dropdown population.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { CorpusMeta, Leader } from "./types";

let _metaPromise: Promise<CorpusMeta> | null = null;

export function loadMeta(): Promise<CorpusMeta> {
  if (!_metaPromise) {
    _metaPromise = (async () => {
      const p = path.join(process.cwd(), "src/lib/religious-voices/corpus.meta.json");
      const raw = await fs.readFile(p, "utf8");
      return JSON.parse(raw) as CorpusMeta;
    })();
  }
  return _metaPromise;
}

export async function getLeader(leaderId: string): Promise<Leader | null> {
  const meta = await loadMeta();
  return meta.leaders.find((l) => l.leader_id === leaderId) ?? null;
}
