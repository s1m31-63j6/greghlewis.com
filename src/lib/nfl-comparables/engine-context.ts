// Pull a player's top quantitative comparables from the comp_graph.json
// bundle so the chat synthesis prompt can show Sonnet what the engine
// "thinks" about the player. Without this, RAG answers happen in a vacuum
// and may directly contradict the side-panel comp list (Brugler bullish on
// Mendoza vs. the model's comps being mostly Role Players).

import fs from "node:fs/promises";
import path from "node:path";

interface BundleNode {
  id: string;
  name: string;
  position: string;
  cohort: string;
  outcome_class: string | null;
}

interface BundleEdge {
  source: string;
  target: string;
  similarity: number;
  in_graph: boolean;
}

interface Bundle {
  nodes: BundleNode[];
  edges: BundleEdge[];
}

let _bundle: Bundle | null = null;
let _byId: Map<string, BundleNode> | null = null;

async function loadBundle(): Promise<Bundle> {
  if (_bundle) return _bundle;
  const p = path.join(
    process.cwd(),
    "public/projects/nfl-prospect-comparables/comp_graph.json",
  );
  const raw = await fs.readFile(p, "utf-8");
  _bundle = JSON.parse(raw) as Bundle;
  _byId = new Map(_bundle.nodes.map((n) => [n.id, n]));
  return _bundle;
}

export interface EngineComp {
  name: string;
  position: string;
  cohort: string;
  outcomeClass: string | null;
  similarity: number;
}

// Top-K comparables for a player, deduped (engine emits A→B and B→A; keep
// the higher-sim direction per pair) and sorted by similarity desc.
export async function topCompsForPlayer(
  playerId: string,
  k: number = 5,
): Promise<EngineComp[]> {
  const bundle = await loadBundle();
  if (!_byId) return [];

  const bestByOther = new Map<string, BundleEdge>();
  for (const e of bundle.edges) {
    if (e.source !== playerId && e.target !== playerId) continue;
    const otherId = e.source === playerId ? e.target : e.source;
    const existing = bestByOther.get(otherId);
    if (!existing || e.similarity > existing.similarity) {
      bestByOther.set(otherId, e);
    }
  }

  const comps: EngineComp[] = [];
  for (const [otherId, edge] of bestByOther) {
    const other = _byId.get(otherId);
    if (!other) continue;
    comps.push({
      name: other.name,
      position: other.position,
      cohort: other.cohort,
      outcomeClass: other.outcome_class,
      similarity: edge.similarity,
    });
  }
  comps.sort((a, b) => b.similarity - a.similarity);
  return comps.slice(0, k);
}

// Render a compact string for inclusion in the synthesis prompt.
// Outcome class is the most informative signal — it tells Sonnet whether
// the model's comp set tilts bust/role-player or starter/Pro Bowl.
export function formatComps(playerName: string, comps: EngineComp[]): string {
  if (comps.length === 0) return "";
  const lines = comps.map((c) => {
    const outcome = c.outcomeClass ?? "—";
    return `  - ${c.name} (${c.position}, ${outcome})`;
  });
  return `Quantitative comp engine — top comparables for ${playerName} (sorted by similarity):\n${lines.join("\n")}`;
}
