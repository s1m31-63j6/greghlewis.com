// Sub-cluster archetype derivation, client-side.
//
// Approach (mirrors the plan in project_nfl_phase5_resume.md §A):
//   1. Per position, run k-means on the (already-computed) UMAP coords of
//      historical prospects only — training_2014_2020 + validation_2021_2025.
//   2. For each cluster, compute the trait centroid (mean Sonnet trait score).
//   3. Compare cluster trait centroid to position-wide average; the
//      top-2 above-average traits form the "signature". Look up a
//      football-domain name from a heuristic table; fall back to a
//      descriptive label when no entry matches.
//   4. Project prediction_2026 prospects in by nearest cluster centroid in
//      UMAP space. They inherit that cluster's archetype label.
//
// Why client-side: zero AWS dependency, runs in <100ms over 1000 nodes,
// composes naturally with the existing useMemo bundle pipeline. If page-
// load cost ever matters we move it to a build-time script.

import type { CompNode, Position } from "./types";

// k chosen by Greg's eyeball estimate per memory: WR has more meaningful
// archetype variation (slot/X/vertical/technician) than the other slots.
const K_PER_POSITION: Record<Position, number> = {
  QB: 3,
  RB: 3,
  WR: 4,
  TE: 3,
};

const HISTORICAL_COHORTS = new Set([
  "training_2014_2020",
  "validation_2021_2025",
]);

// Skip these "summary" trait keys — they're meta-grades, not the
// underlying archetype dimensions, and including them muddies signatures.
const NON_ARCHETYPE_TRAITS = new Set(["ceiling", "floor"]);

export interface Archetype {
  id: string; // e.g. "WR/0", "QB/1"
  position: Position;
  label: string;
  centroid: [number, number, number]; // UMAP-coord centroid
  traitDelta: Record<string, number>; // cluster_avg − position_avg, per trait
  size: number; // member count (historical only)
  topTraits: { key: string; delta: number }[]; // sorted desc
}

// Heuristic table: (position, top trait key) -> archetype name.
// Seeded with football-domain archetype vocabulary. The cluster's
// strongest above-average trait determines the look-up.
const NAME_BY_TOP_TRAIT: Record<Position, Record<string, string>> = {
  QB: {
    processing_speed: "Pocket processor",
    decision_making: "Pocket processor",
    pocket_presence: "Pocket processor",
    accuracy_short: "Rhythm passer",
    accuracy_intermediate: "Rhythm passer",
    accuracy_deep: "Vertical thrower",
    arm_strength: "Big-arm",
    mobility: "Dual-threat",
    breakaway_speed: "Dual-threat",
    elusiveness: "Improviser",
    toughness: "Gamer",
  },
  RB: {
    contact_balance: "Power back",
    physicality_blocking: "Power back",
    pass_protection: "Three-down back",
    receiving_chops: "Pass-game back",
    three_down_versatility: "Three-down back",
    breakaway_speed: "Home-run threat",
    vertical_speed: "Home-run threat",
    elusiveness: "Scatback",
    mobility: "Scatback",
    workload_durability: "Workhorse",
  },
  WR: {
    contested_catch: "Big-body X",
    physicality_blocking: "Big-body X",
    receiving_radius: "Big-body X",
    separation_quickness: "Slot separator",
    slot_outside_versatility: "Slot separator",
    vertical_speed: "Vertical threat",
    yac_ability: "YAC threat",
    route_tree_breadth: "Route technician",
    hands_consistency: "Route technician",
  },
  TE: {
    blocking_inline: "Inline Y",
    physicality_blocking: "Inline Y",
    blocking_in_space: "Move TE",
    receiving_radius: "Receiving F",
    receiving_chops: "Receiving F",
    route_tree_breadth: "Move TE",
    formation_versatility: "Hybrid TE",
    contested_catch: "Red-zone TE",
  },
};

