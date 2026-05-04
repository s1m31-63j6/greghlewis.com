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
  bio: {
    college: string | null;
    height_in: number | null;
    weight_lb: number | null;
    age_at_draft?: number | null;
    hometown_state?: string | null;
  };
  draft: { year: number | null; round: number | null; pick: number | null };
  athletic?: {
    forty_yard: number | null;
    vertical_in: number | null;
    broad_jump_in: number | null;
    three_cone: number | null;
    shuttle: number | null;
    bench_reps: number | null;
  };
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

  // The bundle stores BOTH directions of an edge (A→B and B→A) when both
  // sides have each other in their top-K. Dedupe by the other-player id,
  // keeping the higher similarity per pair.
  const bestByOther = new Map<string, BundleEdge>();
  for (const e of bundle.edges) {
    let otherId: string | null = null;
    if (e.source === referencePlayerId) otherId = e.target;
    else if (e.target === referencePlayerId) otherId = e.source;
    if (!otherId) continue;
    const other = _byId.get(otherId);
    if (!other || other.cohort !== "prediction_2026") continue;
    const existing = bestByOther.get(otherId);
    if (!existing || e.similarity > existing.similarity) {
      bestByOther.set(otherId, e);
    }
  }

  const matches: CrossCohortMatch[] = [];
  for (const [otherId, e] of bestByOther) {
    const other = _byId.get(otherId)!;
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

// Bucket the average of a 1-5 trait score into qualitative tiers. Anchored
// against the population mean (~3.0). Used to keep raw decimals out of the
// prompt context — the bot would otherwise quote them verbatim, and the
// reader has no methodology document to interpret "2.81/5".
function tierFromScale(avg: number): string {
  if (avg >= 3.4) return "elite";
  if (avg >= 3.15) return "strong";
  if (avg >= 2.9) return "average";
  if (avg >= 2.65) return "modest";
  return "thin";
}

function breadthLabel(n: number): string {
  if (n >= 60) return "deep";
  if (n >= 35) return "average-depth";
  if (n >= 18) return "narrow";
  return "very narrow";
}

// Compose a class summary block for the synthesis prompt. Strictly
// qualitative — no decimals, no prospect counts, no "X scored 4+" rubric
// numbers. The bot answers in plain editorial prose, so the prompt feeds
// it tier labels (thin/modest/average/strong/elite) rather than raw 1-5
// averages it would otherwise repeat verbatim.
export async function summarizeClassByYear(
  year: number,
  position: string | null,
): Promise<string> {
  const members = await loadClassByYear(year, position);
  const posLabel = position ?? "all-position";
  if (members.length === 0) {
    return `${year} ${posLabel} class — no prospects in pool (data not available for this year/position).`;
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
  // Standout traits: prevalence-ordered list of traits where 4+ scores
  // appear in the class. No counts — the order alone tells the model
  // what archetype is well-represented.
  const traitCounts = new Map<string, number>();
  for (const m of members) {
    for (const t of m.topTraits) {
      if (t.score >= 4) traitCounts.set(t.key, (traitCounts.get(t.key) ?? 0) + 1);
    }
  }
  const dominantTraits = Array.from(traitCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k.replace(/_/g, " "));

  const avgCeiling = ceilingMembers.length > 0
    ? ceilingMembers.reduce((s, m) => s + (m.ceiling ?? 0), 0) / ceilingMembers.length
    : null;
  const avgFloor = floorMembers.length > 0
    ? floorMembers.reduce((s, m) => s + (m.floor ?? 0), 0) / floorMembers.length
    : null;
  const posMix = position
    ? null
    : Array.from(
        members
          .reduce((acc, m) => acc.set(m.position, (acc.get(m.position) ?? 0) + 1), new Map<string, number>())
          .entries(),
      )
        .sort((a, b) => b[1] - a[1])
        .map(([p]) => p)
        .join(", ");

  const lines = [
    `${year} ${posLabel} class`,
    `Class breadth: ${breadthLabel(members.length)}`,
  ];
  if (posMix) lines.push(`Positions represented (most common first): ${posMix}`);
  lines.push(
    `Headline (top upside): ${headline.map((m) => `${m.name} (${m.position}, ${m.college ?? "—"})`).join(", ")}`,
  );
  if (dominantTraits.length > 0) {
    lines.push(`Most prevalent class-level strengths: ${dominantTraits.join(", ")}`);
  }
  lines.push(
    `Top-end upside profile: ${avgCeiling !== null ? tierFromScale(avgCeiling) : "unknown"}`,
    `Floor / safety profile: ${avgFloor !== null ? tierFromScale(avgFloor) : "unknown"}`,
  );
  return lines.join("\n");
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

// ----- Superlative queries (fastest QB, tallest WR, biggest TE, etc.) -----
//
// These are answered deterministically from the bundle's bio + athletic
// blocks, not from RAG retrieval. The bot only sees a structured top-N
// list with a coverage disclaimer ("3 of 10 QBs have a recorded 40").
// That coverage line is load-bearing — without it the bot would over-
// claim, since most 2026 prospects don't have full combine data yet.

export type SuperlativeMetric =
  | "forty_yard"
  | "vertical_in"
  | "broad_jump_in"
  | "three_cone"
  | "shuttle"
  | "bench_reps"
  | "height_in"
  | "weight_lb";

export interface SuperlativeSpec {
  metric: SuperlativeMetric;
  // ASC = lower is better (40 time, three-cone, shuttle).
  // DESC = higher is better (height, weight, vertical, broad jump, bench).
  direction: "asc" | "desc";
  // Display label used in the structured block headline.
  label: string;
  // Unit suffix for value formatting; "" if none.
  unit: string;
  // Decimal places for the formatted value.
  decimals: number;
}

function readMetric(node: BundleNode, m: SuperlativeMetric): number | null {
  if (m === "height_in") return node.bio.height_in ?? null;
  if (m === "weight_lb") return node.bio.weight_lb ?? null;
  return node.athletic?.[m] ?? null;
}

function formatHeight(inches: number): string {
  const ft = Math.floor(inches / 12);
  const inch = Math.round((inches - ft * 12) * 10) / 10;
  return `${ft}'${inch.toString().replace(/\.0$/, "")}"`;
}

function formatBroad(inches: number): string {
  const ft = Math.floor(inches / 12);
  const inch = Math.round((inches - ft * 12) * 10) / 10;
  return `${ft}'${inch.toString().replace(/\.0$/, "")}"`;
}

function formatValue(spec: SuperlativeSpec, v: number): string {
  if (spec.metric === "height_in") return formatHeight(v);
  if (spec.metric === "broad_jump_in") return formatBroad(v);
  return `${v.toFixed(spec.decimals)}${spec.unit}`;
}

// Compute the structured superlative block. Caller resolves the spec
// (metric + direction + display label) from the user query upstream.
export async function summarizeSuperlative(
  year: number,
  position: string | null,
  spec: SuperlativeSpec,
  topN: number = 3,
): Promise<string> {
  const bundle = await loadBundle();
  const inScope = bundle.nodes.filter(
    (n) =>
      n.draft?.year === year &&
      (position === null || n.position === position),
  );
  if (inScope.length === 0) {
    const posLabel = position ?? "all-position";
    return `Superlative query — ${spec.label} in ${year} ${posLabel} class: no prospects in pool.`;
  }
  const withMetric = inScope
    .map((n) => ({ node: n, value: readMetric(n, spec.metric) }))
    .filter((x): x is { node: BundleNode; value: number } => x.value !== null);
  const posLabel = position ?? "all-position";
  if (withMetric.length === 0) {
    return [
      `Superlative query — ${spec.label} in ${year} ${posLabel} class:`,
      `  No prospects in this cohort have a recorded ${spec.label}. ${inScope.length} prospects in pool, 0 with the measurable.`,
    ].join("\n");
  }
  withMetric.sort((a, b) =>
    spec.direction === "asc" ? a.value - b.value : b.value - a.value,
  );
  const top = withMetric.slice(0, topN);
  const lines = [
    `Superlative query — ${spec.label} in ${year} ${posLabel} class (best to ${topN === 1 ? "next-best" : Math.min(topN, withMetric.length) + "th-best"}):`,
  ];
  top.forEach(({ node, value }, i) => {
    lines.push(
      `  ${i + 1}. ${node.name} (${node.position}, ${node.bio.college ?? "—"}) — ${formatValue(spec, value)}`,
    );
  });
  // Coverage disclaimer is critical — without it the bot will treat the
  // top-1 as authoritative. Especially relevant for 2026 where only a
  // fraction of prospects have combined yet.
  lines.push(
    `Coverage: ${withMetric.length} of ${inScope.length} prospects in this cohort have a recorded ${spec.label}. ${
      withMetric.length < inScope.length
        ? "Treat this as a partial answer — name the leader but acknowledge the cohort gap."
        : "Full coverage."
    }`,
  );
  return lines.join("\n");
}
