// Server-side name resolver, ported from
// projects/nfl-prospect-comparables/engine/src/engine/rag/name_index.py.
// The Python version reads JSONL profiles from S3; here we use the same
// comp_graph.json bundle that the client loads, so dev mode doesn't need
// AWS credentials just to look up a name.

import fs from "node:fs/promises";
import path from "node:path";

interface PlayerEntry {
  playerId: string;
  name: string;
  position: string;
  cohort: string;
}

const COHORT_PRIORITY: Record<string, number> = {
  prediction_2026: 0,
  validation_2021_2025: 1,
  training_2014_2020: 2,
};

// Mirrors _STOPWORDS in name_index.py — capitalizable filler that shouldn't
// fuzzy-match against player names ("Best 2026 RB?" → "Best" is capitalized
// but isn't a name).
const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "is", "tell", "me", "about",
  "what", "who", "how", "why", "where", "when", "his", "her", "their",
  "show", "give", "can", "you", "from", "for", "as", "to", "with",
  "qb", "rb", "wr", "te", "quarterback", "running", "back", "wide",
  "receiver", "tight", "end", "draft", "prospect", "profile", "report",
  "scouting", "comp", "comps", "comparable", "compare", "comparison",
  "best", "top", "find", "list", "good", "bad", "describe", "summary",
  "summarize", "explain", "look", "looks", "looking", "rank", "rate",
  "rated", "year", "years", "season", "seasons", "class", "classes",
  "vs", "versus", "between", "than",
]);

let _index: PlayerEntry[] | null = null;

async function loadIndex(): Promise<PlayerEntry[]> {
  if (_index) return _index;
  const bundlePath = path.join(
    process.cwd(),
    "public/projects/nfl-prospect-comparables/comp_graph.json",
  );
  const raw = await fs.readFile(bundlePath, "utf-8");
  const data = JSON.parse(raw) as {
    nodes: { id: string; name: string; position: string; cohort: string }[];
  };
  // Sort longest-name-first so substring search is greedy ("Marvin Harrison Jr"
  // wins over "Marvin Harrison").
  _index = data.nodes
    .filter((n) => n.id && n.name)
    .map((n) => ({
      playerId: n.id,
      name: n.name,
      position: n.position,
      cohort: n.cohort,
    }))
    .sort((a, b) => {
      const lenDiff = b.name.length - a.name.length;
      if (lenDiff !== 0) return lenDiff;
      return (
        (COHORT_PRIORITY[a.cohort] ?? 99) - (COHORT_PRIORITY[b.cohort] ?? 99)
      );
    });
  return _index;
}