// k-means++ seeding — pick the first center at random, then each subsequent
// center proportional to squared distance from the nearest existing center.
// Cuts the chance of a degenerate init that converges to a poor local opt.
function kMeansPlusPlusInit(
  points: number[][],
  k: number,
  rng: () => number,
): number[][] {
  const n = points.length;
  if (n === 0) return [];
  const centers: number[][] = [points[Math.floor(rng() * n)]];
  while (centers.length < k) {
    const dists = points.map((p) => {
      let min = Infinity;
      for (const c of centers) {
        const d = squaredDist(p, c);
        if (d < min) min = d;
      }
      return min;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    if (total === 0) {
      centers.push(points[Math.floor(rng() * n)]);
      continue;
    }
    const target = rng() * total;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += dists[i];
      if (acc >= target) {
        centers.push(points[i]);
        break;
      }
    }
  }
  return centers.map((c) => [...c]);
}

function squaredDist(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

// Deterministic-ish RNG seeded from a string. The seed is a hash of the
// position so different positions don't share init quirks; same position
// across page loads gets stable archetype assignments.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Standard Lloyd's iteration. Caps at 50 iters; stops early when no
// assignment changes between rounds.
function kMeans(
  points: number[][],
  k: number,
  seed: string,
): { centroids: number[][]; assignments: number[] } {
  const n = points.length;
  if (n === 0 || k === 0) return { centroids: [], assignments: [] };
  if (n <= k) {
    return {
      centroids: points.map((p) => [...p]),
      assignments: points.map((_, i) => i),
    };
  }
  const rng = mulberry32(hashSeed(seed));
  let centroids = kMeansPlusPlusInit(points, k, rng);
  const assignments = new Array<number>(n).fill(-1);

  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestK = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = squaredDist(points[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestK = c;
        }
      }
      if (assignments[i] !== bestK) {
        assignments[i] = bestK;
        changed = true;
      }
    }
    if (!changed && iter > 0) break;
    const sums: number[][] = Array.from({ length: k }, () => new Array<number>(points[0].length).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c] += 1;
      for (let d = 0; d < points[i].length; d++) sums[c][d] += points[i][d];
    }
    centroids = sums.map((s, c) => {
      if (counts[c] === 0) {
        // Empty cluster — re-seed at a random point to avoid permanent drop.
        return [...points[Math.floor(rng() * n)]];
      }
      return s.map((v) => v / counts[c]);
    });
  }
  return { centroids, assignments };
}

function nearestCentroid(p: number[], centroids: number[][]): number {
  let bestK = 0;
  let bestD = Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const d = squaredDist(p, centroids[c]);
    if (d < bestD) {
      bestD = d;
      bestK = c;
    }
  }
  return bestK;
}

function positionTraitAverage(
  nodes: CompNode[],
): Record<string, number> {
  const sums = new Map<string, [number, number]>();
  for (const n of nodes) {
    if (!n.traits) continue;
    for (const [k, v] of Object.entries(n.traits)) {
      if (NON_ARCHETYPE_TRAITS.has(k)) continue;
      if (v.score == null) continue;
      const cur = sums.get(k) ?? [0, 0];
      cur[0] += v.score;
      cur[1] += 1;
      sums.set(k, cur);
    }
  }
  const out: Record<string, number> = {};
  for (const [k, [s, c]] of sums) if (c > 0) out[k] = s / c;
  return out;
}

function clusterTraitCentroid(
  members: CompNode[],
): Record<string, number> {
  return positionTraitAverage(members);
}

