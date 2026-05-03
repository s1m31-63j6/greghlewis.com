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
  career_av: number | null;
  peak_av: number | null;
  bio: { college: string | null; height_in: number | null; weight_lb: number | null };
  draft: { year: number | null; round: number | null; pick: number | null };
  traits: Record<string, { score: number | null; quote: string | null }> | null;
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

// Cross-cohort matches: starting from a historical reference player, find
// the 2026 prospects most similar to them via the existing comp graph.
// Drives the "find a Saquon-style runner" / "who's the next X" intent.
export interface CrossCohortMatch {
  id: string;
  name: string;
  position: string;
  similarity: number;
  college: string | null;
  draftYear: number | null;
}

export async function find2026CompsFor(
  referencePlayerId: string,
  k: number = 4,
): Promise<CrossCohortMatch[]> {
  const bundle = await loadBundle();
  if (!_byId) return [];

  const matches: CrossCohortMatch[] = [];
  for (const e of bundle.edges) {
    let otherId: string | null = null;
    if (e.source === referencePlayerId) otherId = e.target;
    else if (e.target === referencePlayerId) otherId = e.source;
    if (!otherId) continue;
    const other = _byId.get(otherId);
    if (!other || other.cohort !== "prediction_2026") continue;
    matches.push({
      id: other.id,
      name: other.name,
      position: other.position,
      similarity: e.similarity,
      college: other.bio?.college ?? null,
      draftYear: other.draft?.year ?? null,
    });
  }
  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, k);
}

// All 2026 prospects, optionally filtered by position. Used by class-level
// queries to compose a summary of who's in the class.
export interface ClassMember {
  id: string;
  name: string;
  position: string;
  college: string | null;
  // Top trait scores (5 = elite, 3 = average) — drives the "headline trait"
  // of the class summary.
  topTraits: { key: string; score: number }[];
  ceiling: number | null;
  floor: number | null;
}

export async function loadClassByYear(
  year: number,
  position: string | null = null,
): Promise<ClassMember[]> {
  const bundle = await loadBundle();
  return bundle.nodes
    .filter((n) => n.draft?.year === year)
    .filter((n) => position === null || n.position === position)
    .map((n) => {
      const traits = n.traits ?? {};
      const top = Object.entries(traits)
        .filter(([k, v]) => v.score != null && k !== "ceiling" && k !== "floor")
        .map(([k, v]) => ({ key: k, score: v.score as number }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      return {
        id: n.id,
        name: n.name,
        position: n.position,
        college: n.bio?.college ?? null,
        topTraits: top,
        ceiling: traits.ceiling?.score ?? null,
        floor: traits.floor?.score ?? null,
      };
    });
}

// Compose a class summary block for the synthesis prompt. Position scope
// + draft year drives a "who's headline" + ceiling/floor avg + dominant
// archetype-trait counts. One block per year — the caller stitches them
// together for year-over-year comparisons.
export async function summarizeClassByYear(
  year: number,
  position: string | null,
): Promise<string> {
  const members = await loadClassByYear(year, position);
  if (members.length === 0) {
    return `${year} ${position ?? "all-position"} class — no prospects in pool (data not available for this year/position).`;
  }
  const ceilingMembers = members.filter((m) => m.ceiling != null);
  const floorMembers = members.filter((m) => m.floor != null);
  // Headline prospects: top 5 by ceiling.
  const headline = [...ceilingMembers]
    .sort((a, b) => {
      const c = (b.ceiling ?? 0) - (a.ceiling ?? 0);
      return c !== 0 ? c : (b.floor ?? 0) - (a.floor ?? 0);
    })
    .slice(0, 5);
  // Dominant traits: count of prospects scoring 4+ on each trait. Tells
  // the model what archetype is well-represented in this class.
  const traitCounts = new Map<string, number>();
  for (const m of members) {
    for (const t of m.topTraits) {
      if (t.score >= 4) traitCounts.set(t.key, (traitCounts.get(t.key) ?? 0) + 1);
    }
  }
  const dominantTraits = Array.from(traitCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, n]) => `${k.replace(/_/g, " ")} (${n})`);

  const avgCeiling = ceilingMembers.length > 0
    ? ceilingMembers.reduce((s, m) => s + (m.ceiling ?? 0), 0) / ceilingMembers.length
    : null;
  const avgFloor = floorMembers.length > 0
    ? floorMembers.reduce((s, m) => s + (m.floor ?? 0), 0) / floorMembers.length
    : null;
  // Position split is helpful when the query doesn't pin a position.
  const posCounts = new Map<string, number>();
  for (const m of members) posCounts.set(m.position, (posCounts.get(m.position) ?? 0) + 1);
  const posMix = Array.from(posCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${p}:${n}`)
    .join(", ");

  const posLabel = position ?? "all-position";
  return [
    `${year} ${posLabel} class — ${members.length} prospects in pool (${posMix})`,
    `Headline (top ceiling): ${headline.map((m) => `${m.name} (${m.position}, ${m.college ?? "—"})`).join(", ")}`,
    `Dominant trait strengths (count of prospects scored 4+): ${dominantTraits.join(", ")}`,
    `Average ceiling grade: ${avgCeiling !== null ? avgCeiling.toFixed(2) + "/5" : "n/a"}`,
    `Average floor grade: ${avgFloor !== null ? avgFloor.toFixed(2) + "/5" : "n/a"}`,
  ].join("\n");
}

// Multi-year wrapper — composes one block per year and concatenates with
// blank lines. Used when the user asks "compare 2026 to 2025" etc.
export async function summarizeClassMulti(
  years: number[],
  position: string | null,
): Promise<string> {
  if (years.length === 0) return "";
  const blocks = await Promise.all(
    years.map((y) => summarizeClassByYear(y, position)),
  );
  return blocks.filter(Boolean).join("\n\n");
}

// Format cross-cohort matches as an engine context block for the synthesis
// prompt. The bot uses this to answer "who's the next X" questions.
export function formatCrossCohortMatches(
  referenceName: string,
  matches: CrossCohortMatch[],
): string {
  if (matches.length === 0) {
    return `Cross-cohort comp lookup — no 2026 prospect appears in the comp engine's top-K neighborhood for ${referenceName}.`;
  }
  const lines = matches.map(
    (m) => `  - ${m.name} (${m.position}, ${m.college ?? "—"})`,
  );
  return `Cross-cohort comp engine — 2026 prospects in ${referenceName}'s comp neighborhood (sorted by similarity):\n${lines.join("\n")}`;
}