function lastName(name: string): string {
  const parts = name.split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

function firstName(name: string): string {
  const parts = name.split(/\s+/);
  return parts[0] ?? "";
}

function queryTokens(query: string): Set<string> {
  return new Set(
    (query.toLowerCase().match(/[a-z][a-z'\-]+/g) ?? []).filter(
      (t) => t.length >= 3 && !STOPWORDS.has(t),
    ),
  );
}

function capitalizedTokens(query: string): string[] {
  return (query.match(/[A-Z][A-Za-z'\-]+/g) ?? [])
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

function levenshteinAtMost(a: string, b: string, maxDist: number): boolean {
  if (Math.abs(a.length - b.length) > maxDist) return false;
  if (a === b) return true;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i, ...new Array<number>(b.length).fill(0)];
    let minRow = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < minRow) minRow = curr[j];
    }
    if (minRow > maxDist) return false;
    prev = curr;
  }
  return prev[b.length] <= maxDist;
}

function rankByCohort(entries: PlayerEntry[]): PlayerEntry[] {
  return [...entries].sort((a, b) => {
    const c =
      (COHORT_PRIORITY[a.cohort] ?? 99) - (COHORT_PRIORITY[b.cohort] ?? 99);
    if (c !== 0) return c;
    return b.name.length - a.name.length;
  });
}

export interface ResolvedPlayers {
  // Distinct players named in the query, ordered by their first appearance.
  // Each item is one resolution group (a player + any cohort namesakes).
  groups: { primary: PlayerEntry; candidates: PlayerEntry[]; tier: string }[];
}

// Resolve ALL distinct players named in the query (Python's resolve_name only
// returned the first hit). For "compare Stroud and Mendoza" we need both
// players surfaced so the chat path can do per-player retrieval.
export async function resolveNames(query: string): Promise<ResolvedPlayers> {
  const index = await loadIndex();
  const q = query.toLowerCase();
  const groups: ResolvedPlayers["groups"] = [];
  const seen = new Set<string>();

  // Tier 1: full-name substring. Greedy longest-first so "Marvin Harrison Jr"
  // doesn't get shadowed by "Marvin Harrison".
  let consumed = q;
  for (const e of index) {
    const lc = e.name.toLowerCase();
    if (consumed.includes(lc) && !seen.has(e.playerId)) {
      // Group with cohort namesakes (same exact name, different cohort).
      const namesakes = index.filter(
        (x) => x.name.toLowerCase() === lc && !seen.has(x.playerId),
      );
      const ranked = rankByCohort(namesakes);
      for (const x of ranked) seen.add(x.playerId);
      groups.push({
        primary: ranked[0],
        candidates: ranked,
        tier: namesakes.length > 1 ? "ambiguous_full" : "exact",
      });
      // Remove the matched span so longer-named players don't double-count.
      consumed = consumed.split(lc).join("");
    }
  }
  if (groups.length > 0) return { groups };

  // Tier 2: last-name token match (only if no full-name hit at all — this
  // tier is noisier, e.g. "Williams" matches dozens of players).
  const tokens = queryTokens(query);
  if (tokens.size > 0) {
    const lastHits = index.filter((e) => {
      const ln = lastName(e.name).toLowerCase();
      return ln.length >= 3 && tokens.has(ln);
    });
    const firstHits = index.filter((e) => {
      const fn = firstName(e.name).toLowerCase();
      return fn.length >= 5 && tokens.has(fn);
    });
    // Pair last+first when same player matches both tokens.
    const firstIds = new Set(firstHits.map((e) => e.playerId));
    const both = lastHits.filter((e) => firstIds.has(e.playerId));
    const hits = both.length > 0 ? both : lastHits.length > 0 ? lastHits : firstHits;
    if (hits.length > 0) {
      // Group hits by last-name (one group per surname). For a query like
      // "Stroud" with one Stroud in the index, that's one group of one.
      const byLast = new Map<string, PlayerEntry[]>();
      for (const h of hits) {
        const k = lastName(h.name).toLowerCase();
        const arr = byLast.get(k) ?? [];
        arr.push(h);
        byLast.set(k, arr);
      }
      for (const [, ents] of byLast) {
        const ranked = rankByCohort(ents);
        groups.push({
          primary: ranked[0],
          candidates: ranked,
          tier: ents.length === 1 ? "exact" : "last_name",
        });
      }
      return { groups };
    }
  }

  // Tier 3: fuzzy. Lev≤1 against capitalized tokens that LOOK like names.
  const capTokens = capitalizedTokens(query);
  if (capTokens.length > 0) {
    const fuzzy = new Map<string, PlayerEntry>();
    for (const e of index) {
      const ln = lastName(e.name).toLowerCase();
      const fn = firstName(e.name).toLowerCase();
      for (const tok of capTokens) {
        if (
          (ln.length >= 4 && levenshteinAtMost(tok, ln, 1)) ||
          (fn.length >= 4 && levenshteinAtMost(tok, fn, 1))
        ) {
          fuzzy.set(e.playerId, e);
          break;
        }
      }
    }
    if (fuzzy.size > 0) {
      const ranked = rankByCohort(Array.from(fuzzy.values())).slice(0, 5);
      groups.push({ primary: ranked[0], candidates: ranked, tier: "fuzzy" });
    }
  }

  return { groups };
}

// Given an answer string, return distinct player_ids whose names appear in
// it. Greedy longest-first for full names ("Marvin Harrison Jr" beats
// "Marvin Harrison"), then a second pass over UNIQUE last names so answers
// that say "Mendoza" rather than "Fernando Mendoza" still match. Common
// surnames (Williams, Smith) match many players, so they're skipped to
// avoid false-positive viz highlights.
export async function extractMentions(answer: string): Promise<string[]> {
  const index = await loadIndex();
  const seen = new Set<string>();
  const ids: string[] = [];
  let consumed = answer.toLowerCase();

  for (const e of index) {
    const lc = e.name.toLowerCase();
    if (consumed.includes(lc) && !seen.has(e.playerId)) {
      seen.add(e.playerId);
      ids.push(e.playerId);
      consumed = consumed.split(lc).join("");
    }
  }

  const lastNameCounts = new Map<string, number>();
  for (const e of index) {
    const ln = lastName(e.name).toLowerCase();
    if (ln.length >= 4) {
      lastNameCounts.set(ln, (lastNameCounts.get(ln) ?? 0) + 1);
    }
  }
  // Word-boundary scan against the lowercased answer so "Stroud" matches
  // but "stroudly" wouldn't (none of these exist, but it's defensive).
  const tokens = new Set(consumed.match(/[a-z][a-z'\-]+/g) ?? []);
  for (const e of index) {
    if (seen.has(e.playerId)) continue;
    const ln = lastName(e.name).toLowerCase();
    if (ln.length < 4) continue;
    if ((lastNameCounts.get(ln) ?? 0) !== 1) continue; // skip ambiguous surnames
    if (tokens.has(ln)) {
      seen.add(e.playerId);
      ids.push(e.playerId);
    }
  }
  return ids;
}

export async function lookupPlayer(playerId: string): Promise<PlayerEntry | null> {
  const index = await loadIndex();
  return index.find((e) => e.playerId === playerId) ?? null;
}