function pickArchetypeName(
  position: Position,
  traitDelta: Record<string, number>,
  used: Set<string>,
): string {
  const sorted = Object.entries(traitDelta)
    .filter(([k]) => !NON_ARCHETYPE_TRAITS.has(k))
    .sort((a, b) => b[1] - a[1]);
  const lookup = NAME_BY_TOP_TRAIT[position];
  // Walk the top-3 traits; first that maps to a name we haven't already
  // assigned wins. Prevents duplicates when two clusters share the top
  // trait (rare, but possible with k=4 WR).
  for (const [k] of sorted.slice(0, 3)) {
    const name = lookup[k];
    if (name && !used.has(name)) return name;
  }
  // Fallback: descriptive name from the strongest above-average trait.
  const [topKey] = sorted[0] ?? [];
  if (!topKey) return `${position} archetype`;
  const pretty = topKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${pretty}-leaning ${position}`;
}

export interface ArchetypeAssignments {
  archetypeById: Map<string, Archetype>; // archetype id -> Archetype
  nodeArchetype: Map<string, string>; // player_id -> archetype id
}

export function deriveArchetypes(nodes: CompNode[]): ArchetypeAssignments {
  const archetypeById = new Map<string, Archetype>();
  const nodeArchetype = new Map<string, string>();

  const byPosition: Record<Position, CompNode[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
  };
  for (const n of nodes) byPosition[n.position]?.push(n);

  for (const position of ["QB", "RB", "WR", "TE"] as Position[]) {
    const positionNodes = byPosition[position];
    const historical = positionNodes.filter(
      (n) =>
        HISTORICAL_COHORTS.has(n.cohort) &&
        n.x !== null &&
        n.y !== null &&
        n.z !== null,
    );
    if (historical.length === 0) continue;
    const k = K_PER_POSITION[position];
    const points = historical.map((n) => [n.x as number, n.y as number, n.z as number]);
    const { centroids, assignments } = kMeans(points, k, position);

    const positionAvg = positionTraitAverage(positionNodes);
    const usedNames = new Set<string>();

    // Build Archetype records first (so naming can dedupe across clusters).
    const drafts: Archetype[] = [];
    for (let c = 0; c < centroids.length; c++) {
      const members = historical.filter((_, i) => assignments[i] === c);
      const clusterAvg = clusterTraitCentroid(members);
      const traitDelta: Record<string, number> = {};
      for (const k of new Set([
        ...Object.keys(positionAvg),
        ...Object.keys(clusterAvg),
      ])) {
        traitDelta[k] = (clusterAvg[k] ?? 0) - (positionAvg[k] ?? 0);
      }
      const topTraits = Object.entries(traitDelta)
        .map(([key, delta]) => ({ key, delta }))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);
      drafts.push({
        id: `${position}/${c}`,
        position,
        label: "", // filled below in size order
        centroid: [centroids[c][0], centroids[c][1], centroids[c][2]],
        traitDelta,
        size: members.length,
        topTraits,
      });
    }

    // Name in descending size order so the largest, most representative
    // cluster claims the most-canonical name first.
    drafts.sort((a, b) => b.size - a.size);
    for (const a of drafts) {
      a.label = pickArchetypeName(position, a.traitDelta, usedNames);
      usedNames.add(a.label);
    }

    // Assign historical members to their k-means cluster id.
    drafts.forEach((arch) => {
      archetypeById.set(arch.id, arch);
    });
    historical.forEach((n, i) => {
      const draftIdx = drafts.findIndex(
        (d) => d.id === `${position}/${assignments[i]}`,
      );
      if (draftIdx >= 0) nodeArchetype.set(n.id, drafts[draftIdx].id);
    });

    // Project 2026 (and any other non-historical cohorts) by nearest
    // centroid in UMAP space.
    const draftCentroids = centroids;
    const nonHistorical = positionNodes.filter(
      (n) =>
        !HISTORICAL_COHORTS.has(n.cohort) &&
        n.x !== null &&
        n.y !== null &&
        n.z !== null,
    );
    for (const n of nonHistorical) {
      const idx = nearestCentroid(
        [n.x as number, n.y as number, n.z as number],
        draftCentroids,
      );
      nodeArchetype.set(n.id, `${position}/${idx}`);
    }
  }

  return { archetypeById, nodeArchetype };
}
